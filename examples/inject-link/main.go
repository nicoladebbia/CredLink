package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"

	"github.com/credlink/sdk-go/v2/c2c"
)

func main() {
	var (
		input     = flag.String("input", "", "Input file or directory path")
		output    = flag.String("output", "", "Output file or directory path")
		manifest  = flag.String("manifest", "", "Manifest URL template")
		strategy  = flag.String("strategy", "sha256_path", "URL generation strategy")
		selector  = flag.String("selector", "img[src], video[src], audio[src]", "CSS selector")
		pattern   = flag.String("pattern", "*.html", "File pattern for directory processing")
		noBackup  = flag.Bool("no-backup", false, "Skip creating backup files")
	)
	flag.Parse()

	if *input == "" || *output == "" || *manifest == "" {
		fmt.Println("Usage: go run inject_link.go -input <path> -output <path> -manifest <url> [options]")
		flag.PrintDefaults()
		os.Exit(1)
	}

	apiKey := os.Getenv("C2_API_KEY")
	if apiKey == "" {
		log.Fatal("C2_API_KEY environment variable is required")
	}

	// Check if input is file or directory
	info, err := os.Stat(*input)
	if err != nil {
		log.Fatalf("Failed to stat input path: %v", err)
	}

	if info.IsDir() {
		// Process directory
		err = injectLinksInDirectory(*input, *output, *manifest, *strategy, *selector, *pattern, !*noBackup)
	} else {
		// Process single file
		err = injectLinksInFile(*input, *output, *manifest, *strategy, *selector)
	}

	if err != nil {
		log.Fatalf("Failed to inject links: %v", err)
	}
}

func injectLinksInFile(inputPath, outputPath, manifestURL, strategy, selector string) error {
	fmt.Printf("Processing %s...\n", inputPath)

	client := c2c.NewClientWithAPIKey(os.Getenv("C2_API_KEY"))
	defer client.Close()

	// Read HTML content
	htmlContent, err := os.ReadFile(inputPath)
	if err != nil {
		return fmt.Errorf("failed to read input file: %w", err)
	}

	// Inject links
	result, err := client.InjectLink(context.Background(), string(htmlContent), c2c.InjectLinkOptions{
		ManifestURL: manifestURL,
		Strategy:    &strategy,
		Selector:    &selector,
	})
	if err != nil {
		return fmt.Errorf("failed to inject links: %w", err)
	}

	// Write modified HTML
	err = os.WriteFile(outputPath, []byte(result.Data.HTML), 0644)
	if err != nil {
		return fmt.Errorf("failed to write output file: %w", err)
	}

	fmt.Printf("  ✅ Injected %d links\n", result.Data.LinksInjected)
	fmt.Printf("  Output saved to %s\n", outputPath)

	// Show processed assets
	if len(result.Data.AssetsProcessed) > 0 {
		fmt.Println("  Processed assets:")
		for _, asset := range result.Data.AssetsProcessed {
			fmt.Printf("    - %s\n", asset)
		}
	}

	return nil
}

func injectLinksInDirectory(inputDir, outputDir, manifestURL, strategy, selector, pattern string, backup bool) error {
	// Create output directory
	err := os.MkdirAll(outputDir, 0755)
	if err != nil {
		return fmt.Errorf("failed to create output directory: %w", err)
	}

	// Find HTML files
	files, err := filepath.Glob(filepath.Join(inputDir, pattern))
	if err != nil {
		return fmt.Errorf("failed to find HTML files: %w", err)
	}

	if len(files) == 0 {
		fmt.Printf("No HTML files found in %s\n", inputDir)
		return nil
	}

	fmt.Printf("Found %d HTML files\n", len(files))

	// Process each file
	for _, inputFile := range files {
		// Calculate relative path and output location
		relPath, err := filepath.Rel(inputDir, inputFile)
		if err != nil {
			log.Printf("Warning: failed to get relative path for %s: %v", inputFile, err)
			continue
		}

		outputFile := filepath.Join(outputDir, relPath)

		// Create subdirectories if needed
		err = os.MkdirAll(filepath.Dir(outputFile), 0755)
		if err != nil {
			log.Printf("Warning: failed to create output directory for %s: %v", outputFile, err)
			continue
		}

		// Backup original file if requested and paths are the same
		if backup && inputFile == outputFile {
			backupPath := inputFile + ".backup"
			if _, err := os.Stat(backupPath); os.IsNotExist(err) {
				err = os.Rename(inputFile, backupPath)
				if err != nil {
					log.Printf("Warning: failed to create backup for %s: %v", inputFile, err)
				} else {
					fmt.Printf("  Created backup: %s\n", backupPath)
				}
			}
		}

		// Inject links
		err = injectLinksInFile(inputFile, outputFile, manifestURL, strategy, selector)
		if err != nil {
			log.Printf("Error processing %s: %v", inputFile, err)
		}
	}

	return nil
}
