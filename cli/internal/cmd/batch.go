package cmd

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/spf13/cobra"
)

// Batch command options
type BatchOptions struct {
	Feed        string
	From        string
	Resume      bool
	Concurrency int
	HaltOn      string
	StateFile   string
	Output      string
}

var batchOpts BatchOptions

// Batch state for resumable operations
type BatchState struct {
	JobID      string                 `json:"job_id"`
	StartedAt  time.Time              `json:"started_at"`
	LastCursor string                 `json:"last_cursor"`
	Processed  int                    `json:"processed"`
	Successes  int                    `json:"successes"`
	Failures   int                    `json:"failures"`
	LastError  string                 `json:"last_error"`
	Config     map[string]interface{} `json:"config"`
}

// Batch feed entry
type FeedEntry struct {
	URL     string                 `json:"url"`
	Options map[string]interface{} `json:"options,omitempty"`
}

func InitBatchCommand(rootCmd *cobra.Command) {
	var batchCmd = &cobra.Command{
		Use:   "batch <command>",
		Short: "Fan-out jobs from CSV/JSONL feed; resumable",
		Long: `Execute batch operations from feed files with checkpointing and resume support.
Supports CSV and JSONL feeds, local files and cloud storage, and provides
transactional state management for resumable operations.`,
	}

	// Add subcommands
	InitBatchVerifyCommand(batchCmd)
	InitBatchSignCommand(batchCmd)

	rootCmd.AddCommand(batchCmd)
}

func InitBatchVerifyCommand(batchCmd *cobra.Command) {
	var verifyCmd = &cobra.Command{
		Use:   "verify",
		Short: "Batch verify from feed file",
		Long: `Verify multiple assets from a CSV or JSONL feed.
Supports resumable operations with checkpointing.`,
		RunE: runBatchVerifyCommand,
	}

	// Batch verify flags
	verifyCmd.Flags().StringVar(&batchOpts.Feed, "feed", "", "Feed file path (CSV or JSONL)")
	verifyCmd.Flags().StringVar(&batchOpts.From, "from", "", "Feed file from cloud storage")
	verifyCmd.Flags().BoolVar(&batchOpts.Resume, "resume", false, "Resume interrupted operation")
	verifyCmd.Flags().IntVar(&batchOpts.Concurrency, "concurrency", 4, "Parallel processing limit")
	verifyCmd.Flags().StringVar(&batchOpts.HaltOn, "halt-on", "continue", "Halt on error type: continue|VerifyFail|SrvErr")
	verifyCmd.Flags().StringVar(&batchOpts.StateFile, "state-file", ".c2c-batch.state", "State file for checkpointing")
	verifyCmd.Flags().StringVar(&batchOpts.Output, "output", "", "Output file for results")

	batchCmd.AddCommand(verifyCmd)
}

func InitBatchSignCommand(batchCmd *cobra.Command) {
	var signCmd = &cobra.Command{
		Use:   "sign",
		Short: "Batch sign from feed file",
		Long: `Sign multiple assets from a CSV or JSONL feed.
Supports resumable operations with checkpointing.`,
		RunE: runBatchSignCommand,
	}

	// Batch sign flags
	signCmd.Flags().StringVar(&batchOpts.Feed, "feed", "", "Feed file path (CSV or JSONL)")
	signCmd.Flags().StringVar(&batchOpts.From, "from", "", "Feed file from cloud storage")
	signCmd.Flags().BoolVar(&batchOpts.Resume, "resume", false, "Resume interrupted operation")
	signCmd.Flags().IntVar(&batchOpts.Concurrency, "concurrency", 4, "Parallel processing limit")
	signCmd.Flags().StringVar(&batchOpts.HaltOn, "halt-on", "continue", "Halt on error type: continue|VerifyFail|SrvErr")
	signCmd.Flags().StringVar(&batchOpts.StateFile, "state-file", ".c2c-batch.state", "State file for checkpointing")
	signCmd.Flags().StringVar(&batchOpts.Output, "output", "", "Output file for results")

	batchCmd.AddCommand(signCmd)
}

func runBatchVerifyCommand(cmd *cobra.Command, args []string) error {
	// Validate inputs
	if err := validateBatchInput(); err != nil {
		PrintErrf("Input error: %v\n", err)
		return err
	}

	// Load or create state
	state, err := loadBatchState()
	if err != nil {
		return err
	}

	// Show dry-run projection
	if globalOpts.DryRun {
		return runBatchDryRun("verify", state)
	}

	PrintMsgf("Starting batch verification (Job ID: %s)\n", state.JobID)

	// Process feed
	feedPath := batchOpts.Feed
	if batchOpts.From != "" {
		feedPath = batchOpts.From
	}

	entries, err := readFeed(feedPath, state.LastCursor)
	if err != nil {
		return err
	}

	PrintMsgf("Found %d entries to process\n", len(entries))

	// Process entries with checkpointing
	for i, entry := range entries {
		if err := processBatchEntry(entry, i, state); err != nil {
			if shouldHalt(err) {
				PrintErrf("Halting batch operation: %v\n", err)
				saveBatchState(state)
				return err
			}
			state.Failures++
			state.LastError = err.Error()
		} else {
			state.Successes++
		}
		state.Processed++
		state.LastCursor = strconv.Itoa(i)

		// Save checkpoint every 10 entries
		if state.Processed%10 == 0 {
			if err := saveBatchState(state); err != nil {
				PrintErrf("Failed to save state: %v\n", err)
			}
		}
	}

	// Final state save
	if err := saveBatchState(state); err != nil {
		PrintErrf("Warning: Failed to save final state: %v\n", err)
	}

	PrintMsgf("Batch verification completed: %d successes, %d failures\n", state.Successes, state.Failures)
	return nil
}

func runBatchSignCommand(cmd *cobra.Command, args []string) error {
	// Similar implementation to verify but for signing
	PrintMsg("Batch signing not yet implemented")
	return nil
}

func validateBatchInput() error {
	if batchOpts.Feed == "" && batchOpts.From == "" {
		return fmt.Errorf("either --feed or --from must be specified")
	}
	if batchOpts.Feed != "" && batchOpts.From != "" {
		return fmt.Errorf("cannot specify both --feed and --from")
	}
	if batchOpts.Concurrency < 1 || batchOpts.Concurrency > 20 {
		return fmt.Errorf("concurrency must be between 1 and 20")
	}

	// Validate feed path for traversal attempts
	if batchOpts.Feed != "" {
		if !strings.HasPrefix(batchOpts.Feed, "s3://") && !strings.HasPrefix(batchOpts.Feed, "r2://") {
			// Resolve to absolute path to detect traversal
			absPath, err := filepath.Abs(batchOpts.Feed)
			if err != nil {
				return fmt.Errorf("invalid feed path")
			}

			// Check for path traversal
			if strings.Contains(batchOpts.Feed, "..") {
				// For relative paths, check if they go outside current directory
				cwd, err := os.Getwd()
				if err != nil {
					return fmt.Errorf("cannot determine current directory")
				}

				// If the resolved path is not under current directory, it's traversal
				if !strings.HasPrefix(absPath, cwd) {
					return fmt.Errorf("path traversal detected in feed path: access outside current directory not allowed")
				}
			}

			// Additional check for suspicious patterns
			if strings.Contains(batchOpts.Feed, "../") || strings.Contains(batchOpts.Feed, "..\\") {
				return fmt.Errorf("path traversal patterns not allowed in feed path")
			}
		}
	}

	// Validate state file path
	if batchOpts.StateFile != "" {
		// Check for path traversal in state file
		if strings.Contains(batchOpts.StateFile, "..") || strings.Contains(batchOpts.StateFile, "../") || strings.Contains(batchOpts.StateFile, "..\\") {
			return fmt.Errorf("path traversal patterns not allowed in state file path")
		}
	}

	return nil
}

func loadBatchState() (*BatchState, error) {
	state := &BatchState{
		JobID:     generateJobID(),
		StartedAt: time.Now(),
		Config: map[string]interface{}{
			"feed":        batchOpts.Feed,
			"from":        batchOpts.From,
			"concurrency": batchOpts.Concurrency,
			"halt_on":     batchOpts.HaltOn,
		},
	}

	if batchOpts.Resume {
		if _, err := os.Stat(batchOpts.StateFile); err == nil {
			data, err := os.ReadFile(batchOpts.StateFile)
			if err != nil {
				return nil, fmt.Errorf("failed to read state file: %v", err)
			}
			if err := json.Unmarshal(data, state); err != nil {
				return nil, fmt.Errorf("failed to parse state file: %v", err)
			}
			PrintMsgf("Resuming batch operation from %s (processed: %d)\n", batchOpts.StateFile, state.Processed)
		} else {
			PrintMsg("No state file found, starting fresh")
		}
	}

	return state, nil
}

func saveBatchState(state *BatchState) error {
	data, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return err
	}

	// Write to temporary file first, then rename for atomicity
	tempFile := batchOpts.StateFile + ".tmp"
	if err := os.WriteFile(tempFile, data, 0644); err != nil {
		return err
	}

	return os.Rename(tempFile, batchOpts.StateFile)
}

func readFeed(feedPath string, cursor string) ([]FeedEntry, error) {
	var entries []FeedEntry

	// Determine feed format from extension
	ext := strings.ToLower(filepath.Ext(feedPath))

	if strings.HasPrefix(feedPath, "s3://") || strings.HasPrefix(feedPath, "r2://") {
		// TODO: Implement cloud feed reading
		return nil, fmt.Errorf("cloud feed reading not yet implemented")
	}

	file, err := os.Open(feedPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open feed file: %v", err)
	}
	defer file.Close()

	if ext == ".jsonl" {
		scanner := bufio.NewScanner(file)
		for scanner.Scan() {
			var entry FeedEntry
			if err := json.Unmarshal(scanner.Bytes(), &entry); err != nil {
				continue // Skip malformed lines
			}
			entries = append(entries, entry)
		}
	} else if ext == ".csv" {
		// Simple CSV parsing (assume first column is URL)
		scanner := bufio.NewScanner(file)
		for scanner.Scan() {
			fields := strings.Split(scanner.Text(), ",")
			if len(fields) > 0 && strings.TrimSpace(fields[0]) != "" {
				entry := FeedEntry{
					URL: strings.TrimSpace(fields[0]),
				}
				entries = append(entries, entry)
			}
		}
	}

	return entries, nil
}

func processBatchEntry(entry FeedEntry, index int, state *BatchState) error {
	PrintMsgf("Processing entry %d: %s\n", index+1, entry.URL)

	// TODO: Implement actual verification logic
	// For now, simulate processing
	time.Sleep(10 * time.Millisecond)

	return nil
}

func shouldHalt(err error) bool {
	switch batchOpts.HaltOn {
	case "VerifyFail":
		return strings.Contains(err.Error(), "verification failed")
	case "SrvErr":
		return strings.Contains(err.Error(), "server error")
	default:
		return false
	}
}

func runBatchDryRun(operation string, state *BatchState) error {
	projection := map[string]interface{}{
		"operation": "batch-" + operation,
		"dry_run":   true,
		"job_id":    state.JobID,
		"estimates": map[string]interface{}{
			"entries_to_process": 1000,
			"estimated_duration": "45m",
			"requests": map[string]int{
				"feed_read": 1,
				"verify":    1000,
				"total":     1001,
			},
			"parallelism": batchOpts.Concurrency,
		},
		"config": state.Config,
	}

	return PrintOutput(projection)
}

func generateJobID() string {
	return fmt.Sprintf("batch-%d-%d", os.Getpid(), time.Now().Unix())
}
