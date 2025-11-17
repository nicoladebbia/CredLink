#==================================================
# Security Results Aggregation Script - Step 18
#==================================================
#!/usr/bin/env python3
"""
Aggregates results from multiple secret scanning tools
Combines TruffleHog, Gitleaks, detect-secrets, and custom scan results
"""

import json
import argparse
import sys
from pathlib import Path
from typing import Dict, List, Any, Optional
from datetime import datetime
import hashlib

class SecurityResultsAggregator:
    def __init__(self):
        self.aggregated_results = {
            'metadata': {
                'aggregation_timestamp': datetime.now().isoformat(),
                'scanner': 'CredLink Security Results Aggregator',
                'version': '1.0.0'
            },
            'secrets': [],
            'statistics': {
                'total_secrets': 0,
                'by_severity': {'CRITICAL': 0, 'HIGH': 0, 'MEDIUM': 0, 'LOW': 0},
                'by_tool': {},
                'by_file': {}
            }
        }
    
    def load_trufflehog_results(self, file_path: str) -> List[Dict[str, Any]]:
        """Load and normalize TruffleHog results."""
        secrets = []
        
        try:
            with open(file_path, 'r') as f:
                data = json.load(f)
            
            if isinstance(data, dict) and 'Results' in data:
                for result in data['Results']:
                    secret = {
                        'tool': 'trufflehog',
                        'file': result.get('SourceMetadata', {}).get('Data', {}).get('Filesystem', {}).get('File', 'unknown'),
                        'line': result.get('SourceMetadata', {}).get('Data', {}).get('Filesystem', {}).get('Line', 0),
                        'secret_type': 'Generic Secret',
                        'severity': 'HIGH',
                        'description': 'Secret detected by TruffleHog',
                        'matched_text': result.get('Raw', '')[:100],
                        'context': [result.get('Raw', '')],
                        'secret_hash': hashlib.sha256(result.get('Raw', '').encode()).hexdigest()[:16],
                        'pattern': 'trufflehog-pattern'
                    }
                    secrets.append(secret)
            elif isinstance(data, list):
                for result in data:
                    secret = {
                        'tool': 'trufflehog',
                        'file': result.get('file', 'unknown'),
                        'line': result.get('line', 0),
                        'secret_type': 'Generic Secret',
                        'severity': 'HIGH',
                        'description': 'Secret detected by TruffleHog',
                        'matched_text': str(result.get('matched_text', ''))[:100],
                        'context': [str(result.get('matched_text', ''))],
                        'secret_hash': hashlib.sha256(str(result.get('matched_text', '')).encode()).hexdigest()[:16],
                        'pattern': 'trufflehog-pattern'
                    }
                    secrets.append(secret)
                    
        except Exception as e:
            print(f"Warning: Could not load TruffleHog results from {file_path}: {e}")
        
        return secrets
    
    def load_gitleaks_results(self, file_path: str) -> List[Dict[str, Any]]:
        """Load and normalize Gitleaks results."""
        secrets = []
        
        try:
            with open(file_path, 'r') as f:
                data = json.load(f)
            
            if isinstance(data, list):
                for result in data:
                    secret = {
                        'tool': 'gitleaks',
                        'file': result.get('File', 'unknown'),
                        'line': result.get('StartLine', 0),
                        'secret_type': result.get('RuleID', 'Unknown'),
                        'severity': result.get('Severity', 'MEDIUM').upper(),
                        'description': result.get('Description', 'Secret detected by Gitleaks'),
                        'matched_text': result.get('Match', '')[:100],
                        'context': result.get('Lines', []),
                        'secret_hash': hashlib.sha256(result.get('Match', '').encode()).hexdigest()[:16],
                        'pattern': result.get('RuleID', 'gitleaks-pattern')
                    }
                    secrets.append(secret)
                    
        except Exception as e:
            print(f"Warning: Could not load Gitleaks results from {file_path}: {e}")
        
        return secrets
    
    def load_detect_secrets_results(self, file_path: str) -> List[Dict[str, Any]]:
        """Load and normalize detect-secrets results."""
        secrets = []
        
        try:
            with open(file_path, 'r') as f:
                data = json.load(f)
            
            if isinstance(data, dict) and 'results' in data:
                for file_path_key, file_results in data['results'].items():
                    for result in file_results:
                        secret = {
                            'tool': 'detect-secrets',
                            'file': file_path_key,
                            'line': result.get('line_number', 0),
                            'secret_type': result.get('type', 'Unknown'),
                            'severity': 'MEDIUM',
                            'description': f'Secret of type {result.get("type", "Unknown")} detected',
                            'matched_text': result.get('hashed_secret', '')[:100],
                            'context': [f'Line {result.get("line_number", 0)}: {result.get("type", "Unknown")}'],
                            'secret_hash': hashlib.sha256(result.get('hashed_secret', '').encode()).hexdigest()[:16],
                            'pattern': result.get('type', 'detect-secrets-pattern')
                        }
                        secrets.append(secret)
            elif isinstance(data, list):
                for result in data:
                    secret = {
                        'tool': 'detect-secrets',
                        'file': result.get('file', 'unknown'),
                        'line': result.get('line', 0),
                        'secret_type': result.get('secret_type', 'Unknown'),
                        'severity': 'MEDIUM',
                        'description': 'Secret detected by detect-secrets',
                        'matched_text': str(result.get('matched_text', ''))[:100],
                        'context': [str(result.get('matched_text', ''))],
                        'secret_hash': hashlib.sha256(str(result.get('matched_text', '')).encode()).hexdigest()[:16],
                        'pattern': result.get('secret_type', 'detect-secrets-pattern')
                    }
                    secrets.append(secret)
                    
        except Exception as e:
            print(f"Warning: Could not load detect-secrets results from {file_path}: {e}")
        
        return secrets
    
    def load_custom_secrets_results(self, file_path: str) -> List[Dict[str, Any]]:
        """Load and normalize custom secret scan results."""
        secrets = []
        
        try:
            with open(file_path, 'r') as f:
                data = json.load(f)
            
            if isinstance(data, dict) and 'secrets' in data:
                for result in data['secrets']:
                    secret = {
                        'tool': 'custom-scanner',
                        'file': result.get('file', 'unknown'),
                        'line': result.get('line', 0),
                        'secret_type': result.get('secret_type', 'Unknown'),
                        'severity': result.get('severity', 'MEDIUM').upper(),
                        'description': result.get('description', 'Custom secret detected'),
                        'matched_text': result.get('matched_text', '')[:100],
                        'context': result.get('context', []),
                        'secret_hash': result.get('secret_hash', hashlib.sha256(result.get('matched_text', '').encode()).hexdigest()[:16]),
                        'pattern': result.get('pattern', 'custom-pattern')
                    }
                    secrets.append(secret)
            elif isinstance(data, list):
                for result in data:
                    secret = {
                        'tool': 'custom-scanner',
                        'file': result.get('file', 'unknown'),
                        'line': result.get('line', 0),
                        'secret_type': result.get('secret_type', 'Unknown'),
                        'severity': result.get('severity', 'MEDIUM').upper(),
                        'description': result.get('description', 'Custom secret detected'),
                        'matched_text': result.get('matched_text', '')[:100],
                        'context': result.get('context', []),
                        'secret_hash': result.get('secret_hash', hashlib.sha256(result.get('matched_text', '').encode()).hexdigest()[:16]),
                        'pattern': result.get('pattern', 'custom-pattern')
                    }
                    secrets.append(secret)
                    
        except Exception as e:
            print(f"Warning: Could not load custom secrets results from {file_path}: {e}")
        
        return secrets
    
    def aggregate_results(self, trufflehog_file: str, gitleaks_file: str, 
                         detect_secrets_file: str, custom_file: str, output_file: str):
        """Aggregate results from all secret scanning tools."""
        
        # Load results from all tools
        all_secrets = []
        
        if trufflehog_file and Path(trufflehog_file).exists():
            trufflehog_secrets = self.load_trufflehog_results(trufflehog_file)
            all_secrets.extend(trufflehog_secrets)
            print(f"🔍 Loaded {len(trufflehog_secrets)} secrets from TruffleHog")
        
        if gitleaks_file and Path(gitleaks_file).exists():
            gitleaks_secrets = self.load_gitleaks_results(gitleaks_file)
            all_secrets.extend(gitleaks_secrets)
            print(f"🕵️ Loaded {len(gitleaks_secrets)} secrets from Gitleaks")
        
        if detect_secrets_file and Path(detect_secrets_file).exists():
            detect_secrets_secrets = self.load_detect_secrets_results(detect_secrets_file)
            all_secrets.extend(detect_secrets_secrets)
            print(f"🔎 Loaded {len(detect_secrets_secrets)} secrets from detect-secrets")
        
        if custom_file and Path(custom_file).exists():
            custom_secrets = self.load_custom_secrets_results(custom_file)
            all_secrets.extend(custom_secrets)
            print(f"🚨 Loaded {len(custom_secrets)} secrets from custom scanner")
        
        # Deduplicate secrets
        unique_secrets = {}
        for secret in all_secrets:
            key = f"{secret['file']}:{secret['line']}:{secret['secret_hash']}"
            if key not in unique_secrets:
                unique_secrets[key] = secret
        
        unique_secrets_list = list(unique_secrets.values())
        
        # Calculate statistics
        stats = self.calculate_statistics(unique_secrets_list)
        
        # Update aggregated results
        self.aggregated_results['secrets'] = unique_secrets_list
        self.aggregated_results['statistics'] = stats
        
        # Write aggregated results
        with open(output_file, 'w') as f:
            json.dump(self.aggregated_results, f, indent=2, default=str)
        
        print(f"📊 Aggregated {len(unique_secrets_list)} unique secrets")
        print(f"📈 Statistics: Critical={stats['by_severity']['CRITICAL']}, High={stats['by_severity']['HIGH']}, Medium={stats['by_severity']['MEDIUM']}, Low={stats['by_severity']['LOW']}")
        
        return self.aggregated_results
    
    def calculate_statistics(self, secrets: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Calculate comprehensive statistics for the aggregated results."""
        stats = {
            'total_secrets': len(secrets),
            'by_severity': {'CRITICAL': 0, 'HIGH': 0, 'MEDIUM': 0, 'LOW': 0},
            'by_tool': {},
            'by_file': {}
        }
        
        for secret in secrets:
            # Count by severity
            severity = secret.get('severity', 'MEDIUM')
            if severity in stats['by_severity']:
                stats['by_severity'][severity] += 1
            
            # Count by tool
            tool = secret.get('tool', 'unknown')
            stats['by_tool'][tool] = stats['by_tool'].get(tool, 0) + 1
            
            # Count by file
            file_path = secret.get('file', 'unknown')
            stats['by_file'][file_path] = stats['by_file'].get(file_path, 0) + 1
        
        return stats

def main():
    parser = argparse.ArgumentParser(description='CredLink Security Results Aggregator')
    parser.add_argument('--trufflehog', help='TruffleHog results JSON file')
    parser.add_argument('--gitleaks', help='Gitleaks results JSON file')
    parser.add_argument('--detect-secrets', help='detect-secrets results JSON file')
    parser.add_argument('--custom', help='Custom secrets results JSON file')
    parser.add_argument('--output', '-o', default='aggregated-secrets.json', help='Output aggregated results file')
    
    args = parser.parse_args()
    
    aggregator = SecurityResultsAggregator()
    
    print("🔗 Aggregating security scan results...")
    
    results = aggregator.aggregate_results(
        args.trufflehog,
        args.gitleaks,
        getattr(args, 'detect_secrets'),
        args.custom,
        args.output
    )
    
    stats = results['statistics']
    
    if stats['by_severity']['CRITICAL'] > 0 or stats['by_severity']['HIGH'] > 0:
        print("❌ Critical or high-severity secrets detected")
        sys.exit(1)
    else:
        print("✅ No critical or high-severity secrets detected")
        sys.exit(0)

if __name__ == '__main__':
    main()
