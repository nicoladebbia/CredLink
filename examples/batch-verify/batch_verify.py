#!/usr/bin/env python3
"""
Example: Batch verify assets from RSS feeds or JSONL files
"""

import argparse
import asyncio
import json
import os
import sys
from typing import Dict, List, Optional

import feedparser
import httpx

from c2concierge import Client, BatchVerifyRequest, BatchVerifyResponse


async def extract_urls_from_rss(feed_url: str) -> List[str]:
    """Extract asset URLs from RSS feed"""
    print(f"Fetching RSS feed: {feed_url}")
    
    async with httpx.AsyncClient() as client:
        response = await client.get(feed_url)
        response.raise_for_status()
        
    feed = feedparser.parse(response.content)
    urls = []
    
    for entry in feed.entries:
        if hasattr(entry, 'enclosures'):
            for enclosure in entry.enclosures:
                if enclosure.get('type', '').startswith(('image/', 'video/', 'audio/')):
                    urls.append(enclosure.href)
        elif hasattr(entry, 'media_content'):
            for media in entry.media_content:
                if media.get('type', '').startswith(('image/', 'video/', 'audio/')):
                    urls.append(media.get('url', ''))
        elif hasattr(entry, 'links'):
            for link in entry.links:
                if link.get('type', '').startswith(('image/', 'video/', 'audio/')):
                    urls.append(link.get('href', ''))
    
    return [url for url in urls if url]


async def extract_urls_from_jsonl(file_path: str) -> List[str]:
    """Extract asset URLs from JSONL file"""
    print(f"Reading JSONL file: {file_path}")
    
    urls = []
    with open(file_path, 'r') as f:
        for line in f:
            if line.strip():
                data = json.loads(line)
                if 'url' in data:
                    urls.append(data['url'])
                elif 'asset_url' in data:
                    urls.append(data['asset_url'])
    
    return urls


async def batch_verify_assets(
    urls: List[str],
    policy_id: str = 'default',
    parallel: bool = True
) -> Dict:
    """Batch verify multiple assets"""
    client = Client(api_key=os.getenv('C2_API_KEY'))
    
    print(f"Batch verifying {len(urls)} assets...")
    
    results = {
        'total': len(urls),
        'verified': 0,
        'failed': 0,
        'errors': []
    }
    
    async for result in client.batch_verify(
        urls,
        {
            'policy_id': policy_id,
            'parallel': parallel,
            'timeout_per_asset': 5000
        }
    ):
        if result.result and result.result.verified:
            results['verified'] += 1
            print(f"  ✅ {result.asset.url}")
        else:
            results['failed'] += 1
            error_msg = result.error.get('message', 'Unknown error') if result.error else 'Unknown error'
            print(f"  ❌ {result.asset.url}: {error_msg}")
            results['errors'].append({
                'url': result.asset.url,
                'error': error_msg
            })
    
    return results


async def generate_report(results: Dict, output_format: str = 'json') -> str:
    """Generate verification report"""
    if output_format == 'json':
        return json.dumps(results, indent=2)
    elif output_format == 'csv':
        lines = ['url,status,error']
        for error in results['errors']:
            lines.append(f"{error['url']},failed,{error['error']}")
        return '\n'.join(lines)
    elif output_format == 'html':
        html = f"""
        <html>
        <head><title>Verification Report</title></head>
        <body>
            <h1>Verification Report</h1>
            <p>Total: {results['total']}</p>
            <p>Verified: {results['verified']}</p>
            <p>Failed: {results['failed']}</p>
            <h2>Failed Assets</h2>
            <table>
                <tr><th>URL</th><th>Error</th></tr>
        """
        for error in results['errors']:
            html += f"<tr><td>{error['url']}</td><td>{error['error']}</td></tr>"
        html += """
            </table>
        </body>
        </html>
        """
        return html
    else:
        return str(results)


async def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(description='Batch verify assets')
    parser.add_argument('source', help='RSS feed URL or JSONL file path')
    parser.add_argument('--type', choices=['rss', 'jsonl'], required=True, help='Source type')
    parser.add_argument('--policy-id', default='default', help='Verification policy ID')
    parser.add_argument('--output', choices=['json', 'csv', 'html'], default='json', help='Output format')
    parser.add_argument('--output-file', help='Output file path')
    
    args = parser.parse_args()
    
    if not os.getenv('C2_API_KEY'):
        print("Error: C2_API_KEY environment variable is required")
        sys.exit(1)
    
    # Extract URLs based on source type
    if args.type == 'rss':
        urls = await extract_urls_from_rss(args.source)
    else:
        urls = await extract_urls_from_jsonl(args.source)
    
    if not urls:
        print("No URLs found in source")
        sys.exit(1)
    
    # Batch verify assets
    results = await batch_verify_assets(urls, args.policy_id)
    
    # Generate and output report
    report = await generate_report(results, args.output)
    
    if args.output_file:
        with open(args.output_file, 'w') as f:
            f.write(report)
        print(f"Report saved to {args.output_file}")
    else:
        print(report)
    
    # Exit with error code if any assets failed
    if results['failed'] > 0:
        sys.exit(1)


if __name__ == '__main__':
    asyncio.run(main())
