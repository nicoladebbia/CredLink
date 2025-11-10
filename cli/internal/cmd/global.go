package cmd

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"time"

	"github.com/spf13/cobra"
)

// Define error types for proper error handling
var (
	ErrInputValidation = errors.New("input validation error")
	ErrAuthentication  = errors.New("authentication error")
	ErrNetwork         = errors.New("network error")
	ErrRateLimit       = errors.New("rate limit error")
	ErrServer          = errors.New("server error")
)

// Global flags structure
type GlobalOptions struct {
	JSON           bool
	Quiet          bool
	Yes            bool
	Profile        string
	Endpoint       string
	Retries        int
	Timeout        time.Duration
	IdempotencyKey string
	DryRun         bool
}

// Exit codes as specified
const (
	ExitOK          = 0
	ExitVerifyFail  = 2
	ExitPartialFail = 3
	ExitInputErr    = 4
	ExitAuthErr     = 5
	ExitRateLimit   = 6
	ExitNetErr      = 7
	ExitSrvErr      = 8
)

// Global options instance
var globalOpts GlobalOptions

// Add global flags to a command
func AddGlobalFlags(cmd *cobra.Command) {
	cmd.PersistentFlags().BoolVar(&globalOpts.JSON, "json", false, "Output JSON format (machine-readable)")
	cmd.PersistentFlags().BoolVar(&globalOpts.Quiet, "quiet", false, "Suppress non-error output")
	cmd.PersistentFlags().BoolVar(&globalOpts.Yes, "yes", false, "Auto-confirm prompts")
	cmd.PersistentFlags().StringVar(&globalOpts.Profile, "profile", "", "Signing profile ID")
	cmd.PersistentFlags().StringVar(&globalOpts.Endpoint, "endpoint", "https://api.credlink.com/v1", "API endpoint URL")
	cmd.PersistentFlags().IntVar(&globalOpts.Retries, "retries", 5, "Maximum retry attempts")
	cmd.PersistentFlags().DurationVar(&globalOpts.Timeout, "timeout", 30*time.Second, "Request timeout")
	cmd.PersistentFlags().StringVar(&globalOpts.IdempotencyKey, "idempotency-key", "", "Idempotency key for safe retries")
	cmd.PersistentFlags().BoolVar(&globalOpts.DryRun, "dry-run", false, "Show what would be done without executing")
}

// Print output based on global flags
func PrintOutput(data interface{}) error {
	if globalOpts.JSON {
		encoder := json.NewEncoder(os.Stdout)
		encoder.SetIndent("", "  ")
		return encoder.Encode(data)
	}

	// Default pretty output
	switch v := data.(type) {
	case string:
		fmt.Println(v)
	case error:
		fmt.Fprintf(os.Stderr, "Error: %v\n", v)
	default:
		encoder := json.NewEncoder(os.Stdout)
		encoder.SetIndent("", "  ")
		return encoder.Encode(data)
	}
	return nil
}

// Print message only if not quiet
func PrintMsg(message string) {
	if !globalOpts.Quiet {
		fmt.Fprintln(os.Stdout, message)
	}
}

// Print formatted message only if not quiet (safe for controlled internal use)
func PrintMsgf(format string, args ...interface{}) {
	if !globalOpts.Quiet {
		fmt.Printf(format, args...)
	}
}

// Print error message (safe for controlled internal use)
func PrintErrf(format string, args ...interface{}) {
	fmt.Fprintf(os.Stderr, format, args...)
}

// Print error message
func PrintErr(message string) {
	fmt.Fprintln(os.Stderr, message)
}
