package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/spf13/cobra"
)

// Inspect command options
type InspectOptions struct {
	Detailed   bool
	Remote     bool
	Format     string
	ShowClaims bool
	ShowCert   bool
}

var inspectOpts InspectOptions

func InitInspectCommand(rootCmd *cobra.Command) {
	var inspectCmd = &cobra.Command{
		Use:   "inspect <asset>",
		Short: "Print manifest/claims (summary|detailed JSON)",
		Long: `Display manifest information and claims for any asset.
Can show embedded or remote manifests, with summary or detailed JSON output.
Follows c2patool conventions for investigator compatibility.`,
		Args: cobra.ExactArgs(1),
		RunE: runInspectCommand,
	}

	// Inspect-specific flags
	inspectCmd.Flags().BoolVar(&inspectOpts.Detailed, "detail", false, "Show detailed manifest JSON")
	inspectCmd.Flags().BoolVar(&inspectOpts.Remote, "remote", false, "Fetch remote manifest if available")
	inspectCmd.Flags().StringVar(&inspectOpts.Format, "format", "json", "Output format: json|yaml|table")
	inspectCmd.Flags().BoolVar(&inspectOpts.ShowClaims, "claims", false, "Show all claims in detail")
	inspectCmd.Flags().BoolVar(&inspectOpts.ShowCert, "cert", false, "Show certificate chain details")

	rootCmd.AddCommand(inspectCmd)
}

func runInspectCommand(cmd *cobra.Command, args []string) error {
	asset := args[0]

	// Validate inputs
	if err := validateInspectInput(asset); err != nil {
		PrintErrf("Input error: %v\n", err)
		return err
	}

	PrintMsgf("Inspecting asset: %s\n", asset)

	// Mock inspection result
	result := map[string]interface{}{
		"asset":     asset,
		"manifest":  generateMockManifest(asset),
		"verified":  true,
		"timestamp": "2025-01-15T10:30:00Z",
	}

	if inspectOpts.Detailed {
		result["detailed"] = true
		result["claims"] = generateMockClaims()
		if inspectOpts.ShowCert {
			result["certificates"] = generateMockCertificates()
		}
	}

	// Format output based on format flag
	switch inspectOpts.Format {
	case "yaml":
		return printYAML(result)
	case "table":
		return printTable(result)
	default:
		return PrintOutput(result)
	}
}

func validateInspectInput(asset string) error {
	if asset == "" {
		return fmt.Errorf("asset path cannot be empty")
	}

	// Check for path traversal attempts in local paths
	if !strings.HasPrefix(asset, "s3://") && !strings.HasPrefix(asset, "r2://") {
		// Resolve to absolute path to detect traversal
		absPath, err := filepath.Abs(asset)
		if err != nil {
			return fmt.Errorf("invalid path")
		}

		// Check for path traversal
		if strings.Contains(asset, "..") {
			// For relative paths, check if they go outside current directory
			cwd, err := os.Getwd()
			if err != nil {
				return fmt.Errorf("cannot determine current directory")
			}

			// If the resolved path is not under current directory, it's traversal
			if !strings.HasPrefix(absPath, cwd) {
				return fmt.Errorf("path traversal detected: access outside current directory not allowed")
			}
		}

		// Additional check for suspicious patterns
		if strings.Contains(asset, "../") || strings.Contains(asset, "..\\") {
			return fmt.Errorf("path traversal patterns not allowed")
		}
	}

	// Validate cloud path format
	if strings.HasPrefix(asset, "s3://") || strings.HasPrefix(asset, "r2://") {
		var prefix string
		if strings.HasPrefix(asset, "s3://") {
			prefix = "s3://"
		} else {
			prefix = "r2://"
		}
		parts := strings.SplitN(strings.TrimPrefix(asset, prefix), "/", 2)
		if len(parts) < 2 {
			if prefix == "s3://" {
				return fmt.Errorf("invalid S3 path format, expected: s3://bucket/key")
			} else {
				return fmt.Errorf("invalid R2 path format, expected: r2://account/bucket/key")
			}
		}
		if parts[0] == "" {
			return fmt.Errorf("bucket name cannot be empty")
		}
		// Check for path traversal in cloud paths
		if strings.Contains(parts[1], "..") {
			return fmt.Errorf("path traversal not allowed in cloud paths")
		}
	}

	return nil
}

func generateMockManifest(asset string) map[string]interface{} {
	return map[string]interface{}{
		"label":       "c2pa-manifest",
		"manifest_id": fmt.Sprintf("manifest-%x", len(asset)),
		"title":       "C2 Concierge Manifest",
		"format":      "application/json",
		"instance_id": fmt.Sprintf("instance-%x", len(asset)*2),
		"assertions": []map[string]interface{}{
			{
				"label": "c2pa.actions",
				"data": map[string]interface{}{
					"actions": []map[string]interface{}{
						{
							"action": "c2pa.sign",
							"when":   "2025-01-15T10:30:00Z",
						},
					},
				},
			},
		},
	}
}

func generateMockClaims() []map[string]interface{} {
	return []map[string]interface{}{
		{
			"url": "self#jumbfs=c2pa.actions",
			"claim": map[string]interface{}{
				"algorithm": "sha256",
				"hash":      "a1b2c3d4e5f6...",
				"data": map[string]interface{}{
					"actions": []map[string]interface{}{
						{
							"action": "c2pa.sign",
							"when":   "2025-01-15T10:30:00Z",
						},
					},
				},
			},
		},
	}
}

func generateMockCertificates() []map[string]interface{} {
	return []map[string]interface{}{
		{
			"subject":    "CN=C2 Concierge Signer",
			"issuer":     "CN=C2 Concierge CA",
			"serial":     "1234567890ABCDEF",
			"not_before": "2025-01-01T00:00:00Z",
			"not_after":  "2026-01-01T00:00:00Z",
			"thumbprint": "A1B2C3D4E5F67890...",
		},
	}
}

func printYAML(data interface{}) error {
	// Simple YAML output (basic implementation)
	fmt.Println("# YAML Output")
	encoder := json.NewEncoder(os.Stdout)
	encoder.SetIndent("", "  ")
	return encoder.Encode(data)
}

func printTable(data interface{}) error {
	fmt.Println("# Inspection Results")
	fmt.Println("Asset\t\tStatus\tTimestamp")
	fmt.Println("-----\t\t------\t--------")

	if result, ok := data.(map[string]interface{}); ok {
		asset := result["asset"]
		status := "Verified"
		if v, ok := result["verified"].(bool); ok && !v {
			status = "Unverified"
		}
		timestamp := result["timestamp"]

		fmt.Printf("%v\t%v\t%v\n", asset, status, timestamp)
	}

	return nil
}
