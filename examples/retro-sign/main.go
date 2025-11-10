package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/credlink/sdk-go/v2/c2c"
)

func main() {
	var (
		folder        = flag.String("folder", "", "Path to folder to sign")
		profile       = flag.String("profile", "", "Signing profile ID")
		tsa           = flag.Bool("tsa", false, "Include RFC-3161 timestamps")
		noRecursive   = flag.Bool("no-recursive", false, "Do not process subdirectories")
		patterns      = flag.String("patterns", "*.jpg,*.png,*.mp4,*.pdf", "Comma-separated file patterns")
		idempotencyKey = flag.String("idempotency-key", "", "Idempotency key for request deduplication")
		pollInterval  = flag.Int("poll-interval", 10, "Job status poll interval in seconds")
		monitorOnly   = flag.String("monitor-only", "", "Monitor existing job (provide job ID)")
	)
	flag.Parse()

	apiKey := os.Getenv("C2_API_KEY")
	if apiKey == "" {
		log.Fatal("C2_API_KEY environment variable is required")
	}

	client := c2c.NewClientWithAPIKey(apiKey)
	defer client.Close()

	if *monitorOnly != "" {
		// Monitor existing job
		err := monitorJob(context.Background(), client, *monitorOnly, *pollInterval)
		if err != nil {
			log.Fatalf("Job monitoring failed: %v", err)
		}
		return
	}

	if *folder == "" || *profile == "" {
		fmt.Println("Usage: go run retro_sign.go -folder <path> -profile <id> [options]")
		flag.PrintDefaults()
		os.Exit(1)
	}

	// Check if folder exists
	info, err := os.Stat(*folder)
	if err != nil {
		log.Fatalf("Failed to stat folder: %v", err)
	}
	if !info.IsDir() {
		log.Fatalf("Path %s is not a directory", *folder)
	}

	// Parse file patterns
	filePatterns := strings.Split(*patterns, ",")

	// Start signing job
	jobID, err := signFolder(context.Background(), client, *folder, *profile, *tsa, !*noRecursive, filePatterns, *idempotencyKey)
	if err != nil {
		log.Fatalf("Failed to start signing job: %v", err)
	}

	// Monitor the job
	err = monitorJob(context.Background(), client, jobID, *pollInterval)
	if err != nil {
		log.Fatalf("Job monitoring failed: %v", err)
	}
}

func signFolder(ctx context.Context, client *c2c.Client, folderPath, profileID string, tsa, recursive bool, filePatterns []string, idempotencyKey string) (string, error) {
	fmt.Printf("Signing folder: %s\n", folderPath)
	fmt.Printf("Profile: %s\n", profileID)
	fmt.Printf("TSA: %t\n", tsa)
	fmt.Printf("Recursive: %t\n", recursive)
	fmt.Printf("File patterns: %v\n", filePatterns)

	result, err := client.SignFolder(ctx, folderPath, c2c.SignFolderOptions{
		ProfileID:      profileID,
		TSA:            &tsa,
		Recursive:      &recursive,
		FilePatterns:   filePatterns,
		IdempotencyKey: &idempotencyKey,
	})
	if err != nil {
		return "", fmt.Errorf("failed to start signing job: %w", err)
	}

	jobID := result.Data.JobID
	fmt.Printf("✅ Signing job started: %s\n", jobID)
	fmt.Printf("📊 Estimated duration: %d seconds\n", result.Data.EstimatedDuration)
	fmt.Printf("📁 Files found: %d\n", result.Data.FilesFound)
	fmt.Printf("🔗 Status URL: %s\n", result.Data.StatusURL)

	return jobID, nil
}

func monitorJob(ctx context.Context, client *c2c.Client, jobID string, pollInterval int) error {
	fmt.Printf("\nMonitoring job %s...\n", jobID)

	ticker := time.NewTicker(time.Duration(pollInterval) * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			status, err := client.GetJobStatus(ctx, jobID)
			if err != nil {
				return fmt.Errorf("failed to get job status: %w", err)
			}

			fmt.Printf("Status: %s\n", status.Status)
			if status.Message != nil {
				fmt.Printf("Message: %s\n", *status.Message)
			}

			if status.Progress != nil {
				fmt.Printf("Progress: %d%%\n", *status.Progress)
			}

			switch status.Status {
			case "completed":
				fmt.Println("\n✅ Folder signing completed successfully")
				if status.Result != nil {
					fmt.Printf("Result: %v\n", status.Result)
				}
				return nil
			case "failed":
				fmt.Println("\n❌ Folder signing failed")
				if status.Error != nil {
					fmt.Printf("Error: %s\n", *status.Error)
					return fmt.Errorf("job failed: %s", *status.Error)
				}
				return fmt.Errorf("job failed")
			case "cancelled":
				fmt.Println("\n⏹️ Folder signing was cancelled")
				return fmt.Errorf("job was cancelled")
			}
		}
	}
}
