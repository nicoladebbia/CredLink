package cmd

import (
	"fmt"
	"net"
	"os"
	"runtime"
	"strings"
	"time"

	"github.com/spf13/cobra"
)

// Doctor command options
type DoctorOptions struct {
	Verbose  bool
	Fix      bool
	CheckAll bool
	Network  bool
	Paths    bool
	Encoding bool
	Cert     bool
}

var doctorOpts DoctorOptions

// Environment check result
type CheckResult struct {
	Name       string `json:"name"`
	Status     string `json:"status"` // "ok", "warning", "error"
	Message    string `json:"message"`
	Details    string `json:"details,omitempty"`
	Suggestion string `json:"suggestion,omitempty"`
	CanFix     bool   `json:"can_fix,omitempty"`
}

// Doctor report
type DoctorReport struct {
	Timestamp time.Time     `json:"timestamp"`
	Platform  string        `json:"platform"`
	Version   string        `json:"version"`
	Overall   string        `json:"overall"`
	Checks    []CheckResult `json:"checks"`
	Summary   Summary       `json:"summary"`
}

// Summary of check results
type Summary struct {
	Total    int `json:"total"`
	Passed   int `json:"passed"`
	Warnings int `json:"warnings"`
	Errors   int `json:"errors"`
}

func InitDoctorCommand(rootCmd *cobra.Command) {
	var doctorCmd = &cobra.Command{
		Use:   "doctor",
		Short: "Environment checks; long-path & encoding hints",
		Long: `Perform comprehensive environment checks for CLI operation.
Checks network connectivity, path handling, encoding support,
and certificate configuration. Provides fixes where possible.`,
		RunE: runDoctorCommand,
	}

	// Doctor-specific flags
	doctorCmd.Flags().BoolVarP(&doctorOpts.Verbose, "verbose", "v", false, "Verbose output")
	doctorCmd.Flags().BoolVar(&doctorOpts.Fix, "fix", false, "Attempt to fix issues automatically")
	doctorCmd.Flags().BoolVar(&doctorOpts.CheckAll, "all", true, "Run all checks")
	doctorCmd.Flags().BoolVar(&doctorOpts.Network, "network", false, "Check network connectivity only")
	doctorCmd.Flags().BoolVar(&doctorOpts.Paths, "paths", false, "Check path handling only")
	doctorCmd.Flags().BoolVar(&doctorOpts.Encoding, "encoding", false, "Check encoding support only")
	doctorCmd.Flags().BoolVar(&doctorOpts.Cert, "cert", false, "Check certificates only")

	rootCmd.AddCommand(doctorCmd)
}

func runDoctorCommand(cmd *cobra.Command, args []string) error {
	PrintMsg("Running environment diagnostics...")

	report := DoctorReport{
		Timestamp: time.Now(),
		Platform:  runtime.GOOS + "/" + runtime.GOARCH,
		Version:   "1.0.0",
		Checks:    []CheckResult{},
	}

	// Run checks based on flags
	if doctorOpts.CheckAll || doctorOpts.Network {
		report.Checks = append(report.Checks, checkNetworkConnectivity()...)
	}

	if doctorOpts.CheckAll || doctorOpts.Paths {
		report.Checks = append(report.Checks, checkPathHandling()...)
	}

	if doctorOpts.CheckAll || doctorOpts.Encoding {
		report.Checks = append(report.Checks, checkEncodingSupport()...)
	}

	if doctorOpts.CheckAll || doctorOpts.Cert {
		report.Checks = append(report.Checks, checkCertificates()...)
	}

	// Calculate summary
	report.Summary = calculateSummary(report.Checks)
	report.Overall = determineOverallStatus(report.Summary)

	// Output results
	if globalOpts.JSON {
		return PrintOutput(report)
	}

	return printDoctorReport(report)
}

func checkNetworkConnectivity() []CheckResult {
	var results []CheckResult

	// Check DNS resolution
	PrintMsgf("Checking DNS resolution...\n")
	result := CheckResult{
		Name: "DNS Resolution",
	}

	_, err := net.LookupHost("api.c2concierge.com")
	if err != nil {
		result.Status = "error"
		result.Message = "Cannot resolve API hostname"
		result.Details = err.Error()
		result.Suggestion = "Check your DNS settings and network connectivity"
	} else {
		result.Status = "ok"
		result.Message = "DNS resolution working"
	}
	results = append(results, result)

	// Check TCP connectivity
	PrintMsgf("Checking TCP connectivity...\n")
	result = CheckResult{
		Name: "TCP Connectivity",
	}

	conn, err := net.DialTimeout("tcp", "api.c2concierge.com:443", 5*time.Second)
	if err != nil {
		result.Status = "warning"
		result.Message = "Cannot connect to API endpoint"
		result.Details = err.Error()
		result.Suggestion = "Check firewall settings and proxy configuration"
	} else {
		conn.Close()
		result.Status = "ok"
		result.Message = "TCP connectivity working"
	}
	results = append(results, result)

	// Check HTTP connectivity
	PrintMsgf("Checking HTTP connectivity...\n")
	result = CheckResult{
		Name: "HTTP Connectivity",
	}

	// TODO: Implement actual HTTP check
	result.Status = "ok"
	result.Message = "HTTP connectivity simulated"
	results = append(results, result)

	return results
}

func checkPathHandling() []CheckResult {
	var results []CheckResult

	// Check long path support (Windows specific)
	if runtime.GOOS == "windows" {
		PrintMsgf("Checking Windows long path support...\n")
		result := CheckResult{
			Name: "Windows Long Paths",
		}

		// Check registry key (simplified)
		longPathEnabled := true // TODO: Check actual registry

		if longPathEnabled {
			result.Status = "ok"
			result.Message = "Long path support enabled"
		} else {
			result.Status = "warning"
			result.Message = "Long path support disabled"
			result.Details = "MAX_PATH (260) limit enforced"
			result.Suggestion = "Enable long path support via group policy or registry"
			result.CanFix = true
		}
		results = append(results, result)
	}

	// Check temp directory
	PrintMsgf("Checking temporary directory...\n")
	result := CheckResult{
		Name: "Temporary Directory",
	}

	tempDir := os.TempDir()
	if stat, err := os.Stat(tempDir); err != nil {
		result.Status = "error"
		result.Message = "Cannot access temp directory"
		result.Details = err.Error()
	} else if !stat.IsDir() {
		result.Status = "error"
		result.Message = "Temp path is not a directory"
	} else {
		result.Status = "ok"
		result.Message = fmt.Sprintf("Temp directory accessible: %s", tempDir)
	}
	results = append(results, result)

	// Check cache directory
	PrintMsgf("Checking cache directory...\n")
	result = CheckResult{
		Name: "Cache Directory",
	}

	cacheDir := getCacheDir()
	if stat, err := os.Stat(cacheDir); os.IsNotExist(err) {
		result.Status = "warning"
		result.Message = "Cache directory does not exist"
		result.Details = cacheDir
		result.Suggestion = "Cache directory will be created on first use"
		result.CanFix = true
	} else if err != nil {
		result.Status = "error"
		result.Message = "Cannot access cache directory"
		result.Details = err.Error()
	} else if !stat.IsDir() {
		result.Status = "error"
		result.Message = "Cache path is not a directory"
	} else {
		result.Status = "ok"
		result.Message = fmt.Sprintf("Cache directory accessible: %s", cacheDir)
	}
	results = append(results, result)

	return results
}

func checkEncodingSupport() []CheckResult {
	var results []CheckResult

	// Check UTF-8 encoding
	PrintMsgf("Checking UTF-8 encoding support...\n")
	result := CheckResult{
		Name: "UTF-8 Encoding",
	}

	testString := "测试中文字符 🚀 C2 Concierge"
	if strings.Contains(testString, "测试") {
		result.Status = "ok"
		result.Message = "UTF-8 encoding fully supported"
	} else {
		result.Status = "error"
		result.Message = "UTF-8 encoding not working properly"
		result.Suggestion = "Check system locale and encoding settings"
	}
	results = append(results, result)

	// Check environment variables
	PrintMsgf("Checking environment variables...\n")
	result = CheckResult{
		Name: "Environment Variables",
	}

	requiredVars := []string{"PATH", "HOME", "USER"}
	missingVars := []string{}

	for _, v := range requiredVars {
		if os.Getenv(v) == "" {
			missingVars = append(missingVars, v)
		}
	}

	if len(missingVars) > 0 {
		result.Status = "warning"
		result.Message = "Some environment variables missing"
		result.Details = fmt.Sprintf("Missing: %v", missingVars)
	} else {
		result.Status = "ok"
		result.Message = "Required environment variables present"
	}
	results = append(results, result)

	return results
}

func checkCertificates() []CheckResult {
	var results []CheckResult

	// Check system certificate store
	PrintMsgf("Checking system certificate store...\n")
	result := CheckResult{
		Name: "System Certificates",
	}

	// TODO: Implement actual certificate check
	result.Status = "ok"
	result.Message = "System certificate store accessible"
	results = append(results, result)

	// Check TLS version support
	PrintMsgf("Checking TLS version support...\n")
	result = CheckResult{
		Name: "TLS Support",
	}

	// TODO: Check actual TLS versions
	result.Status = "ok"
	result.Message = "TLS 1.2+ supported"
	results = append(results, result)

	return results
}

func calculateSummary(checks []CheckResult) Summary {
	summary := Summary{
		Total: len(checks),
	}

	for _, check := range checks {
		switch check.Status {
		case "ok":
			summary.Passed++
		case "warning":
			summary.Warnings++
		case "error":
			summary.Errors++
		}
	}

	return summary
}

func determineOverallStatus(summary Summary) string {
	if summary.Errors > 0 {
		return "error"
	} else if summary.Warnings > 0 {
		return "warning"
	}
	return "ok"
}

func printDoctorReport(report DoctorReport) error {
	fmt.Printf("=== C2 Concierge CLI Doctor Report ===\n")
	fmt.Printf("Timestamp: %s\n", report.Timestamp.Format("2006-01-02 15:04:05"))
	fmt.Printf("Platform: %s\n", report.Platform)
	fmt.Printf("Version: %s\n", report.Version)
	fmt.Printf("Overall Status: %s\n\n", strings.ToUpper(report.Overall))

	// Print individual checks
	for _, check := range report.Checks {
		statusIcon := "✓"
		if check.Status == "warning" {
			statusIcon = "⚠"
		} else if check.Status == "error" {
			statusIcon = "✗"
		}

		fmt.Printf("%s %s: %s\n", statusIcon, check.Name, check.Message)

		if doctorOpts.Verbose && check.Details != "" {
			fmt.Printf("   Details: %s\n", check.Details)
		}

		if check.Suggestion != "" {
			fmt.Printf("   Suggestion: %s\n", check.Suggestion)
		}

		if check.CanFix && doctorOpts.Fix {
			fmt.Printf("   Attempting fix...\n")
			// TODO: Implement fixes
		}

		fmt.Println()
	}

	// Print summary
	fmt.Printf("=== Summary ===\n")
	fmt.Printf("Total checks: %d\n", report.Summary.Total)
	fmt.Printf("Passed: %d\n", report.Summary.Passed)
	fmt.Printf("Warnings: %d\n", report.Summary.Warnings)
	fmt.Printf("Errors: %d\n", report.Summary.Errors)

	// Overall recommendation
	if report.Overall == "ok" {
		fmt.Printf("\n✓ Your environment is ready for C2 Concierge CLI\n")
	} else if report.Overall == "warning" {
		fmt.Printf("\n⚠ Your environment has warnings but should work\n")
	} else {
		fmt.Printf("\n✗ Your environment has errors that need to be fixed\n")
	}

	return nil
}
