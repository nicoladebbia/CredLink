#!/usr/bin/env python3
"""
Example: Inject C2PA manifest links into HTML files
"""

import argparse
import asyncio
import os
import sys
from pathlib import Path
from typing import Dict, Optional

from credlink import Client


async def inject_links_in_file(
    input_path: str,
    output_path: str,
    manifest_url: str,
    strategy: str = 'sha256_path',
    selector: str = 'img[src], video[src], audio[src]'
) -> None:
    """Inject manifest links into a single HTML file"""
    client = Client(api_key=os.getenv('C2_API_KEY'))
    
    print(f"Processing {input_path}...")
    
    # Read HTML content
    with open(input_path, 'r') as f:
        html_content = f.read()
    
    # Inject links
    try:
        result = await client.inject_link(
            html_content,
            {
                'manifest_url': manifest_url,
                'strategy': strategy,
                'selector': selector
            }
        )
        
        # Write modified HTML
        with open(output_path, 'w') as f:
            f.write(result.data.html)
        
        print(f"  ✅ Injected {result.data.links_injected} links")
        print(f"  Output saved to {output_path}")
        
        # Show processed assets
        if result.data.assets_processed:
            print("  Processed assets:")
            for asset in result.data.assets_processed:
                print(f"    - {asset}")
                
    except Exception as e:
        print(f"  ❌ Error: {e}")
        sys.exit(1)


async def inject_links_in_directory(
    input_dir: str,
    output_dir: str,
    manifest_url: str,
    strategy: str = 'sha256_path',
    selector: str = 'img[src], video[src], audio[src]',
    pattern: str = '*.html',
    backup: bool = True
) -> None:
    """Inject manifest links into all HTML files in a directory"""
    input_path = Path(input_dir)
    output_path = Path(output_dir)
    
    # Create output directory
    output_path.mkdir(parents=True, exist_ok=True)
    
    # Find HTML files
    html_files = list(input_path.glob(pattern))
    
    if not html_files:
        print(f"No HTML files found in {input_dir}")
        return
    
    print(f"Found {len(html_files)} HTML files")
    
    # Process each file
    for html_file in html_files:
        # Calculate relative path and output location
        relative_path = html_file.relative_to(input_path)
        output_file = output_path / relative_path
        
        # Create subdirectories if needed
        output_file.parent.mkdir(parents=True, exist_ok=True)
        
        # Backup original file if requested
        if backup and output_file == html_file:
            backup_path = html_file.with_suffix(html_file.suffix + '.backup')
            if not backup_path.exists():
                html_file.rename(backup_path)
                print(f"  Created backup: {backup_path}")
        
        # Inject links
        await inject_links_in_file(
            str(html_file),
            str(output_file),
            manifest_url,
            strategy,
            selector
        )


async def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(description='Inject C2PA manifest links into HTML')
    parser.add_argument('input', help='Input file or directory path')
    parser.add_argument('output', help='Output file or directory path')
    parser.add_argument('manifest_url', help='Manifest URL template (e.g., https://manifests.example.com/{sha256}.c2pa)')
    parser.add_argument('--strategy', choices=['sha256_path', 'content_hash', 'custom'], default='sha256_path', help='URL generation strategy')
    parser.add_argument('--selector', default='img[src], video[src], audio[src]', help='CSS selector for elements to process')
    parser.add_argument('--pattern', default='*.html', help='File pattern for directory processing')
    parser.add_argument('--no-backup', action='store_true', help='Skip creating backup files')
    
    args = parser.parse_args()
    
    if not os.getenv('C2_API_KEY'):
        print("Error: C2_API_KEY environment variable is required")
        sys.exit(1)
    
    # Check if input is file or directory
    input_path = Path(args.input)
    
    if input_path.is_file():
        # Process single file
        await inject_links_in_file(
            args.input,
            args.output,
            args.manifest_url,
            args.strategy,
            args.selector
        )
    elif input_path.is_dir():
        # Process directory
        await inject_links_in_directory(
            args.input,
            args.output,
            args.manifest_url,
            args.strategy,
            args.selector,
            args.pattern,
            not args.no_backup
        )
    else:
        print(f"Error: Input path {args.input} does not exist")
        sys.exit(1)


if __name__ == '__main__':
    asyncio.run(main())
