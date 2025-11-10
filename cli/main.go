package main

import (
	"os"

	"github.com/credlink/cli/internal/cmd"
	"github.com/spf13/cobra"
)

func main() {
	// Set up panic recovery to prevent exposure of stack traces
	defer func() {
		if r := recover(); r != nil {
			// Log panic but don't expose stack trace in production
			os.Stderr.WriteString("Fatal error occurred. Please check logs for details.\n")
			os.Exit(cmd.ExitSrvErr)
		}
	}()

	var rootCmd = &cobra.Command{
		Use:   "c2c",
		Short: "C2 Concierge CLI - Cryptographic provenance tools",
		Long: `C2 Concierge CLI provides operator-grade power tools for signing, verifying,
inspecting, diffing, and large-scale batch jobs with resumable progress,
predictable exit codes, dry-run cost projection, and Compliance Pack export.`,
		Version:       "1.0.0",
		SilenceErrors: true, // Prevent Cobra from printing errors to stderr
		SilenceUsage:  true, // Prevent Cobra from printing usage on error
	}

	// Add global flags
	cmd.AddGlobalFlags(rootCmd)

	// Initialize all subcommands
	cmd.InitSignCommand(rootCmd)
	cmd.InitVerifyCommand(rootCmd)
	cmd.InitInspectCommand(rootCmd)
	cmd.InitDiffCommand(rootCmd)
	cmd.InitBatchCommand(rootCmd)
	cmd.InitPackCommand(rootCmd)
	cmd.InitCacheCommand(rootCmd)
	cmd.InitLsCommand(rootCmd)
	cmd.InitDoctorCommand(rootCmd)

	if err := rootCmd.Execute(); err != nil {
		// Determine appropriate exit code based on error type
		switch err {
		case cmd.ErrInputValidation:
			os.Exit(cmd.ExitInputErr)
		case cmd.ErrAuthentication:
			os.Exit(cmd.ExitAuthErr)
		case cmd.ErrNetwork:
			os.Exit(cmd.ExitNetErr)
		case cmd.ErrRateLimit:
			os.Exit(cmd.ExitRateLimit)
		case cmd.ErrServer:
			os.Exit(cmd.ExitSrvErr)
		default:
			os.Exit(cmd.ExitSrvErr)
		}
	}
}
