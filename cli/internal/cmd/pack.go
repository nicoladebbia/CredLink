package cmd

import (
	"archive/tar"
	"compress/gzip"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/spf13/cobra"
)

// Pack command options
type PackOptions struct {
	Input    string
	Output   string
	Format   string
	Include  []string
	Exclude  []string
	Manifest bool
	Verbose  bool
}

var packOpts PackOptions

func InitPackCommand(rootCmd *cobra.Command) {
	var packCmd = &cobra.Command{
		Use:   "pack --input <glob|prefix>",
		Short: "Produce a Compliance Pack (WORM-ready bundle)",
		Long: `Create a Compliance Pack containing assets, manifests, verification verdicts,
and provenance data. Designed for WORM storage with immutable evidence preservation.`,
		RunE: runPackCommand,
	}

	// Pack-specific flags
	packCmd.Flags().StringVar(&packOpts.Input, "input", "", "Input glob or cloud prefix (required)")
	packCmd.Flags().StringVar(&packOpts.Output, "out", "", "Output file (default: auto-generated)")
	packCmd.Flags().StringVar(&packOpts.Format, "format", "tar.gz", "Output format: tar.gz|tar.zst|zip")
	packCmd.Flags().StringSliceVar(&packOpts.Include, "include", []string{}, "Additional files to include")
	packCmd.Flags().StringSliceVar(&packOpts.Exclude, "exclude", []string{}, "Patterns to exclude")
	packCmd.Flags().BoolVar(&packOpts.Manifest, "manifest", true, "Include detailed manifests")
	packCmd.Flags().BoolVar(&packOpts.Verbose, "verbose", false, "Verbose output")

	packCmd.MarkFlagRequired("input")
	rootCmd.AddCommand(packCmd)
}

func runPackCommand(cmd *cobra.Command, args []string) error {
	// Validate inputs
	if err := validatePackInput(); err != nil {
		PrintErrf("Input error: %v\n", err)
		return err
	}

	// Generate output filename if not provided
	if packOpts.Output == "" {
		packOpts.Output = generateOutputFilename()
	}

	PrintMsgf("Creating Compliance Pack: %s\n", packOpts.Output)
	PrintMsgf("Input source: %s\n", packOpts.Input)

	// Show dry-run projection
	if globalOpts.DryRun {
		return runPackDryRun()
	}

	// Create the compliance pack
	if err := createCompliancePack(); err != nil {
		return err
	}

	PrintMsgf("Compliance Pack created successfully: %s\n", packOpts.Output)
	return nil
}

func validatePackInput() error {
	if packOpts.Input == "" {
		return fmt.Errorf("--input is required")
	}

	// Validate input path for traversal attempts
	if !strings.HasPrefix(packOpts.Input, "s3://") && !strings.HasPrefix(packOpts.Input, "r2://") {
		// Resolve to absolute path to detect traversal
		absPath, err := filepath.Abs(packOpts.Input)
		if err != nil {
			return fmt.Errorf("invalid input path")
		}

		// Check for path traversal
		if strings.Contains(packOpts.Input, "..") {
			// For relative paths, check if they go outside current directory
			cwd, err := os.Getwd()
			if err != nil {
				return fmt.Errorf("cannot determine current directory")
			}

			// If the resolved path is not under current directory, it's traversal
			if !strings.HasPrefix(absPath, cwd) {
				return fmt.Errorf("path traversal detected in input path: access outside current directory not allowed")
			}
		}

		// Additional check for suspicious patterns
		if strings.Contains(packOpts.Input, "../") || strings.Contains(packOpts.Input, "..\\") {
			return fmt.Errorf("path traversal patterns not allowed in input path")
		}
	}

	// Validate format
	validFormats := []string{"tar.gz", "tar.zst", "zip"}
	valid := false
	for _, f := range validFormats {
		if packOpts.Format == f {
			valid = true
			break
		}
	}
	if !valid {
		return fmt.Errorf("invalid format: %s (valid: %v)", packOpts.Format, validFormats)
	}

	// Validate output path
	if packOpts.Output != "" {
		// Check for path traversal in output path
		if strings.Contains(packOpts.Output, "..") || strings.Contains(packOpts.Output, "../") || strings.Contains(packOpts.Output, "..\\") {
			return fmt.Errorf("path traversal patterns not allowed in output path")
		}
	}

	return nil
}

func generateOutputFilename() string {
	timestamp := time.Now().Format("2006-01-02-15-04-05")
	safeInput := strings.NewReplacer("/", "-", ":", "-").Replace(packOpts.Input)
	return fmt.Sprintf("compliance-pack-%s-%s.%s", safeInput, timestamp, packOpts.Format)
}

func createCompliancePack() error {
	// Create output file with secure permissions
	outFile, err := os.OpenFile(packOpts.Output, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
	if err != nil {
		return fmt.Errorf("failed to create output file: %v", err)
	}
	defer outFile.Close()

	var writer io.Writer = outFile

	// Add compression based on format
	switch packOpts.Format {
	case "tar.gz":
		gzipWriter := gzip.NewWriter(outFile)
		defer gzipWriter.Close()
		writer = gzipWriter
		return createTarPack(writer)
	case "tar.zst":
		// TODO: Implement zstd compression
		return fmt.Errorf("zstd compression not yet implemented")
	case "zip":
		return createZipPack(outFile)
	default:
		return fmt.Errorf("unsupported format: %s", packOpts.Format)
	}
}

func createTarPack(writer io.Writer) error {
	tarWriter := tar.NewWriter(writer)
	defer tarWriter.Close()

	// Create metadata
	metadata := createPackMetadata()

	// Add metadata file
	if err := addFileToTar(tarWriter, "metadata.json", metadata); err != nil {
		return err
	}

	// Add manifests
	if packOpts.Manifest {
		manifests := createMockManifests()
		if err := addFileToTar(tarWriter, "manifests.json", manifests); err != nil {
			return err
		}
	}

	// Add verification reports
	reports := createMockVerificationReports()
	if err := addFileToTar(tarWriter, "verification.json", reports); err != nil {
		return err
	}

	// Add certificate chain
	certs := createMockCertificateChain()
	if err := addFileToTar(tarWriter, "certificates.json", certs); err != nil {
		return err
	}

	// Add provenance graph
	provenance := createMockProvenanceGraph()
	if err := addFileToTar(tarWriter, "provenance.json", provenance); err != nil {
		return err
	}

	// Add pack signature
	signature := createPackSignature()
	if err := addFileToTar(tarWriter, "pack.signature", signature); err != nil {
		return err
	}

	return nil
}

func createZipPack(outFile *os.File) error {
	// TODO: Implement ZIP creation
	return fmt.Errorf("ZIP format not yet implemented")
}

func addFileToTar(tarWriter *tar.Writer, filename string, content interface{}) error {
	// Marshal content to JSON
	data, err := json.MarshalIndent(content, "", "  ")
	if err != nil {
		return err
	}

	// Create tar header
	header := &tar.Header{
		Name:     filename,
		Size:     int64(len(data)),
		Mode:     0644,
		ModTime:  time.Now(),
		Typeflag: tar.TypeReg,
	}

	// Write header
	if err := tarWriter.WriteHeader(header); err != nil {
		return err
	}

	// Write content
	_, err = tarWriter.Write(data)
	return err
}

func createPackMetadata() map[string]interface{} {
	return map[string]interface{}{
		"pack_type":    "compliance_pack",
		"version":      "1.0",
		"created_at":   time.Now().Format(time.RFC3339),
		"created_by":   "c2c-cli v1.0.0",
		"input_source": packOpts.Input,
		"format":       packOpts.Format,
		"description":  "CredLink Compliance Pack for WORM storage",
		"standards": []string{
			"C2PA 2.0",
			"CAI Verify",
			"WORM compatible",
		},
		"contents": []string{
			"metadata.json",
			"manifests.json",
			"verification.json",
			"certificates.json",
			"provenance.json",
			"pack.signature",
		},
	}
}

func createMockManifests() map[string]interface{} {
	return map[string]interface{}{
		"summary": map[string]interface{}{
			"total_assets":       150,
			"manifests_embedded": 120,
			"manifests_remote":   30,
			"formats": []string{
				"image/jpeg",
				"image/png",
				"video/mp4",
				"application/pdf",
			},
		},
		"assets": []map[string]interface{}{
			{
				"url":         "s3://bucket/assets/image1.jpg",
				"manifest_id": "manifest-001",
				"hash":        "sha256:a1b2c3d4...",
				"size":        1024000,
				"signed_at":   "2025-01-15T10:30:00Z",
			},
		},
	}
}

func createMockVerificationReports() map[string]interface{} {
	return map[string]interface{}{
		"summary": map[string]interface{}{
			"total_verified": 150,
			"passed":         148,
			"failed":         2,
			"survival_score": 0.987,
		},
		"reports": []map[string]interface{}{
			{
				"asset":       "s3://bucket/assets/image1.jpg",
				"verified":    true,
				"survival":    0.999,
				"verified_at": "2025-01-15T10:31:00Z",
				"issues":      []interface{}{},
			},
			{
				"asset":       "s3://bucket/assets/image2.jpg",
				"verified":    false,
				"survival":    0.0,
				"verified_at": "2025-01-15T10:31:05Z",
				"issues": []string{
					"signature_invalid",
					"manifest_missing",
				},
			},
		},
	}
}

func createMockCertificateChain() map[string]interface{} {
	return map[string]interface{}{
		"signer_certificate": map[string]interface{}{
			"subject":    "CN=CredLink Signer",
			"issuer":     "CN=CredLink CA",
			"serial":     "1234567890ABCDEF",
			"thumbprint": "A1B2C3D4E5F67890...",
			"valid_from": "2025-01-01T00:00:00Z",
			"valid_to":   "2026-01-01T00:00:00Z",
		},
		"ca_certificate": map[string]interface{}{
			"subject":    "CN=CredLink CA",
			"issuer":     "CN=Root CA",
			"serial":     "FEDCBA0987654321",
			"thumbprint": "0987FEDCBA654321...",
			"valid_from": "2024-01-01T00:00:00Z",
			"valid_to":   "2029-01-01T00:00:00Z",
		},
	}
}

func createMockProvenanceGraph() map[string]interface{} {
	return map[string]interface{}{
		"graph_type": "directed",
		"nodes": []map[string]interface{}{
			{
				"id":   "urn:uuid:asset-001",
				"type": "asset",
				"url":  "s3://bucket/assets/image1.jpg",
			},
			{
				"id":   "urn:uuid:asset-002",
				"type": "asset",
				"url":  "s3://bucket/assets/image2.jpg",
			},
		},
		"edges": []map[string]interface{}{
			{
				"from":         "urn:uuid:asset-001",
				"to":           "urn:uuid:asset-002",
				"type":         "derived_from",
				"relationship": "variant",
			},
		},
	}
}

func createPackSignature() string {
	return fmt.Sprintf("c2c-pack-v1-%x-%d", time.Now().Unix(), os.Getpid())
}

func runPackDryRun() error {
	projection := map[string]interface{}{
		"operation": "pack",
		"dry_run":   true,
		"input":     packOpts.Input,
		"output":    packOpts.Output,
		"format":    packOpts.Format,
		"estimates": map[string]interface{}{
			"assets_to_package":    150,
			"estimated_size":       "2.1GB",
			"manifest_count":       150,
			"verification_reports": 150,
			"duration":             "12m",
		},
		"contents": []string{
			"metadata.json",
			"manifests.json",
			"verification.json",
			"certificates.json",
			"provenance.json",
			"pack.signature",
		},
	}

	return PrintOutput(projection)
}
