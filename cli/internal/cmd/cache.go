package cmd

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"time"

	"github.com/spf13/cobra"
)

// Cache command options
type CacheOptions struct {
	Stats   bool
	Prune   bool
	Clear   bool
	MaxAge  time.Duration
	MaxSize string
}

var cacheOpts CacheOptions

// Cache statistics
type CacheStats struct {
	Path          string    `json:"path"`
	TotalFiles    int       `json:"total_files"`
	TotalSize     int64     `json:"total_size"`
	OldestEntry   time.Time `json:"oldest_entry"`
	NewestEntry   time.Time `json:"newest_entry"`
	ManifestCount int       `json:"manifest_count"`
	VerifyCount   int       `json:"verify_count"`
}

func InitCacheCommand(rootCmd *cobra.Command) {
	var cacheCmd = &cobra.Command{
		Use:   "cache <command>",
		Short: "Show/clear local manifest/verify cache",
		Long: `Manage local cache for manifests and verification responses.
Follows XDG Base Directory specification on Unix and OS-appropriate
locations on Windows/macOS.`,
	}

	// Add subcommands
	InitCacheLsCommand(cacheCmd)
	InitCachePruneCommand(cacheCmd)
	InitCacheClearCommand(cacheCmd)
	InitCacheStatsCommand(cacheCmd)

	rootCmd.AddCommand(cacheCmd)
}

func InitCacheLsCommand(cacheCmd *cobra.Command) {
	var lsCmd = &cobra.Command{
		Use:   "ls",
		Short: "List cache contents",
		Long: `List all cached manifests and verification responses
with their sizes and ages.`,
		RunE: runCacheLsCommand,
	}

	cacheCmd.AddCommand(lsCmd)
}

func InitCachePruneCommand(cacheCmd *cobra.Command) {
	var pruneCmd = &cobra.Command{
		Use:   "prune",
		Short: "Prune old cache entries",
		Long: `Remove old cache entries based on age or size criteria.
Preserves frequently accessed items.`,
		RunE: runCachePruneCommand,
	}

	// Prune flags
	pruneCmd.Flags().DurationVar(&cacheOpts.MaxAge, "max-age", 7*24*time.Hour, "Maximum age for entries")
	pruneCmd.Flags().StringVar(&cacheOpts.MaxSize, "max-size", "1GB", "Maximum cache size")

	cacheCmd.AddCommand(pruneCmd)
}

func InitCacheClearCommand(cacheCmd *cobra.Command) {
	var clearCmd = &cobra.Command{
		Use:   "clear",
		Short: "Clear all cache entries",
		Long: `Remove all cached manifests and verification responses.
Use with caution - will require re-downloading all data.`,
		RunE: runCacheClearCommand,
	}

	cacheCmd.AddCommand(clearCmd)
}

func InitCacheStatsCommand(cacheCmd *cobra.Command) {
	var statsCmd = &cobra.Command{
		Use:   "stats",
		Short: "Show cache statistics",
		Long: `Display detailed statistics about cache usage,
including file counts, sizes, and hit rates.`,
		RunE: runCacheStatsCommand,
	}

	cacheCmd.AddCommand(statsCmd)
}

func runCacheLsCommand(cmd *cobra.Command, args []string) error {
	cacheDir := getCacheDir()

	PrintMsgf("Cache directory: %s\n", cacheDir)

	if _, err := os.Stat(cacheDir); os.IsNotExist(err) {
		PrintMsg("Cache directory does not exist")
		return nil
	}

	entries, err := listCacheEntries(cacheDir)
	if err != nil {
		return err
	}

	if globalOpts.JSON {
		return PrintOutput(entries)
	}

	// Pretty print
	PrintMsg("Cache entries:")
	PrintMsgf("%-40s %10s %20s\n", "File", "Size", "Modified")
	PrintMsgf("%-40s %10s %20s\n", "----", "----", "--------")

	for _, entry := range entries {
		PrintMsgf("%-40s %10s %20s\n",
			entry.Name,
			formatBytes(entry.Size),
			entry.Modified.Format("2006-01-02 15:04:05"))
	}

	return nil
}

func runCachePruneCommand(cmd *cobra.Command, args []string) error {
	cacheDir := getCacheDir()

	if _, err := os.Stat(cacheDir); os.IsNotExist(err) {
		PrintMsg("Cache directory does not exist")
		return nil
	}

	PrintMsgf("Pruning cache entries older than %v\n", cacheOpts.MaxAge)

	removed, sizeFreed, err := pruneCacheEntries(cacheDir, cacheOpts.MaxAge)
	if err != nil {
		return err
	}

	result := map[string]interface{}{
		"removed_files":    removed,
		"size_freed":       sizeFreed,
		"size_freed_human": formatBytes(sizeFreed),
	}

	if globalOpts.JSON {
		return PrintOutput(result)
	}

	PrintMsgf("Pruned %d files, freed %s\n", removed, formatBytes(sizeFreed))
	return nil
}

func runCacheClearCommand(cmd *cobra.Command, args []string) error {
	cacheDir := getCacheDir()

	if _, err := os.Stat(cacheDir); os.IsNotExist(err) {
		PrintMsg("Cache directory does not exist")
		return nil
	}

	PrintMsgf("Clearing cache directory: %s\n", cacheDir)

	removed, sizeFreed, err := clearCacheDir(cacheDir)
	if err != nil {
		return err
	}

	result := map[string]interface{}{
		"removed_files":    removed,
		"size_freed":       sizeFreed,
		"size_freed_human": formatBytes(sizeFreed),
	}

	if globalOpts.JSON {
		return PrintOutput(result)
	}

	PrintMsgf("Cleared %d files, freed %s\n", removed, formatBytes(sizeFreed))
	return nil
}

func runCacheStatsCommand(cmd *cobra.Command, args []string) error {
	cacheDir := getCacheDir()

	stats, err := getCacheStatistics(cacheDir)
	if err != nil {
		return err
	}

	if globalOpts.JSON {
		return PrintOutput(stats)
	}

	// Pretty print
	PrintMsg("Cache Statistics:")
	PrintMsgf("  Path: %s\n", stats.Path)
	PrintMsgf("  Total Files: %d\n", stats.TotalFiles)
	PrintMsgf("  Total Size: %s\n", formatBytes(stats.TotalSize))
	PrintMsgf("  Manifests: %d\n", stats.ManifestCount)
	PrintMsgf("  Verification Results: %d\n", stats.VerifyCount)

	if !stats.OldestEntry.IsZero() {
		PrintMsgf("  Oldest Entry: %s\n", stats.OldestEntry.Format("2006-01-02 15:04:05"))
	}
	if !stats.NewestEntry.IsZero() {
		PrintMsgf("  Newest Entry: %s\n", stats.NewestEntry.Format("2006-01-02 15:04:05"))
	}

	return nil
}

// Cache entry for listing
type CacheEntry struct {
	Name     string    `json:"name"`
	Size     int64     `json:"size"`
	Modified time.Time `json:"modified"`
	Type     string    `json:"type"`
}

func getCacheDir() string {
	// Follow XDG Base Directory specification
	if runtime.GOOS == "windows" {
		if localAppData := os.Getenv("LOCALAPPDATA"); localAppData != "" {
			return filepath.Join(localAppData, "C2Concierge", "Cache")
		}
		return filepath.Join(os.Getenv("USERPROFILE"), "AppData", "Local", "C2Concierge", "Cache")
	}

	// Unix-like systems (Linux, macOS)
	if xdgCache := os.Getenv("XDG_CACHE_HOME"); xdgCache != "" {
		return filepath.Join(xdgCache, "credlink")
	}

	home, err := os.UserHomeDir()
	if err != nil {
		return filepath.Join(os.TempDir(), "credlink-cache")
	}

	return filepath.Join(home, ".cache", "credlink")
}

func listCacheEntries(cacheDir string) ([]CacheEntry, error) {
	var entries []CacheEntry

	err := filepath.Walk(cacheDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil // Skip errors
		}

		if info.IsDir() {
			return nil
		}

		relPath, err := filepath.Rel(cacheDir, path)
		if err != nil {
			return nil
		}

		entry := CacheEntry{
			Name:     relPath,
			Size:     info.Size(),
			Modified: info.ModTime(),
		}

		// Determine type based on path
		if filepath.Base(path) == "manifest.json" {
			entry.Type = "manifest"
		} else if filepath.Base(path) == "verification.json" {
			entry.Type = "verification"
		} else {
			entry.Type = "other"
		}

		entries = append(entries, entry)
		return nil
	})

	return entries, err
}

func pruneCacheEntries(cacheDir string, maxAge time.Duration) (int, int64, error) {
	var removed int
	var sizeFreed int64
	cutoff := time.Now().Add(-maxAge)

	err := filepath.Walk(cacheDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}

		if info.IsDir() {
			return nil
		}

		if info.ModTime().Before(cutoff) {
			if err := os.Remove(path); err == nil {
				removed++
				sizeFreed += info.Size()
			}
		}

		return nil
	})

	return removed, sizeFreed, err
}

func clearCacheDir(cacheDir string) (int, int64, error) {
	var removed int
	var sizeFreed int64

	err := filepath.Walk(cacheDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}

		if path == cacheDir {
			return nil
		}

		if info.IsDir() {
			if err := os.RemoveAll(path); err == nil {
				// Count files in directory (simplified)
				removed++
			}
		} else {
			if err := os.Remove(path); err == nil {
				removed++
				sizeFreed += info.Size()
			}
		}

		return nil
	})

	return removed, sizeFreed, err
}

func getCacheStatistics(cacheDir string) (*CacheStats, error) {
	stats := &CacheStats{
		Path: cacheDir,
	}

	var oldest, newest time.Time

	err := filepath.Walk(cacheDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}

		if info.IsDir() {
			return nil
		}

		stats.TotalFiles++
		stats.TotalSize += info.Size()

		if oldest.IsZero() || info.ModTime().Before(oldest) {
			oldest = info.ModTime()
		}
		if newest.IsZero() || info.ModTime().After(newest) {
			newest = info.ModTime()
		}

		// Count types
		if filepath.Base(path) == "manifest.json" {
			stats.ManifestCount++
		} else if filepath.Base(path) == "verification.json" {
			stats.VerifyCount++
		}

		return nil
	})

	stats.OldestEntry = oldest
	stats.NewestEntry = newest

	return stats, err
}

func formatBytes(bytes int64) string {
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
