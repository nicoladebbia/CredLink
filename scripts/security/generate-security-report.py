#==================================================
# Security Report Generation Script - Step 18
#==================================================
#!/usr/bin/env python3
"""
Comprehensive Security Report Generator for CredLink
Aggregates results from multiple security scanning tools
"""

import json
import os
import sys
import argparse
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Any, Optional
import jinja2
import markdown

class SecurityReportGenerator:
    def __init__(self, input_dir: str):
        """Initialize the security report generator."""
        self.input_dir = Path(input_dir)
        self.results = {}
        self.load_all_results()
    
    def load_all_results(self):
        """Load all security scan results from the input directory."""
        # Load secret scanning results
        self.load_secret_results()
        
        # Load dependency security results
        self.load_dependency_results()
        
        # Load Terraform security results (if available)
        self.load_terraform_results()
        
        # Load container security results (if available)
        self.load_container_results()
    
    def load_secret_results(self):
        """Load secret scanning results."""
        secret_files = [
            'trufflehog-results.json',
            'gitleaks-results.json', 
            'detect-secrets-report.json',
            'custom-secrets.json',
            'aggregated-secrets.json'
        ]
        
        self.results['secrets'] = {}
        
        for file_name in secret_files:
            file_path = self.input_dir / 'secret-scan-results' / file_name
            if file_path.exists():
                try:
                    with open(file_path, 'r') as f:
                        data = json.load(f)
                    self.results['secrets'][file_name.replace('-results.json', '')] = data
                except Exception as e:
                    print(f"Warning: Could not load {file_name}: {e}")
    
    def load_dependency_results(self):
        """Load dependency security results."""
        self.results['dependencies'] = {}
        
        # Look for dependency results from different package managers
        for item in self.input_dir.glob('dependency-security-*'):
            if item.is_dir():
                package_manager = item.name.replace('dependency-security-', '')
                self.results['dependencies'][package_manager] = {}
                
                for file_path in item.glob('*.json'):
                    try:
                        with open(file_path, 'r') as f:
                            data = json.load(f)
                        self.results['dependencies'][package_manager][file_path.stem] = data
                    except Exception as e:
                        print(f"Warning: Could not load {file_path}: {e}")
    
    def load_terraform_results(self):
        """Load Terraform security results."""
        terraform_dir = self.input_dir / 'terraform-security-results'
        if terraform_dir.exists():
            self.results['terraform'] = {}
            
            for file_path in terraform_dir.glob('*.json'):
                try:
                    with open(file_path, 'r') as f:
                        data = json.load(f)
                    self.results['terraform'][file_path.stem] = data
                except Exception as e:
                    print(f"Warning: Could not load {file_path}: {e}")
    
    def load_container_results(self):
        """Load container security results."""
        container_dir = self.input_dir / 'container-security-results'
        if container_dir.exists():
            self.results['containers'] = {}
            
            for file_path in container_dir.glob('*.json'):
                try:
                    with open(file_path, 'r') as f:
                        data = json.load(f)
                    self.results['containers'][file_path.stem] = data
                except Exception as e:
                    print(f"Warning: Could not load {file_path}: {e}")
    
    def calculate_statistics(self) -> Dict[str, Any]:
        """Calculate comprehensive security statistics."""
        stats = {
            'overall_score': 0,
            'total_issues': 0,
            'critical_issues': 0,
            'high_issues': 0,
            'medium_issues': 0,
            'low_issues': 0,
            'categories': {}
        }
        
        # Secret scanning statistics
        if 'secrets' in self.results:
            secret_stats = self.calculate_secret_stats()
            stats['categories']['secrets'] = secret_stats
            stats['total_issues'] += secret_stats['total']
            stats['critical_issues'] += secret_stats['critical']
            stats['high_issues'] += secret_stats['high']
            stats['medium_issues'] += secret_stats['medium']
            stats['low_issues'] += secret_stats['low']
        
        # Dependency statistics
        if 'dependencies' in self.results:
            dep_stats = self.calculate_dependency_stats()
            stats['categories']['dependencies'] = dep_stats
            stats['total_issues'] += dep_stats['total']
            stats['critical_issues'] += dep_stats['critical']
            stats['high_issues'] += dep_stats['high']
            stats['medium_issues'] += dep_stats['medium']
            stats['low_issues'] += dep_stats['low']
        
        # Terraform statistics
        if 'terraform' in self.results:
            terraform_stats = self.calculate_terraform_stats()
            stats['categories']['terraform'] = terraform_stats
            stats['total_issues'] += terraform_stats['total']
            stats['critical_issues'] += terraform_stats['critical']
            stats['high_issues'] += terraform_stats['high']
            stats['medium_issues'] += terraform_stats['medium']
            stats['low_issues'] += terraform_stats['low']
        
        # Container statistics
        if 'containers' in self.results:
            container_stats = self.calculate_container_stats()
            stats['categories']['containers'] = container_stats
            stats['total_issues'] += container_stats['total']
            stats['critical_issues'] += container_stats['critical']
            stats['high_issues'] += container_stats['high']
            stats['medium_issues'] += container_stats['medium']
            stats['low_issues'] += container_stats['low']
        
        # Calculate overall security score
        stats['overall_score'] = self.calculate_security_score(stats)
        
        return stats
    
    def calculate_secret_stats(self) -> Dict[str, int]:
        """Calculate secret scanning statistics."""
        stats = {'total': 0, 'critical': 0, 'high': 0, 'medium': 0, 'low': 0}
        
        for scanner, data in self.results['secrets'].items():
            if isinstance(data, dict):
                if 'secrets' in data:  # Custom scanner format
                    secrets = data['secrets']
                elif 'Results' in data:  # Gitleaks format
                    secrets = data['Results']
                elif isinstance(data, list):  # Direct list format
                    secrets = data
                else:
                    secrets = []
                
                for secret in secrets:
                    if isinstance(secret, dict):
                        severity = secret.get('severity', 'MEDIUM').upper()
                        stats['total'] += 1
                        if severity in stats:
                            stats[severity.lower()] += 1
        
        return stats
    
    def calculate_dependency_stats(self) -> Dict[str, int]:
        """Calculate dependency security statistics."""
        stats = {'total': 0, 'critical': 0, 'high': 0, 'medium': 0, 'low': 0}
        
        for package_manager, scans in self.results['dependencies'].items():
            for scan_type, data in scans.items():
                if isinstance(data, dict):
                    if 'vulnerabilities' in data:  # NPM audit format
                        vulns = data['vulnerabilities']
                    elif 'results' in data:  # Safety format
                        vulns = data['results']
                    elif isinstance(data, list):  # Direct list
                        vulns = data
                    else:
                        vulns = []
                    
                    for vuln in vulns:
                        if isinstance(vuln, dict):
                            severity = vuln.get('severity', vuln.get('level', 'MEDIUM')).upper()
                            stats['total'] += 1
                            if severity in stats:
                                stats[severity.lower()] += 1
        
        return stats
    
    def calculate_terraform_stats(self) -> Dict[str, int]:
        """Calculate Terraform security statistics."""
        stats = {'total': 0, 'critical': 0, 'high': 0, 'medium': 0, 'low': 0}
        
        for scanner, data in self.results['terraform'].items():
            if isinstance(data, dict):
                if 'results' in data:  # TFSec/Checkov format
                    issues = data['results']
                elif 'failed' in data:  # Checkov summary
                    issues = data.get('results', [])
                elif isinstance(data, list):  # Direct list
                    issues = data
                else:
                    issues = []
                
                for issue in issues:
                    if isinstance(issue, dict):
                        severity = issue.get('severity', issue.get('type', 'MEDIUM')).upper()
                        stats['total'] += 1
                        if severity in stats:
                            stats[severity.lower()] += 1
        
        return stats
    
    def calculate_container_stats(self) -> Dict[str, int]:
        """Calculate container security statistics."""
        stats = {'total': 0, 'critical': 0, 'high': 0, 'medium': 0, 'low': 0}
        
        for scanner, data in self.results['containers'].items():
            if isinstance(data, dict):
                if 'Results' in data:  # Trivy format
                    issues = data['Results']
                    for result in issues:
                        if 'Vulnerabilities' in result:
                            for vuln in result['Vulnerabilities']:
                                severity = vuln.get('Severity', 'MEDIUM').upper()
                                stats['total'] += 1
                                if severity in stats:
                                    stats[severity.lower()] += 1
                elif isinstance(data, list):  # Direct list
                    for issue in data:
                        if isinstance(issue, dict):
                            severity = issue.get('severity', 'MEDIUM').upper()
                            stats['total'] += 1
                            if severity in stats:
                                stats[severity.lower()] += 1
        
        return stats
    
    def calculate_security_score(self, stats: Dict[str, Any]) -> int:
        """Calculate overall security score (0-100)."""
        base_score = 100
        
        # Deduct points based on severity
        base_score -= stats['critical_issues'] * 25  # Critical: -25 points each
        base_score -= stats['high_issues'] * 10      # High: -10 points each
        base_score -= stats['medium_issues'] * 3     # Medium: -3 points each
        base_score -= stats['low_issues'] * 1        # Low: -1 point each
        
        return max(0, min(100, base_score))
    
    def generate_recommendations(self, stats: Dict[str, Any]) -> List[str]:
        """Generate security recommendations based on findings."""
        recommendations = []
        
        # Overall recommendations
        if stats['critical_issues'] > 0:
            recommendations.append(f"🚨 CRITICAL: {stats['critical_issues']} critical issues require immediate remediation")
        
        if stats['high_issues'] > 0:
            recommendations.append(f"⚠️ HIGH: {stats['high_issues']} high-severity issues should be prioritized")
        
        # Category-specific recommendations
        if 'secrets' in stats['categories']:
            secret_stats = stats['categories']['secrets']
            if secret_stats['critical'] > 0:
                recommendations.append("🔑 Rotate all detected secrets and implement proper secrets management")
            if secret_stats['total'] > 0:
                recommendations.append("🔍 Enable pre-commit hooks to prevent future secret commits")
        
        if 'dependencies' in stats['categories']:
            dep_stats = stats['categories']['dependencies']
            if dep_stats['total'] > 0:
                recommendations.append("📦 Update vulnerable dependencies and implement dependency scanning")
        
        if 'terraform' in stats['categories']:
            terraform_stats = stats['categories']['terraform']
            if terraform_stats['total'] > 0:
                recommendations.append("🏗️ Fix Terraform security issues and enable IaC scanning")
        
        if 'containers' in stats['categories']:
            container_stats = stats['categories']['containers']
            if container_stats['total'] > 0:
                recommendations.append("🐳 Update container base images and fix container security issues")
        
        # Positive recommendations
        if stats['overall_score'] >= 90:
            recommendations.append("✅ Excellent security posture - maintain current practices")
        elif stats['overall_score'] >= 70:
            recommendations.append("👍 Good security posture - address high-priority issues")
        elif stats['overall_score'] >= 50:
            recommendations.append("⚠️ Moderate security posture - implement security improvements")
        else:
            recommendations.append("❌ Poor security posture - comprehensive security remediation required")
        
        return recommendations
    
    def generate_json_report(self, output_file: str):
        """Generate comprehensive JSON security report."""
        stats = self.calculate_statistics()
        recommendations = self.generate_recommendations(stats)
        
        report = {
            'scan_metadata': {
                'scanner': 'CredLink Comprehensive Security Scanner',
                'version': '1.0.0',
                'timestamp': datetime.now().isoformat(),
                'input_directory': str(self.input_dir)
            },
            'statistics': stats,
            'detailed_results': self.results,
            'recommendations': recommendations,
            'security_score': stats['overall_score']
        }
        
        with open(output_file, 'w') as f:
            json.dump(report, f, indent=2, default=str)
    
    def generate_markdown_report(self, output_file: str):
        """Generate comprehensive Markdown security report."""
        stats = self.calculate_statistics()
        recommendations = self.generate_recommendations(stats)
        
        template = """
# 🔒 CredLink Security Scan Report

**Generated:** {{ timestamp }}  
**Security Score:** {{ score }}/100  

## 📊 Executive Summary

{% if critical_issues > 0 %}
🚨 **CRITICAL ISSUES DETECTED** - Immediate action required
{% elif high_issues > 0 %}
⚠️ **HIGH SEVERITY ISSUES** - Priority remediation recommended
{% else %}
✅ **NO CRITICAL ISSUES** - Security posture is acceptable
{% endif %}

- **Total Issues:** {{ total_issues }}
- **Critical:** {{ critical_issues }}
- **High:** {{ high_issues }}
- **Medium:** {{ medium_issues }}
- **Low:** {{ low_issues }}

## 🎯 Security Score Breakdown

{% set score_color = "🟥" if score < 50 else "🟧" if score < 70 else "🟨" if score < 90 else "🟩" %}
{{ score_color }} **Overall Security Score: {{ score }}/100**

## 📈 Category Breakdown

{% for category, cat_stats in categories.items() %}
### {{ category.title() }} Security
- **Total Issues:** {{ cat_stats.total }}
- **Critical:** {{ cat_stats.critical }}
- **High:** {{ cat_stats.high }}
- **Medium:** {{ cat_stats.medium }}
- **Low:** {{ cat_stats.low }}

{% endfor %}

## 🎯 Recommendations

{% for rec in recommendations %}
{{ rec }}
{% endfor %}

## 🔍 Detailed Findings

{% for category, data in detailed_results.items() %}
{% if data %}
### {{ category.title() }} Scan Results

{% for scanner, results in data.items() %}
#### {{ scanner.title() }}
```json
{{ results | tojson(indent=2) }}
```

{% endfor %}
{% endif %}
{% endfor %}

---
*Report generated by CredLink Security Automation System*
        """
        
        # Render template
        jinja_env = jinja2.Environment(loader=jinja2.BaseLoader())
        template_obj = jinja_env.from_string(template)
        
        rendered_content = template_obj.render(
            timestamp=datetime.now().strftime("%Y-%m-%d %H:%M:%S UTC"),
            score=stats['overall_score'],
            total_issues=stats['total_issues'],
            critical_issues=stats['critical_issues'],
            high_issues=stats['high_issues'],
            medium_issues=stats['medium_issues'],
            low_issues=stats['low_issues'],
            categories=stats['categories'],
            recommendations=recommendations,
            detailed_results=self.results
        )
        
        with open(output_file, 'w') as f:
            f.write(rendered_content)

def main():
    parser = argparse.ArgumentParser(description='CredLink Security Report Generator')
    parser.add_argument('--input-dir', '-i', required=True, help='Input directory with security results')
    parser.add_argument('--output', '-o', default='security-comprehensive-report.json', help='JSON output file')
    parser.add_argument('--markdown', '-m', default='security-comprehensive-report.md', help='Markdown output file')
    
    args = parser.parse_args()
    
    if not os.path.exists(args.input_dir):
        print(f"❌ Input directory {args.input_dir} does not exist")
        sys.exit(1)
    
    print("📊 Generating comprehensive security report...")
    print(f"📁 Input directory: {args.input_dir}")
    
    generator = SecurityReportGenerator(args.input_dir)
    
    # Generate JSON report
    generator.generate_json_report(args.output)
    print(f"📄 JSON report generated: {args.output}")
    
    # Generate Markdown report
    generator.generate_markdown_report(args.markdown)
    print(f"📝 Markdown report generated: {args.markdown}")
    
    # Print summary
    stats = generator.calculate_statistics()
    print(f"\n🎯 Security Score: {stats['overall_score']}/100")
    print(f"📊 Total Issues: {stats['total_issues']}")
    
    if stats['critical_issues'] > 0:
        print("❌ CRITICAL issues detected - review required")
        sys.exit(1)
    elif stats['high_issues'] > 0:
        print("⚠️ HIGH severity issues detected")
        sys.exit(1)
    else:
        print("✅ Security scan completed successfully")
        sys.exit(0)

if __name__ == '__main__':
    main()
