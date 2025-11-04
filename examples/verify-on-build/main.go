package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"strconv"

	"github.com/c2concierge/sdk-go/v2/c2c"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Println("Usage: go run verify_on_build.go <page_url> [policy_id]")
		os.Exit(1)
	}

	pageURL := os.Args[1]
	policyID := "default"
	if len(os.Args) > 2 {
		policyID = os.Args[2]
	}

	apiKey := os.Getenv("C2_API_KEY")
	if apiKey == "" {
		log.Fatal("C2_API_KEY environment variable is required")
	}

	// Initialize client
	client := c2c.NewClientWithAPIKey(apiKey)
	defer client.Close()

	// Verify page assets
	err := verifyPageAssets(context.Background(), client, pageURL, policyID)
	if err != nil {
		log.Fatalf("Verification failed: %v", err)
	}
}

func verifyPageAssets(ctx context.Context, client *c2c.Client, pageURL, policyID string) error {
	fmt.Printf("Verifying assets on %s...\n", pageURL)

	resultCh, err := client.VerifyPage(ctx, pageURL, c2c.VerifyPageOptions{
		PolicyID:    &policyID,
		FollowLinks: c2c.Ptr(true),
		MaxDepth:    c2c.Ptr(2),
	})
	if err != nil {
		return fmt.Errorf("failed to verify page: %w", err)
	}

	verifiedCount := 0
	totalCount := 0
	failedAssets := []string{}

	for asset := range resultCh {
		totalCount++
		if asset.Verified {
			verifiedCount++
			fmt.Printf("  ✅ %s\n", *asset.URL)
		} else {
			fmt.Printf("  ❌ %s: %s\n", *asset.URL, *asset.Error)
			failedAssets = append(failedAssets, *asset.URL)
		}
	}

	fmt.Printf("\nVerification complete: %d/%d assets verified\n", verifiedCount, totalCount)

	if len(failedAssets) > 0 {
		fmt.Println("\nFailed assets:")
		for _, asset := range failedAssets {
			fmt.Printf("  - %s\n", asset)
		}
		return fmt.Errorf("%d assets failed verification", len(failedAssets))
	}

	return nil
}
