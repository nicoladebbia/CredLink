package cmd

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/spf13/cobra"
)

// Diff command options
type DiffOptions struct {
	ShowClaims     bool
	ShowCerts      bool
	ShowProvenance bool
	Context        int
}

var diffOpts DiffOptions

func InitDiffCommand(rootCmd *cobra.Command) {
	var diffCmd = &cobra.Command{
		Use:   "diff <assetA> <assetB|manifest>",
		Short: "Compare two assets/manifests; highlight deltas",
		Long: `Compare two assets or manifests and show differences in:
- Claims/Assertions (added/removed/changed)
- Signer/cert differences (thumbprints, validity)
- Provenance graph differences (parent/variant links)

Outputs human-readable summary and machine-readable JSON.`,
		Args: cobra.ExactArgs(2),
		RunE: runDiffCommand,
	}

	// Diff-specific flags
	diffCmd.Flags().BoolVar(&diffOpts.ShowClaims, "claims", true, "Show claim differences")
	diffCmd.Flags().BoolVar(&diffOpts.ShowCerts, "certs", false, "Show certificate differences")
	diffCmd.Flags().BoolVar(&diffOpts.ShowProvenance, "provenance", true, "Show provenance differences")
	diffCmd.Flags().IntVar(&diffOpts.Context, "context", 3, "Context lines for differences")

	rootCmd.AddCommand(diffCmd)
}

func runDiffCommand(cmd *cobra.Command, args []string) error {
	assetA := args[0]
	assetB := args[1]

	// Validate inputs
	if err := validateDiffInput(assetA, assetB); err != nil {
		PrintErrf("Input error: %v\n", err)
		return err
	}

	PrintMsgf("Comparing assets:\n  A: %s\n  B: %s\n", assetA, assetB)

	// Generate mock diff result
	result := generateMockDiff(assetA, assetB)

	if globalOpts.JSON {
		return PrintOutput(result)
	} else {
		return printHumanDiff(result)
	}
}

func validateDiffInput(assetA, assetB string) error {
	if assetA == "" || assetB == "" {
		return fmt.Errorf("both assets must be specified")
	}

	// Validate cloud path formats and check for traversal
	for _, asset := range []string{assetA, assetB} {
		// Check for path traversal attempts in local paths
		if !strings.HasPrefix(asset, "s3://") && !strings.HasPrefix(asset, "r2://") {
			// Resolve to absolute path to detect traversal
			absPath, err := filepath.Abs(asset)
			if err != nil {
				return fmt.Errorf("invalid path: %s", asset)
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
					return fmt.Errorf("path traversal detected in %s: access outside current directory not allowed", asset)
				}
			}

			// Additional check for suspicious patterns
			if strings.Contains(asset, "../") || strings.Contains(asset, "..\\") {
				return fmt.Errorf("path traversal patterns not allowed in %s", asset)
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
				return fmt.Errorf("invalid cloud path format: %s", asset)
			}
			if parts[0] == "" {
				return fmt.Errorf("bucket name cannot be empty in: %s", asset)
			}
			// Check for path traversal in cloud paths
			if strings.Contains(parts[1], "..") {
				return fmt.Errorf("path traversal not allowed in cloud path: %s", asset)
			}
		}
	}

	return nil
}

func generateMockDiff(assetA, assetB string) map[string]interface{} {
	return map[string]interface{}{
		"comparison": map[string]interface{}{
			"asset_a":   assetA,
			"asset_b":   assetB,
			"timestamp": "2025-01-15T10:30:00Z",
		},
		"summary": map[string]interface{}{
			"identical":   false,
			"differences": 3,
			"severity":    "minor",
		},
		"differences":        generateMockDifferences(),
		"claims_delta":       generateMockClaimsDelta(),
		"certificates_delta": generateMockCertDelta(),
		"provenance_delta":   generateMockProvenanceDelta(),
	}
}

func generateMockDifferences() []map[string]interface{} {
	return []map[string]interface{}{
		{
			"type":        "claim_added",
			"claim":       "c2pa.actions",
			"description": "New signing action detected",
		},
		{
			"type":        "hash_changed",
			"algorithm":   "sha256",
			"description": "Content hash differs",
		},
		{
			"type": "timestamp_changed",
			"old":  "2025-01-14T10:30:00Z",
			"new":  "2025-01-15T10:30:00Z",
		},
	}
}

func generateMockClaimsDelta() map[string]interface{} {
	return map[string]interface{}{
		"added": []string{
			"c2pa.actions",
			"c2pa.thumbnail",
		},
		"removed": []string{
			"c2pa.relationships",
		},
		"modified": []map[string]interface{}{
			{
				"claim":  "c2pa.hash.data",
				"change": "hash_value_updated",
			},
		},
	}
}

func generateMockCertDelta() map[string]interface{} {
	return map[string]interface{}{
		"signer_changed":  false,
		"thumbprint_same": true,
		"validity": map[string]interface{}{
			"a_not_before": "2025-01-01T00:00:00Z",
			"a_not_after":  "2026-01-01T00:00:00Z",
			"b_not_before": "2025-01-01T00:00:00Z",
			"b_not_after":  "2026-01-01T00:00:00Z",
		},
	}
}

func generateMockProvenanceDelta() map[string]interface{} {
	return map[string]interface{}{
		"parent_links": map[string]interface{}{
			"added":   []string{"urn:uuid:parent-123"},
			"removed": []string{},
		},
		"variant_links": map[string]interface{}{
			"added":   []string{"urn:uuid:variant-456"},
			"removed": []string{"urn:uuid:variant-789"},
		},
	}
}

func printHumanDiff(result map[string]interface{}) error {
	fmt.Println("\n=== Asset Comparison Summary ===")

	if summary, ok := result["summary"].(map[string]interface{}); ok {
		fmt.Printf("Identical: %v\n", summary["identical"])
		fmt.Printf("Differences: %v\n", summary["differences"])
		fmt.Printf("Severity: %v\n", summary["severity"])
	}

	if diffOpts.ShowClaims {
		fmt.Println("\n=== Claims Differences ===")
		if claims, ok := result["claims_delta"].(map[string]interface{}); ok {
			printStringList("Added:", claims["added"])
			printStringList("Removed:", claims["removed"])
			printModifiedList("Modified:", claims["modified"])
		}
	}

	if diffOpts.ShowCerts {
		fmt.Println("\n=== Certificate Differences ===")
		if certs, ok := result["certificates_delta"].(map[string]interface{}); ok {
			for k, v := range certs {
				fmt.Printf("  %s: %v\n", k, v)
			}
		}
	}

	if diffOpts.ShowProvenance {
		fmt.Println("\n=== Provenance Differences ===")
		if prov, ok := result["provenance_delta"].(map[string]interface{}); ok {
			fmt.Println("  Parent Links:")
			printProvenanceLinks(prov["parent_links"])
			fmt.Println("  Variant Links:")
			printProvenanceLinks(prov["variant_links"])
		}
	}

	fmt.Println("\n=== Detailed Differences ===")
	if diffs, ok := result["differences"].([]map[string]interface{}); ok {
		for i, diff := range diffs {
			fmt.Printf("%d. %s: %s\n", i+1, diff["type"], diff["description"])
		}
	}

	return nil
}

func printStringList(label string, items interface{}) {
	fmt.Printf("  %s\n", label)
	if list, ok := items.([]string); ok {
		for _, item := range list {
			fmt.Printf("    - %s\n", item)
		}
	}
}

func printModifiedList(label string, items interface{}) {
	fmt.Printf("  %s\n", label)
	if list, ok := items.([]map[string]interface{}); ok {
		for _, item := range list {
			fmt.Printf("    - %s: %s\n", item["claim"], item["change"])
		}
	}
}

func printProvenanceLinks(links interface{}) {
	if linkMap, ok := links.(map[string]interface{}); ok {
		printStringList("    Added:", linkMap["added"])
		printStringList("    Removed:", linkMap["removed"])
	}
}
