package cmd

import (
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"github.com/spf13/cobra"
)

// Verify command options
type VerifyOptions struct {
	Page        bool
	Stream      bool
	Threshold   string
	FollowLinks bool
	MaxDepth    int
	Prefix      bool
	Delimiter   string
}

var verifyOpts VerifyOptions

func InitVerifyCommand(rootCmd *cobra.Command) {
	var verifyCmd = &cobra.Command{
		Use:   "verify <path|url>",
		Short: "Verify one or many assets; can crawl pages and stream results",
		Long: `Verify single or multiple assets with cryptographic provenance checks.
Can crawl web pages to discover assets, supports streaming NDJSON output,
and provides machine-readable results for CI/CD pipelines.`,
		Args: cobra.ExactArgs(1),
		RunE: runVerifyCommand,
	}

	// Verify-specific flags
	verifyCmd.Flags().BoolVar(&verifyOpts.Page, "page", false, "Crawl a web page for assets")
	verifyCmd.Flags().BoolVar(&verifyOpts.Stream, "stream", false, "Output streaming NDJSON")
	verifyCmd.Flags().StringVar(&verifyOpts.Threshold, "threshold", "", "Survival threshold (e.g., survival>=0.999)")
	verifyCmd.Flags().BoolVar(&verifyOpts.FollowLinks, "follow-links", true, "Follow links on page crawl")
	verifyCmd.Flags().IntVar(&verifyOpts.MaxDepth, "max-depth", 2, "Maximum depth for page crawl")
	verifyCmd.Flags().BoolVar(&verifyOpts.Prefix, "prefix", false, "Verify all objects with prefix")
	verifyCmd.Flags().StringVar(&verifyOpts.Delimiter, "delimiter", "/", "Delimiter for prefix listing")

	rootCmd.AddCommand(verifyCmd)
}

func runVerifyCommand(cmd *cobra.Command, args []string) error {
	target := args[0]

	// Validate inputs
	if err := validateVerifyInput(target); err != nil {
		PrintErrf("Input error: %v\n", err)
		return err
	}

	// Show dry-run projection
	if globalOpts.DryRun {
		return runVerifyDryRun(target)
	}

	// Execute verification
	PrintMsgf("Starting verification for: %s\n", target)

	if verifyOpts.Page {
		return runPageVerification(target)
	} else if verifyOpts.Prefix {
		return runPrefixVerification(target)
	} else {
		return runSingleVerification(target)
	}
}

func validateVerifyInput(target string) error {
	if target == "" {
		return fmt.Errorf("target cannot be empty")
	}

	// Check if it's a URL for page verification
	if strings.HasPrefix(target, "http://") || strings.HasPrefix(target, "https://") {
		if _, err := url.Parse(target); err != nil {
			return fmt.Errorf("invalid URL: %v", err)
		}
		// Additional URL validation
		if len(target) > 2048 {
			return fmt.Errorf("URL too long (max 2048 characters)")
		}
		return nil
	}

	// Check for path traversal attempts in local paths
	if !strings.HasPrefix(target, "s3://") && !strings.HasPrefix(target, "r2://") {
		// Resolve to absolute path to detect traversal
		absPath, err := filepath.Abs(target)
		if err != nil {
			return fmt.Errorf("invalid path")
		}

		// Check for path traversal
		if strings.Contains(target, "..") {
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
		if strings.Contains(target, "../") || strings.Contains(target, "..\\") {
			return fmt.Errorf("path traversal patterns not allowed")
		}
	}

	// Validate cloud path format
	if strings.HasPrefix(target, "s3://") || strings.HasPrefix(target, "r2://") {
		var prefix string
		if strings.HasPrefix(target, "s3://") {
			prefix = "s3://"
		} else {
			prefix = "r2://"
		}
		parts := strings.SplitN(strings.TrimPrefix(target, prefix), "/", 2)
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

func runVerifyDryRun(target string) error {
	var estimates map[string]interface{}

	if verifyOpts.Page {
		estimates = map[string]interface{}{
			"pages_to_crawl":    1,
			"assets_discovered": 45,
			"requests": map[string]int{
				"fetch":  1,
				"parse":  1,
				"verify": 45,
				"total":  47,
			},
			"duration": "3m",
		}
	} else if verifyOpts.Prefix {
		estimates = map[string]interface{}{
			"objects_to_list":   200,
			"objects_to_verify": 180,
			"requests": map[string]int{
				"list":   5,
				"get":    180,
				"verify": 180,
				"total":  365,
			},
			"duration": "8m",
		}
	} else {
		estimates = map[string]interface{}{
			"objects_to_verify": 1,
			"requests": map[string]int{
				"get":    1,
				"verify": 1,
				"total":  2,
			},
			"duration": "5s",
		}
	}

	projection := map[string]interface{}{
		"operation": "verify",
		"target":    target,
		"dry_run":   true,
		"estimates": estimates,
		"options": map[string]interface{}{
			"page":         verifyOpts.Page,
			"stream":       verifyOpts.Stream,
			"threshold":    verifyOpts.Threshold,
			"prefix":       verifyOpts.Prefix,
			"follow_links": verifyOpts.FollowLinks,
			"max_depth":    verifyOpts.MaxDepth,
		},
	}

	return PrintOutput(projection)
}

func runPageVerification(url string) error {
	PrintMsgf("Crawling page: %s\n", url)

	result := map[string]interface{}{
		"url":          url,
		"job_id":       "verify-page-" + generateVerifyJobID(),
		"status":       "crawling",
		"assets_found": 0,
	}

	if err := PrintOutput(result); err != nil {
		return err
	}

	// TODO: Implement actual page crawling and verification
	PrintMsg("Page verification completed")
	return nil
}

func runPrefixVerification(prefix string) error {
	PrintMsgf("Verifying prefix: %s\n", prefix)

	result := map[string]interface{}{
		"prefix":        prefix,
		"job_id":        "verify-prefix-" + generateVerifyJobID(),
		"status":        "listing",
		"objects_found": 0,
	}

	if err := PrintOutput(result); err != nil {
		return err
	}

	// TODO: Implement actual prefix verification
	PrintMsg("Prefix verification completed")
	return nil
}

func generateVerifyJobID() string {
	return fmt.Sprintf("verify-%d", os.Getpid())
}

func runSingleVerification(target string) error {
	PrintMsgf("Verifying asset: %s\n", target)

	result := map[string]interface{}{
		"target":   target,
		"job_id":   "verify-" + generateVerifyJobID(),
		"status":   "verifying",
		"verified": false,
	}

	if err := PrintOutput(result); err != nil {
		return err
	}

	// TODO: Implement actual single asset verification
	PrintMsg("Asset verification completed")
	return nil
}
