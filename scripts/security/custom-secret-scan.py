#==================================================
# Custom Secret Pattern Detection Script - Step 18
#==================================================
#!/usr/bin/env python3
"""
Custom Secret Pattern Detection Script for CredLink
Detects application-specific secrets and sensitive patterns
"""

import json
import re
import argparse
import os
import sys
from pathlib import Path
from typing import List, Dict, Any, Tuple
import hashlib

class CustomSecretScanner:
    def __init__(self, patterns_file: str = None):
        """Initialize the custom secret scanner with patterns."""
        self.patterns = self.load_patterns(patterns_file)
        self.results = []
        
    def load_patterns(self, patterns_file: str) -> List[Dict[str, Any]]:
        """Load custom secret patterns from JSON file."""
        default_patterns = [
            {
                "name": "CredLink Internal API Key",
                "pattern": r"CREDLINK_API_KEY[_\d]*['\"]?\s*[:=]\s*['\"]?[a-zA-Z0-9_-]{32,}['\"]?",
                "severity": "CRITICAL",
                "description": "CredLink internal API key detected"
            },
            {
                "name": "CredLink Database URL",
                "pattern": r"CREDLINK_DB_URL['\"]?\s*[:=]\s*['\"]?(postgresql|mysql)://[^\s'\"]+['\"]?",
                "severity": "CRITICAL", 
                "description": "CredLink database connection string detected"
            },
            {
                "name": "CredLink JWT Secret",
                "pattern": r"CREDLINK_JWT_SECRET['\"]?\s*[:=]\s*['\"]?[a-zA-Z0-9_-]{32,}['\"]?",
                "severity": "CRITICAL",
                "description": "CredLink JWT secret key detected"
            },
            {
                "name": "CredLink Encryption Key",
                "pattern": r"CREDLINK_ENCRYPTION_KEY['\"]?\s*[:=]\s*['\"]?[a-zA-Z0-9/+=]{32,}['\"]?",
                "severity": "CRITICAL",
                "description": "CredLink encryption key detected"
            },
            {
                "name": "CredLink Redis URL",
                "pattern": r"CREDLINK_REDIS_URL['\"]?\s*[:=]\s*['\"]?redis://[^\s'\"]+['\"]?",
                "severity": "HIGH",
                "description": "CredLink Redis connection string detected"
            },
            {
                "name": "CredLink S3 Bucket Key",
                "pattern": r"CREDLINK_S3_(ACCESS_KEY|SECRET)['\"]?\s*[:=]\s*['\"]?[a-zA-Z0-9/+=]{16,}['\"]?",
                "severity": "CRITICAL",
                "description": "CredLink S3 credentials detected"
            },
            {
                "name": "KMS Master Key ARN",
                "pattern": r"arn:aws:kms:[a-z0-9-]+:[0-9]{12}:key/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}",
                "severity": "MEDIUM",
                "description": "AWS KMS key ARN detected"
            },
            {
                "name": "CredLink Webhook Secret",
                "pattern": r"CREDLINK_WEBHOOK_SECRET['\"]?\s*[:=]\s*['\"]?[a-zA-Z0-9_-]{32,}['\"]?",
                "severity": "HIGH",
                "description": "CredLink webhook secret detected"
            },
            {
                "name": "CredLink Certificate Private Key",
                "pattern": r"CREDLINK_CERT_PRIVATE[_\d]*['\"]?\s*[:=]\s*['\"]?-----BEGIN[\\s\\S]*?-----END[\\s\\S]*?-----['\"]?",
                "severity": "CRITICAL",
                "description": "CredLink certificate private key detected"
            },
            {
                "name": "CredLink Admin Token",
                "pattern": r"CREDLINK_ADMIN_TOKEN['\"]?\s*[:=]\s*['\"]?[a-zA-Z0-9._-]{32,}['\"]?",
                "severity": "CRITICAL",
                "description": "CredLink admin token detected"
            },
            {
                "name": "Hardcoded Test Credentials",
                "pattern": r"(test|mock|demo)_?(user|admin|api)_?(token|key|secret|password)['\"]?\s*[:=]\s*['\"]?[a-zA-Z0-9_-]{8,}['\"]?",
                "severity": "HIGH",
                "description": "Hardcoded test credentials detected"
            },
            {
                "name": "Local Development Secrets",
                "pattern": r"(localhost|127\.0\.0\.1|0\.0\.0\.0).*?(password|secret|token|key)['\"]?\s*[:=]\s*['\"]?[a-zA-Z0-9_-]{8,}['\"]?",
                "severity": "MEDIUM",
                "description": "Local development secret detected"
            },
            {
                "name": "Base64 Encoded Secret",
                "pattern": r"['\"]?[A-Za-z0-9+/]{40,}={0,2}['\"]?(?=\s*(?:#.*|\*.*|//.*|$))",
                "severity": "LOW",
                "description": "Potential base64 encoded secret"
            },
            {
                "name": "Hex Encoded Secret",
                "pattern": r"['\"]?[0-9a-fA-F]{32,}['\"]?(?=\s*(?:#.*|\*.*|//.*|$))",
                "severity": "LOW",
                "description": "Potential hex encoded secret"
            },
            {
                "name": "Environment Variable Assignment",
                "pattern": r"export\s+[A-Z_][A-Z0-9_]*_(SECRET|KEY|TOKEN|PASSWORD|PASSWD|PWD)\s*=\s*['\"]?[^\s'"]{8,}['\"]?",
                "severity": "MEDIUM",
                "description": "Environment variable with secret detected"
            },
            {
                "name": "Docker Environment Secret",
                "pattern": r"ENV\s+[A-Z_][A-Z0-9_]*_(SECRET|KEY|TOKEN|PASSWORD|PASSWD|PWD)\s+['\"]?[^\s'"]{8,}['\"]?",
                "severity": "MEDIUM",
                "description": "Docker environment secret detected"
            },
            {
                "name": "Kubernetes Secret Data",
                "pattern": r"data:\s*\n\s+[a-zA-Z0-9_-]+:\s*[A-Za-z0-9+/=]+",
                "severity": "HIGH",
                "description": "Kubernetes secret data detected"
            },
            {
                "name": "Terraform Variable Secret",
                "pattern": r"variable\s+['\"]?[a-zA-Z0-9_-]*_(secret|key|token|password)['\"]?\s*{[^}]*default\s*=\s*['\"]?[^\s'"]{8,}['\"]?",
                "severity": "MEDIUM",
                "description": "Terraform variable with secret default detected"
            },
            {
                "name": "AWS Credentials Profile",
                "pattern": r"\[default\]\s*\naws_access_key_id\s*=\s*[A-Z0-9]{20}\s*\naws_secret_access_key\s*=\s*[a-zA-Z0-9/+=]{40}",
                "severity": "CRITICAL",
                "description": "AWS credentials profile detected"
            },
            {
                "name": "Database Connection String",
                "pattern": r"(mysql|postgresql|mongodb|redis)://[a-zA-Z0-9_\-:.@/]+",
                "severity": "HIGH",
                "description": "Database connection string detected"
            }
        ]
        
        if patterns_file and os.path.exists(patterns_file):
            try:
                with open(patterns_file, 'r') as f:
                    custom_patterns = json.load(f)
                return default_patterns + custom_patterns
            except Exception as e:
                print(f"Warning: Could not load custom patterns from {patterns_file}: {e}")
                return default_patterns
        
        return default_patterns

    def scan_file(self, file_path: Path) -> List[Dict[str, Any]]:
        """Scan a single file for secrets."""
        if not file_path.exists() or file_path.is_dir():
            return []
        
        try:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
        except Exception as e:
            print(f"Warning: Could not read file {file_path}: {e}")
            return []
        
        file_results = []
        lines = content.split('\n')
        
        for pattern_info in self.patterns:
            pattern = re.compile(pattern_info['pattern'], re.IGNORECASE | re.MULTILINE | re.DOTALL)
            
            for match in pattern.finditer(content):
                line_num = content[:match.start()].count('\n') + 1
                line_content = lines[line_num - 1] if line_num <= len(lines) else ""
                
                # Calculate context
                start_line = max(0, line_num - 2)
                end_line = min(len(lines), line_num + 2)
                context = lines[start_line:end_line]
                
                # Create hash of the secret for deduplication
                secret_hash = hashlib.sha256(match.group().encode()).hexdigest()[:16]
                
                result = {
                    'file': str(file_path),
                    'line': line_num,
                    'secret_type': pattern_info['name'],
                    'severity': pattern_info['severity'],
                    'description': pattern_info['description'],
                    'matched_text': match.group()[:100] + "..." if len(match.group()) > 100 else match.group(),
                    'context': context,
                    'secret_hash': secret_hash,
                    'pattern': pattern_info['pattern']
                }
                
                file_results.append(result)
        
        return file_results

    def scan_directory(self, directory: Path, exclude_dirs: List[str] = None, exclude_files: List[str] = None) -> List[Dict[str, Any]]:
        """Scan directory recursively for secrets."""
        if exclude_dirs is None:
            exclude_dirs = [
                '.git', '.svn', '.hg', '.bzr',
                'node_modules', '.npm', '.cache',
                '.terraform', '.tox', '__pycache__',
                '.venv', 'venv', 'env', 'dist', 'build',
                'coverage', '.nyc_output', '.artifacts',
                '.DS_Store', 'Thumbs.db'
            ]
        
        if exclude_files is None:
            exclude_files = [
                'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock',
                'go.mod', 'go.sum', 'Cargo.lock', 'Pipfile.lock',
                '.log', '.tmp', '.cache', '.bak', '.swp'
            ]
        
        all_results = []
        
        for root, dirs, files in os.walk(directory):
            # Remove excluded directories
            dirs[:] = [d for d in dirs if d not in exclude_dirs]
            
            for file in files:
                if any(file.endswith(ext) for ext in exclude_files):
                    continue
                
                file_path = Path(root) / file
                results = self.scan_file(file_path)
                all_results.extend(results)
        
        return all_results

    def generate_report(self, results: List[Dict[str, Any]], output_file: str):
        """Generate comprehensive security report."""
        # Deduplicate results by secret hash
        unique_results = {}
        for result in results:
            key = f"{result['file']}:{result['line']}:{result['secret_hash']}"
            unique_results[key] = result
        
        unique_results = list(unique_results.values())
        
        # Sort by severity
        severity_order = {'CRITICAL': 0, 'HIGH': 1, 'MEDIUM': 2, 'LOW': 3}
        unique_results.sort(key=lambda x: severity_order.get(x['severity'], 4))
        
        # Generate statistics
        stats = {
            'total_secrets': len(unique_results),
            'by_severity': {},
            'by_type': {},
            'by_file': {}
        }
        
        for result in unique_results:
            # Count by severity
            severity = result['severity']
            stats['by_severity'][severity] = stats['by_severity'].get(severity, 0) + 1
            
            # Count by type
            secret_type = result['secret_type']
            stats['by_type'][secret_type] = stats['by_type'].get(secret_type, 0) + 1
            
            # Count by file
            file_path = result['file']
            stats['by_file'][file_path] = stats['by_file'].get(file_path, 0) + 1
        
        # Create final report
        report = {
            'scan_metadata': {
                'scanner': 'CredLink Custom Secret Scanner',
                'version': '1.0.0',
                'timestamp': '2025-01-19T00:00:00Z',
                'total_patterns': len(self.patterns)
            },
            'statistics': stats,
            'secrets': unique_results,
            'recommendations': self.generate_recommendations(unique_results)
        }
        
        # Write report
        with open(output_file, 'w') as f:
            json.dump(report, f, indent=2, default=str)
        
        return report

    def generate_recommendations(self, results: List[Dict[str, Any]]) -> List[str]:
        """Generate security recommendations based on findings."""
        recommendations = []
        
        critical_count = sum(1 for r in results if r['severity'] == 'CRITICAL')
        high_count = sum(1 for r in results if r['severity'] == 'HIGH')
        
        if critical_count > 0:
            recommendations.append(f"🚨 CRITICAL: {critical_count} critical secrets detected - immediate remediation required")
        
        if high_count > 0:
            recommendations.append(f"⚠️ HIGH: {high_count} high-severity secrets detected - prioritize remediation")
        
        # Check for specific patterns
        secret_types = [r['secret_type'] for r in results]
        
        if 'CredLink Internal API Key' in secret_types:
            recommendations.append("🔑 Rotate all CredLink internal API keys immediately")
        
        if 'CredLink Database URL' in secret_types:
            recommendations.append("🗄️ Move database credentials to AWS Secrets Manager")
        
        if 'CredLink JWT Secret' in secret_types:
            recommendations.append("🎫 Rotate JWT secrets and implement proper key rotation")
        
        if 'Hardcoded Test Credentials' in secret_types:
            recommendations.append("🧪 Remove all hardcoded test credentials, use environment variables")
        
        if critical_count == 0 and high_count == 0:
            recommendations.append("✅ No critical or high-severity secrets detected")
            recommendations.append("🔍 Continue monitoring for new secrets in future commits")
        
        return recommendations

def main():
    parser = argparse.ArgumentParser(description='CredLink Custom Secret Scanner')
    parser.add_argument('--directory', '-d', default='.', help='Directory to scan')
    parser.add_argument('--output', '-o', default='custom-secrets.json', help='Output file')
    parser.add_argument('--patterns-file', '-p', help='Custom patterns JSON file')
    parser.add_argument('--exclude-dirs', nargs='*', help='Directories to exclude')
    parser.add_argument('--exclude-files', nargs='*', help='Files to exclude')
    
    args = parser.parse_args()
    
    scanner = CustomSecretScanner(args.patterns_file)
    
    print("🔍 Starting CredLink custom secret scanning...")
    print(f"📁 Scanning directory: {args.directory}")
    print(f"📋 Using {len(scanner.patterns)} custom patterns")
    
    results = scanner.scan_directory(
        Path(args.directory),
        args.exclude_dirs,
        args.exclude_files
    )
    
    print(f"🔍 Found {len(results)} potential secrets")
    
    report = scanner.generate_report(results, args.output)
    
    stats = report['statistics']
    print(f"\n📊 Scan Results:")
    print(f"   Total secrets: {stats['total_secrets']}")
    print(f"   Critical: {stats['by_severity'].get('CRITICAL', 0)}")
    print(f"   High: {stats['by_severity'].get('HIGH', 0)}")
    print(f"   Medium: {stats['by_severity'].get('MEDIUM', 0)}")
    print(f"   Low: {stats['by_severity'].get('LOW', 0)}")
    
    print(f"\n💾 Report saved to: {args.output}")
    
    # Return exit code based on critical findings
    if stats['by_severity'].get('CRITICAL', 0) > 0:
        print("❌ CRITICAL secrets detected - failing scan")
        sys.exit(1)
    elif stats['by_severity'].get('HIGH', 0) > 0:
        print("⚠️ HIGH severity secrets detected")
        sys.exit(1)
    else:
        print("✅ No critical or high-severity secrets detected")
        sys.exit(0)

if __name__ == '__main__':
    main()
