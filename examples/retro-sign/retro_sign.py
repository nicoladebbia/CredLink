#!/usr/bin/env python3
"""
Example: Retro-sign a folder with RFC-3161 timestamps
"""

import argparse
import asyncio
import os
import sys
from typing import Dict, Optional

from credlink import Client


async def sign_folder(
    folder_path: str,
    profile_id: str,
    tsa: bool = False,
    recursive: bool = True,
    file_patterns: Optional[list] = None,
    idempotency_key: Optional[str] = None
) -> str:
    """Sign a folder and return the job ID"""
    client = Client(api_key=os.getenv('C2_API_KEY'))
    
    print(f"Signing folder: {folder_path}")
    print(f"Profile: {profile_id}")
    print(f"TSA: {tsa}")
    print(f"Recursive: {recursive}")
    
    if file_patterns:
        print(f"File patterns: {', '.join(file_patterns)}")
    
    try:
        result = await client.sign_folder(
            folder_path,
            {
                'profile_id': profile_id,
                'tsa': tsa,
                'recursive': recursive,
                'file_patterns': file_patterns or ['*.jpg', '*.png', '*.mp4', '*.pdf'],
                'idempotency_key': idempotency_key
            }
        )
        
        job_id = result.data['job_id']
        print(f"✅ Signing job started: {job_id}")
        print(f"📊 Estimated duration: {result.data.get('estimated_duration', 'unknown')} seconds")
        print(f"📁 Files found: {result.data.get('files_found', 'unknown')}")
        print(f"🔗 Status URL: {result.data.get('status_url', 'unknown')}")
        
        return job_id
        
    except Exception as e:
        print(f"❌ Error starting signing job: {e}")
        sys.exit(1)


async def monitor_job(job_id: str, poll_interval: int = 10) -> Dict:
    """Monitor signing job progress"""
    client = Client(api_key=os.getenv('C2_API_KEY'))
    
    print(f"\nMonitoring job {job_id}...")
    
    while True:
        try:
            status = await client.get_job_status(job_id)
            
            print(f"Status: {status.status}")
            if status.message:
                print(f"Message: {status.message}")
            
            if status.progress is not None:
                print(f"Progress: {status.progress}%")
            
            if status.status in ['completed', 'failed', 'cancelled']:
                print(f"\nJob {status.status}")
                
                if status.status == 'completed':
                    print("✅ Folder signing completed successfully")
                    if status.result:
                        print(f"Result: {status.result}")
                elif status.status == 'failed':
                    print("❌ Folder signing failed")
                    if status.error:
                        print(f"Error: {status.error}")
                        sys.exit(1)
                elif status.status == 'cancelled':
                    print("⏹️ Folder signing was cancelled")
                
                return status.dict()
            
            await asyncio.sleep(poll_interval)
            
        except Exception as e:
            print(f"❌ Error monitoring job: {e}")
            sys.exit(1)


async def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(description='Retro-sign a folder with C2 Concierge')
    parser.add_argument('folder', help='Path to folder to sign')
    parser.add_argument('profile', help='Signing profile ID')
    parser.add_argument('--tsa', action='store_true', help='Include RFC-3161 timestamps')
    parser.add_argument('--no-recursive', action='store_true', help='Do not process subdirectories')
    parser.add_argument('--patterns', nargs='+', default=['*.jpg', '*.png', '*.mp4', '*.pdf'], help='File patterns to include')
    parser.add_argument('--idempotency-key', help='Idempotency key for request deduplication')
    parser.add_argument('--poll-interval', type=int, default=10, help='Job status poll interval in seconds')
    parser.add_argument('--monitor-only', help='Monitor existing job (provide job ID)')
    
    args = parser.parse_args()
    
    if not os.getenv('C2_API_KEY'):
        print("Error: C2_API_KEY environment variable is required")
        sys.exit(1)
    
    if args.monitor_only:
        # Monitor existing job
        await monitor_job(args.monitor_only, args.poll_interval)
    else:
        # Start new signing job
        if not os.path.isdir(args.folder):
            print(f"Error: Folder {args.folder} does not exist")
            sys.exit(1)
        
        job_id = await sign_folder(
            args.folder,
            args.profile,
            args.tsa,
            not args.no_recursive,
            args.patterns,
            args.idempotency_key
        )
        
        # Monitor the job
        await monitor_job(job_id, args.poll_interval)


if __name__ == '__main__':
    asyncio.run(main())
