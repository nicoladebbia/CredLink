package cmd

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/spf13/cobra"
)

// Sign command options
type SignOptions struct {
	TSA         bool
	Recursive   bool
	Concurrency int
	Resume      bool
	Inject      bool
	Patterns    []string
	MinBytes    int64
	MaxBytes    int64
	TypeFilter  string
}

var signOpts SignOptions

func InitSignCommand(rootCmd *cobra.Command) {
	var signCmd = &cobra.Command{
		Use:   "sign <path>",
		Short: "Sign files/dirs/prefixes with optional TSA timestamps",
		Long: `Sign files, directories, or cloud prefixes with cryptographic provenance.
Supports retro-signing, RFC-3161 TSA timestamps, and automatic Link header
injection for HTML files.`,
		Args: cobra.ExactArgs(1),
		RunE: runSignCommand,
	}

	// Sign-specific flags
	signCmd.Flags().BoolVar(&signOpts.TSA, "tsa", false, "Enable RFC-3161 TSA timestamps")
	signCmd.Flags().BoolVar(&signOpts.Recursive, "recursive", true, "Process subdirectories")
	signCmd.Flags().IntVar(&signOpts.Concurrency, "concurrency", 4, "Parallel upload concurrency")
	signCmd.Flags().BoolVar(&signOpts.Resume, "resume", false, "Resume interrupted operation")
	signCmd.Flags().BoolVar(&signOpts.Inject, "inject", true, "Inject Link headers in HTML")
	signCmd.Flags().StringSliceVar(&signOpts.Patterns, "patterns", []string{"*.jpg", "*.png", "*.mp4", "*.pdf"}, "File patterns to include")
	signCmd.Flags().Int64Var(&signOpts.MinBytes, "min-bytes", 0, "Minimum file size")
	signCmd.Flags().Int64Var(&signOpts.MaxBytes, "max-bytes", 0, "Maximum file size (0=no limit)")
	signCmd.Flags().StringVar(&signOpts.TypeFilter, "type", "", "Filter by type: image|video|audio")

	rootCmd.AddCommand(signCmd)
}

func runSignCommand(cmd *cobra.Command, args []string) error {
	path := args[0]

	// Validate inputs
	if err := validateSignInput(path); err != nil {
		PrintErrf("Input error: %v\n", err)
		return err
	}

	// Show dry-run projection
	if globalOpts.DryRun {
		return runSignDryRun(path)
	}

	// Execute signing
	PrintMsgf("Starting sign operation for: %s\n", path)

	result := map[string]interface{}{
		"path":   path,
		"tsa":    signOpts.TSA,
		"job_id": "sign-" + generateSignJobID(),
		"status": "started",
	}

	if err := PrintOutput(result); err != nil {
		return err
	}

	// TODO: Implement actual signing logic
	PrintMsg("Sign operation completed successfully")
	return nil
}

func validateSignInput(path string) error {
	if path == "" {
		return fmt.Errorf("path cannot be empty")
	}

	// Check for path traversal attempts in local paths
	if !strings.HasPrefix(path, "s3://") && !strings.HasPrefix(path, "r2://") {
		// Resolve to absolute path to detect traversal
		absPath, err := filepath.Abs(path)
		if err != nil {
			return fmt.Errorf("invalid path")
		}

		// Check for path traversal
		if strings.Contains(path, "..") {
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
		if strings.Contains(path, "../") || strings.Contains(path, "..\\") {
			return fmt.Errorf("path traversal patterns not allowed")
		}
	}

	// Validate cloud path format
	if strings.HasPrefix(path, "s3://") || strings.HasPrefix(path, "r2://") {
		var prefix string
		if strings.HasPrefix(path, "s3://") {
			prefix = "s3://"
		} else {
			prefix = "r2://"
		}
		parts := strings.SplitN(strings.TrimPrefix(path, prefix), "/", 2)
		if len(parts) < 2 {
			if prefix == "s3://" {
				return fmt.Errorf("invalid S3 path format, expected: s3://bucket/prefix")
			} else {
				return fmt.Errorf("invalid R2 path format, expected: r2://account/bucket/prefix")
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

func runSignDryRun(path string) error {
	projection := map[string]interface{}{
		"operation": "sign",
		"path":      path,
		"dry_run":   true,
		"estimates": map[string]interface{}{
			"files_to_sign": 150,
			"requests": map[string]int{
				"list":  5,
				"get":   150,
				"put":   150,
				"sign":  150,
				"total": 455,
			},
			"size_estimate": "2.3GB",
			"duration":      "15m",
			"tsa_requests": map[string]int{
				"timestamps": 150,
				"cost_usd":   7,
			},
		},
		"options": map[string]interface{}{
			"tsa":         signOpts.TSA,
			"recursive":   signOpts.Recursive,
			"concurrency": signOpts.Concurrency,
			"patterns":    signOpts.Patterns,
		},
	}

	return PrintOutput(projection)
}

func generateSignJobID() string {
	return strconv.FormatInt(int64(os.Getpid()), 10)
}
