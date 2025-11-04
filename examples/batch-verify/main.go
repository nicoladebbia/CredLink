package main

import (
	"bufio"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/c2concierge/sdk-go/v2/c2c"
)

func main() {
	var (
		source     = flag.String("source", "", "RSS feed URL or JSONL file path")
		sourceType = flag.String("type", "", "Source type: rss or jsonl")
		policyID   = flag.String("policy-id", "default", "Verification policy ID")
		output     = flag.String("output", "json", "Output format: json, csv, html")
		outputFile = flag.String("output-file", "", "Output file path")
	)
	flag.Parse()

	if *source == "" || *sourceType == "" {
		fmt.Println("Usage: go run batch_verify.go -source <url|path> -type <rss|jsonl> [options]")
		flag.PrintDefaults()
		os.Exit(1)
	}

	apiKey := os.Getenv("C2_API_KEY")
	if apiKey == "" {
		log.Fatal("C2_API_KEY environment variable is required")
	}

	// Extract URLs based on source type
	var urls []string
	var err error

	if *sourceType == "rss" {
		urls, err = extractURLsFromRSS(*source)
	} else {
		urls, err = extractURLsFromJSONL(*source)
	}

	if err != nil {
		log.Fatalf("Failed to extract URLs: %v", err)
	}

	if len(urls) == 0 {
		fmt.Println("No URLs found in source")
		os.Exit(1)
	}

	// Batch verify assets
	client := c2c.NewClientWithAPIKey(apiKey)
	defer client.Close()

	results, err := batchVerifyAssets(context.Background(), client, urls, *policyID)
	if err != nil {
		log.Fatalf("Batch verification failed: %v", err)
	}

	// Generate and output report
	report := generateReport(results, *output)

	if *outputFile != "" {
		err := os.WriteFile(*outputFile, []byte(report), 0644)
		if err != nil {
			log.Fatalf("Failed to write report: %v", err)
		}
		fmt.Printf("Report saved to %s\n", *outputFile)
	} else {
		fmt.Println(report)
	}

	// Exit with error code if any assets failed
	if results.Failed > 0 {
		os.Exit(1)
	}
}

func extractURLsFromRSS(feedURL string) ([]string, error) {
	fmt.Printf("Fetching RSS feed: %s\n", feedURL)

	resp, err := http.Get(feedURL)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch RSS feed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("RSS feed returned status %d", resp.StatusCode)
	}

	// Simple RSS parsing - in production, use a proper RSS parser
	scanner := bufio.NewScanner(resp.Body)
	urls := []string{}

	for scanner.Scan() {
		line := scanner.Text()
		// Look for enclosure tags with media URLs
		if strings.Contains(line, "<enclosure") && strings.Contains(line, "url=") {
			start := strings.Index(line, "url=\"") + 5
			if start > 4 {
				end := strings.Index(line[start:], "\"")
				if end > 0 {
					url := line[start : start+end]
					if strings.HasPrefix(url, "http") {
						urls = append(urls, url)
					}
				}
			}
		}
	}

	return urls, scanner.Err()
}

func extractURLsFromJSONL(filePath string) ([]string, error) {
	fmt.Printf("Reading JSONL file: %s\n", filePath)

	file, err := os.Open(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to open JSONL file: %w", err)
	}
	defer file.Close()

	urls := []string{}
	scanner := bufio.NewScanner(file)

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}

		var data map[string]interface{}
		if err := json.Unmarshal([]byte(line), &data); err != nil {
			log.Printf("Warning: failed to parse JSON line: %v", err)
			continue
		}

		if url, ok := data["url"].(string); ok {
			urls = append(urls, url)
		} else if assetURL, ok := data["asset_url"].(string); ok {
			urls = append(urls, assetURL)
		}
	}

	return urls, scanner.Err()
}

type BatchResult struct {
	URL      string `json:"url"`
	Verified bool   `json:"verified"`
	Error    string `json:"error,omitempty"`
}

type BatchResults struct {
	Total    int           `json:"total"`
	Verified int           `json:"verified"`
	Failed   int           `json:"failed"`
	Errors   []BatchResult `json:"errors"`
}

func batchVerifyAssets(ctx context.Context, client *c2c.Client, urls []string, policyID string) (*BatchResults, error) {
	fmt.Printf("Batch verifying %d assets...\n", len(urls))

	resultCh, err := client.BatchVerify(ctx, urls, c2c.BatchVerifyOptions{
		PolicyID:         &policyID,
		Parallel:         c2c.Ptr(true),
		TimeoutPerAsset:  c2c.Ptr(5000),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to start batch verification: %w", err)
	}

	results := &BatchResults{
		Total:  len(urls),
		Errors: []BatchResult{},
	}

	for result := range resultCh {
		verified := false
		if result.Result != nil {
			verified = result.Result.Verified
		}

		if verified {
			results.Verified++
			fmt.Printf("  ✅ %s\n", result.Asset.URL)
		} else {
			results.Failed++
			errorMsg := "Unknown error"
			if result.Error != nil {
				if msg, ok := result.Error["message"].(string); ok {
					errorMsg = msg
				}
			}
			fmt.Printf("  ❌ %s: %s\n", result.Asset.URL, errorMsg)
			results.Errors = append(results.Errors, BatchResult{
				URL:      result.Asset.URL,
				Verified: false,
				Error:    errorMsg,
			})
		}
	}

	return results, nil
}

func generateReport(results *BatchResults, format string) string {
	switch format {
	case "json":
		data, _ := json.MarshalIndent(results, "", "  ")
		return string(data)
	case "csv":
		lines := []string{"url,status,error"}
		for _, error := range results.Errors {
			lines = append(lines, fmt.Sprintf("%s,failed,%s", error.URL, error.Error))
		}
		return strings.Join(lines, "\n")
	case "html":
		html := fmt.Sprintf(`
<!DOCTYPE html>
<html>
<head><title>Verification Report</title></head>
<body>
    <h1>Verification Report</h1>
    <p>Total: %d</p>
    <p>Verified: %d</p>
    <p>Failed: %d</p>
    <h2>Failed Assets</h2>
    <table border="1">
        <tr><th>URL</th><th>Error</th></tr>`, results.Total, results.Verified, results.Failed)

		for _, error := range results.Errors {
			html += fmt.Sprintf("<tr><td>%s</td><td>%s</td></tr>", error.URL, error.Error)
		}

		html += `
    </table>
</body>
</html>`
		return html
	default:
		return fmt.Sprintf("Total: %d, Verified: %d, Failed: %d", results.Total, results.Verified, results.Failed)
	}
}
