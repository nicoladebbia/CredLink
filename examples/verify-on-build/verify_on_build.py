#!/usr/bin/env python3
"""
Example: Verify page assets on build
"""

import asyncio
import os
import sys
from typing import Dict, List, Optional

from c2concierge import Client, ValidationError


async def verify_page_assets(
    page_url: str,
    options: Optional[Dict] = None
) -> None:
    """
    Verify all assets on a page and fail build if any are invalid
    
    Args:
        page_url: URL of the page to verify
        options: Optional verification options
    """
    options = options or {}
    policy_id = options.get('policy_id', 'default')
    follow_links = options.get('follow_links', True)
    max_depth = options.get('max_depth', 2)
    fail_on_invalid = options.get('fail_on_invalid', True)
    
    # Initialize client
    client = Client(api_key=os.getenv('C2_API_KEY'))
    
    print(f"Verifying assets on {page_url}...")
    
    verified_count = 0
    total_count = 0
    failed_assets: List[str] = []
    
    try:
        async for asset in client.verify_page(
            page_url,
            {
                'policy_id': policy_id,
                'follow_links': follow_links,
                'max_depth': max_depth
            }
        ):
            total_count += 1
            if asset.verified:
                verified_count += 1
                print(f"  ✅ {asset.url}")
            else:
                print(f"  ❌ {asset.url}: {asset.error}")
                failed_assets.append(asset.url)
                
        print(f"\nVerification complete: {verified_count}/{total_count} assets verified")
        
        if failed_assets and fail_on_invalid:
            print("\nFailed assets:")
            for asset in failed_assets:
                print(f"  - {asset}")
            sys.exit(1)
            
    except ValidationError as e:
        print(f"Validation error: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"Unexpected error: {e}")
        sys.exit(1)


async def main():
    """Main entry point"""
    if len(sys.argv) < 2:
        print("Usage: python verify_on_build.py <page_url> [policy_id]")
        sys.exit(1)
    
    page_url = sys.argv[1]
    policy_id = sys.argv[2] if len(sys.argv) > 2 else 'default'
    
    if not os.getenv('C2_API_KEY'):
        print("Error: C2_API_KEY environment variable is required")
        sys.exit(1)
    
    await verify_page_assets(page_url, {'policy_id': policy_id})


if __name__ == '__main__':
    asyncio.run(main())
