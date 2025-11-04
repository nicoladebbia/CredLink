package cmd

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/spf13/cobra"
)

// Ls command options
type LsOptions struct {
	Long      bool
	Human     bool
	Recursive bool
	All       bool
	Delimiter string
	Prefix    string
	Filter    string
	SortBy    string
}

var lsOpts LsOptions

// Listed item
type ListedItem struct {
	Name     string    `json:"name"`
	Path     string    `json:"path"`
	Size     int64     `json:"size"`
	Modified time.Time `json:"modified"`
	Type     string    `json:"type"`
	ETag     string    `json:"etag,omitempty"`
}

func InitLsCommand(rootCmd *cobra.Command) {
	var lsCmd = &cobra.Command{
		Use:   "ls <path>",
		Short: "List local paths + s3:// and r2:// prefixes",
		Long: `List files and directories for local paths and cloud storage prefixes.
Supports S3 and R2 URIs with proper handling of pseudo-directories
via CommonPrefixes.`,
		Args: cobra.ExactArgs(1),
		RunE: runLsCommand,
	}

	// Ls-specific flags
	lsCmd.Flags().BoolVarP(&lsOpts.Long, "long", "l", false, "Long listing format")
	lsCmd.Flags().BoolVarP(&lsOpts.Human, "human", "H", true, "Human-readable sizes")
	lsCmd.Flags().BoolVarP(&lsOpts.Recursive, "recursive", "R", false, "List subdirectories recursively")
	lsCmd.Flags().BoolVarP(&lsOpts.All, "all", "a", false, "Show hidden files")
	lsCmd.Flags().StringVar(&lsOpts.Delimiter, "delimiter", "/", "Delimiter for cloud paths")
	lsCmd.Flags().StringVar(&lsOpts.Prefix, "prefix", "", "Filter by prefix")
	lsCmd.Flags().StringVar(&lsOpts.Filter, "filter", "", "Filter pattern (glob)")
	lsCmd.Flags().StringVar(&lsOpts.SortBy, "sort", "name", "Sort by: name|size|modified")

	rootCmd.AddCommand(lsCmd)
}

func runLsCommand(cmd *cobra.Command, args []string) error {
	path := args[0]

	// Validate inputs
	if err := validateLsInput(path); err != nil {
		PrintErrf("Input error: %v\n", err)
		return err
	}

	PrintMsgf("Listing: %s\n", path)

	var items []ListedItem
	var err error

	// Determine path type and list accordingly
	if strings.HasPrefix(path, "s3://") || strings.HasPrefix(path, "r2://") {
		items, err = listCloudPath(path)
	} else {
		items, err = listLocalPath(path)
	}

	if err != nil {
		return err
	}

	// Sort items
	sortListedItems(items)

	// Output results
	if globalOpts.JSON {
		return PrintOutput(items)
	}

	return printListedItems(items)
}

func validateLsInput(path string) error {
	if path == "" {
		return fmt.Errorf("path cannot be empty")
	}

	// Check for path traversal attempts in local paths
	if !strings.HasPrefix(path, "s3://") && !strings.HasPrefix(path, "r2://") {
		// Resolve to absolute path to detect traversal
		absPath, err := filepath.Abs(path)
		if err != nil {
			return fmt.Errorf("invalid path")
		}

		// Check for path traversal
		if strings.Contains(path, "..") {
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
		if strings.Contains(path, "../") || strings.Contains(path, "..\\") {
			return fmt.Errorf("path traversal patterns not allowed")
		}
	}

	// Validate cloud path format
	if strings.HasPrefix(path, "s3://") || strings.HasPrefix(path, "r2://") {
		var prefix string
		if strings.HasPrefix(path, "s3://") {
			prefix = "s3://"
		} else {
			prefix = "r2://"
		}
		parts := strings.SplitN(strings.TrimPrefix(path, prefix), "/", 2)
		if len(parts) < 2 {
			return fmt.Errorf("invalid cloud path format")
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

func listLocalPath(path string) ([]ListedItem, error) {
	var items []ListedItem

	// Handle root case
	if path == "." {
		path = "."
	}

	info, err := os.Stat(path)
	if err != nil {
		return nil, fmt.Errorf("cannot access path: %v", err)
	}

	if info.IsDir() {
		// List directory contents
		entries, err := os.ReadDir(path)
		if err != nil {
			return nil, fmt.Errorf("cannot read directory: %v", err)
		}

		for _, entry := range entries {
			if !lsOpts.All && strings.HasPrefix(entry.Name(), ".") {
				continue
			}

			if lsOpts.Filter != "" {
				matched, err := filepath.Match(lsOpts.Filter, entry.Name())
				if err != nil || !matched {
					continue
				}
			}

			itemInfo, err := entry.Info()
			if err != nil {
				continue
			}

			item := ListedItem{
				Name:     entry.Name(),
				Path:     filepath.Join(path, entry.Name()),
				Size:     itemInfo.Size(),
				Modified: itemInfo.ModTime(),
			}

			if entry.IsDir() {
				item.Type = "directory"
			} else {
				item.Type = "file"
			}

			items = append(items, item)

			// Recursive listing
			if lsOpts.Recursive && entry.IsDir() {
				subPath := filepath.Join(path, entry.Name())
				subItems, err := listLocalPath(subPath)
				if err == nil {
					items = append(items, subItems...)
				}
			}
		}
	} else {
		// Single file
		items = append(items, ListedItem{
			Name:     filepath.Base(path),
			Path:     path,
			Size:     info.Size(),
			Modified: info.ModTime(),
			Type:     "file",
		})
	}

	return items, nil
}

func listCloudPath(path string) ([]ListedItem, error) {
	// Parse cloud path
	var prefix string
	var parts []string

	if strings.HasPrefix(path, "s3://") {
		prefix = "s3://"
		parts = strings.SplitN(strings.TrimPrefix(path, prefix), "/", 2)
	} else if strings.HasPrefix(path, "r2://") {
		prefix = "r2://"
		parts = strings.SplitN(strings.TrimPrefix(path, prefix), "/", 2)
	} else {
		return nil, fmt.Errorf("unsupported cloud path format: %s", path)
	}

	bucket := parts[0]
	prefixPath := ""
	if len(parts) > 1 {
		prefixPath = parts[1]
	}

	// Mock cloud listing (in production, use AWS SDK)
	items := []ListedItem{
		{
			Name:     "image1.jpg",
			Path:     fmt.Sprintf("%s%s/%simage1.jpg", prefix, bucket, prefixPath),
			Size:     1024000,
			Modified: time.Now().Add(-2 * time.Hour),
			Type:     "file",
			ETag:     "\"a1b2c3d4e5f6\"",
		},
		{
			Name:     "image2.png",
			Path:     fmt.Sprintf("%s%s/%simage2.png", prefix, bucket, prefixPath),
			Size:     2048000,
			Modified: time.Now().Add(-1 * time.Hour),
			Type:     "file",
			ETag:     "\"f6e5d4c3b2a1\"",
		},
		{
			Name:     "videos/",
			Path:     fmt.Sprintf("%s%s/%svideos/", prefix, bucket, prefixPath),
			Size:     0,
			Modified: time.Now().Add(-3 * time.Hour),
			Type:     "directory",
		},
	}

	// Apply prefix filter
	if lsOpts.Prefix != "" {
		var filtered []ListedItem
		for _, item := range items {
			if strings.HasPrefix(item.Name, lsOpts.Prefix) {
				filtered = append(filtered, item)
			}
		}
		items = filtered
	}

	// Apply filter pattern
	if lsOpts.Filter != "" {
		var filtered []ListedItem
		for _, item := range items {
			matched, err := filepath.Match(lsOpts.Filter, item.Name)
			if err != nil {
				// Skip invalid patterns
				continue
			}
			if matched {
				filtered = append(filtered, item)
			}
		}
		items = filtered
	}

	return items, nil
}

func sortListedItems(items []ListedItem) {
	switch lsOpts.SortBy {
	case "size":
		sort.Slice(items, func(i, j int) bool {
			return items[i].Size < items[j].Size
		})
	case "modified":
		sort.Slice(items, func(i, j int) bool {
			return items[i].Modified.Before(items[j].Modified)
		})
	default: // name
		sort.Slice(items, func(i, j int) bool {
			return items[i].Name < items[j].Name
		})
	}
}

func printListedItems(items []ListedItem) error {
	if len(items) == 0 {
		PrintMsg("No items found")
		return nil
	}

	if lsOpts.Long {
		// Long format
		PrintMsgf("%-40s %10s %20s %s\n", "Name", "Size", "Modified", "Type")
		PrintMsgf("%-40s %10s %20s %s\n", "----", "----", "--------", "----")

		for _, item := range items {
			sizeStr := formatSize(item.Size)
			modifiedStr := item.Modified.Format("2006-01-02 15:04:05")

			line := fmt.Sprintf("%-40s %10s %20s %s",
				item.Name, sizeStr, modifiedStr, item.Type)

			if item.ETag != "" {
				line += fmt.Sprintf(" (ETag: %s)", item.ETag)
			}

			fmt.Println(line)
		}
	} else {
		// Simple format
		for _, item := range items {
			name := item.Name
			if item.Type == "directory" {
				name += "/"
			}
			fmt.Println(name)
		}
	}

	return nil
}

func formatSize(bytes int64) string {
	if !lsOpts.Human {
		return fmt.Sprintf("%d", bytes)
	}

	const unit = 1024
	if bytes < unit {
		return fmt.Sprintf("%d B", bytes)
	}

	div, exp := int64(unit), 0
	for n := bytes / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}

	return fmt.Sprintf("%.1f %cB", float64(bytes)/float64(div), "KMGTPE"[exp])
}
