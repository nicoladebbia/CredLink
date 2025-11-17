#==================================================
# Security Gate Evaluation Script - Step 18
#==================================================
#!/usr/bin/env python3
"""
Evaluates security scan results against configured thresholds
Implements fail-fast security gates for CI/CD pipelines
"""

import json
import argparse
import sys
from pathlib import Path
from typing import Dict, List, Any, Optional
from datetime import datetime

class SecurityGateEvaluator:
    def __init__(self):
        self.thresholds = {
            'critical_issues': 0,      # Fail on any critical issues
            'high_issues': 0,          # Fail on any high issues
            'medium_issues': 10,       # Allow up to 10 medium issues
            'low_issues': 25,          # Allow up to 25 low issues
            'security_score_min': 70   # Minimum security score required
        }
        self.results = {}
        self.evaluation = {
            'passed': False,
            'failures': [],
            'warnings': [],
            'summary': {}
        }
    
    def load_security_report(self, report_file: str) -> Dict[str, Any]:
        """Load comprehensive security report."""
        try:
            with open(report_file, 'r') as f:
                data = json.load(f)
            self.results = data
            return data
        except Exception as e:
            print(f"❌ ERROR: Could not load security report from {report_file}: {e}")
            sys.exit(1)
    
    def evaluate_severity_thresholds(self, stats: Dict[str, Any]) -> List[str]:
        """Evaluate security issues against severity thresholds."""
        failures = []
        
        critical_count = stats.get('critical_issues', 0)
        high_count = stats.get('high_issues', 0)
        medium_count = stats.get('medium_issues', 0)
        low_count = stats.get('low_issues', 0)
        
        if critical_count > self.thresholds['critical_issues']:
            failures.append(f"🚨 CRITICAL: {critical_count} critical issues detected (threshold: {self.thresholds['critical_issues']})")
        
        if high_count > self.thresholds['high_issues']:
            failures.append(f"⚠️ HIGH: {high_count} high-severity issues detected (threshold: {self.thresholds['high_issues']})")
        
        if medium_count > self.thresholds['medium_issues']:
            failures.append(f"📊 MEDIUM: {medium_count} medium-severity issues detected (threshold: {self.thresholds['medium_issues']})")
        
        if low_count > self.thresholds['low_issues']:
            failures.append(f"📋 LOW: {low_count} low-severity issues detected (threshold: {self.thresholds['low_issues']})")
        
        return failures
    
    def evaluate_security_score(self, security_score: int) -> List[str]:
        """Evaluate overall security score against minimum threshold."""
        failures = []
        
        if security_score < self.thresholds['security_score_min']:
            failures.append(f"🎯 SECURITY SCORE: {security_score} below minimum threshold ({self.thresholds['security_score_min']})")
        
        return failures
    
    def evaluate_category_thresholds(self, categories: Dict[str, Any]) -> List[str]:
        """Evaluate security issues by category with specific thresholds."""
        failures = []
        
        category_thresholds = {
            'secrets': {'critical': 0, 'high': 0, 'medium': 5, 'low': 10},
            'dependencies': {'critical': 0, 'high': 2, 'medium': 10, 'low': 20},
            'terraform': {'critical': 0, 'high': 1, 'medium': 5, 'low': 15},
            'containers': {'critical': 0, 'high': 1, 'medium': 3, 'low': 10}
        }
        
        for category, stats in categories.items():
            if category in category_thresholds:
                thresholds = category_thresholds[category]
                
                critical = stats.get('critical', 0)
                high = stats.get('high', 0)
                medium = stats.get('medium', 0)
                low = stats.get('low', 0)
                
                if critical > thresholds['critical']:
                    failures.append(f"🚨 {category.upper()}: {critical} critical issues (threshold: {thresholds['critical']})")
                
                if high > thresholds['high']:
                    failures.append(f"⚠️ {category.upper()}: {high} high issues (threshold: {thresholds['high']})")
                
                if medium > thresholds['medium']:
                    failures.append(f"📊 {category.upper()}: {medium} medium issues (threshold: {thresholds['medium']})")
                
                if low > thresholds['low']:
                    failures.append(f"📋 {category.upper()}: {low} low issues (threshold: {thresholds['low']})")
        
        return failures
    
    def evaluate_specific_issues(self, detailed_results: Dict[str, Any]) -> List[str]:
        """Evaluate specific high-impact security issues."""
        failures = []
        warnings = []
        
        # Check for specific secret types that should always fail
        if 'secrets' in detailed_results:
            for scanner, results in detailed_results['secrets'].items():
                if isinstance(results, dict) and 'secrets' in results:
                    secrets = results['secrets']
                elif isinstance(results, list):
                    secrets = results
                else:
                    continue
                
                for secret in secrets:
                    if isinstance(secret, dict):
                        secret_type = secret.get('secret_type', '').lower()
                        severity = secret.get('severity', '').upper()
                        
                        # Always fail on certain critical secret types
                        critical_types = [
                            'aws access key', 'aws secret key', 'github pat', 
                            'database url', 'jwt secret', 'private key',
                            'api key', 'password', 'token'
                        ]
                        
                        if any(ct in secret_type for ct in critical_types) and severity in ['CRITICAL', 'HIGH']:
                            failures.append(f"🔑 CRITICAL SECRET TYPE: {secret_type} detected in {secret.get('file', 'unknown')}")
                        
                        # Warn on potentially sensitive patterns
                        if 'test' in secret_type or 'mock' in secret_type:
                            warnings.append(f"🧪 TEST SECRET: {secret_type} found in {secret.get('file', 'unknown')} - should use environment variables")
        
        # Check for dependency issues with known CVEs
        if 'dependencies' in detailed_results:
            for package_manager, scans in detailed_results['dependencies'].items():
                for scan_type, data in scans.items():
                    if isinstance(data, dict) and 'vulnerabilities' in data:
                        for vuln in data['vulnerabilities']:
                            if isinstance(vuln, dict):
                                severity = vuln.get('severity', 'MEDIUM').upper()
                                if severity == 'CRITICAL':
                                    failures.append(f"📦 CRITICAL DEPENDENCY: {vuln.get('package', 'unknown')} in {package_manager}")
        
        self.evaluation['warnings'].extend(warnings)
        return failures
    
    def generate_summary(self, stats: Dict[str, Any]) -> Dict[str, Any]:
        """Generate evaluation summary."""
        summary = {
            'total_issues': stats.get('total_issues', 0),
            'critical_issues': stats.get('critical_issues', 0),
            'high_issues': stats.get('high_issues', 0),
            'medium_issues': stats.get('medium_issues', 0),
            'low_issues': stats.get('low_issues', 0),
            'security_score': self.results.get('security_score', 0),
            'gate_status': 'FAILED' if self.evaluation['failures'] else 'PASSED',
            'evaluation_timestamp': datetime.now().isoformat()
        }
        
        return summary
    
    def evaluate_security_gate(self, report_file: str, fail_on_critical: bool = True) -> Dict[str, Any]:
        """Perform comprehensive security gate evaluation."""
        
        print("🚪 Evaluating security gate...")
        print(f"📋 Loading security report from: {report_file}")
        
        # Load security report
        report = self.load_security_report(report_file)
        
        # Extract statistics
        stats = report.get('statistics', {})
        categories = stats.get('categories', {})
        detailed_results = report.get('detailed_results', {})
        security_score = report.get('security_score', 0)
        
        print(f"📊 Security Score: {security_score}/100")
        print(f"🔍 Total Issues: {stats.get('total_issues', 0)}")
        
        # Perform evaluations
        severity_failures = self.evaluate_severity_thresholds(stats)
        score_failures = self.evaluate_security_score(security_score)
        category_failures = self.evaluate_category_thresholds(categories)
        specific_failures = self.evaluate_specific_issues(detailed_results)
        
        # Combine all failures
        all_failures = severity_failures + score_failures + category_failures + specific_failures
        
        self.evaluation['failures'] = all_failures
        self.evaluation['passed'] = len(all_failures) == 0
        self.evaluation['summary'] = self.generate_summary(stats)
        
        # Print results
        print(f"\n🎯 Security Gate Results:")
        print(f"   Status: {'✅ PASSED' if self.evaluation['passed'] else '❌ FAILED'}")
        print(f"   Failures: {len(all_failures)}")
        print(f"   Warnings: {len(self.evaluation['warnings'])}")
        
        if all_failures:
            print(f"\n🚨 Security Gate Failures:")
            for failure in all_failures:
                print(f"   {failure}")
        
        if self.evaluation['warnings']:
            print(f"\n⚠️ Security Warnings:")
            for warning in self.evaluation['warnings']:
                print(f"   {warning}")
        
        return self.evaluation
    
    def write_evaluation_report(self, output_file: str):
        """Write detailed evaluation report to file."""
        report = {
            'evaluation_metadata': {
                'evaluator': 'CredLink Security Gate Evaluator',
                'version': '1.0.0',
                'timestamp': datetime.now().isoformat(),
                'thresholds': self.thresholds
            },
            'evaluation': self.evaluation,
            'original_report': self.results
        }
        
        with open(output_file, 'w') as f:
            json.dump(report, f, indent=2, default=str)
        
        print(f"📄 Evaluation report written to: {output_file}")

def main():
    parser = argparse.ArgumentParser(description='CredLink Security Gate Evaluator')
    parser.add_argument('--report', '-r', required=True, help='Security report JSON file')
    parser.add_argument('--output', '-o', default='security-gate-evaluation.json', help='Evaluation output file')
    parser.add_argument('--fail-on-critical', action='store_true', default=True, help='Fail on critical issues')
    parser.add_argument('--allow-critical', type=int, default=0, help='Allow specified number of critical issues')
    parser.add_argument('--allow-high', type=int, default=0, help='Allow specified number of high issues')
    parser.add_argument('--min-score', type=int, default=70, help='Minimum security score required')
    
    args = parser.parse_args()
    
    if not Path(args.report).exists():
        print(f"❌ ERROR: Security report file {args.report} does not exist")
        sys.exit(1)
    
    evaluator = SecurityGateEvaluator()
    
    # Update thresholds based on arguments
    evaluator.thresholds['critical_issues'] = args.allow_critical
    evaluator.thresholds['high_issues'] = args.allow_high
    evaluator.thresholds['security_score_min'] = args.min_score
    
    # Perform evaluation
    evaluation = evaluator.evaluate_security_gate(args.report, args.fail_on_critical)
    
    # Write evaluation report
    evaluator.write_evaluation_report(args.output)
    
    # Exit with appropriate code
    if evaluation['passed']:
        print("✅ Security gate passed")
        sys.exit(0)
    else:
        print("❌ Security gate failed")
        sys.exit(1)

if __name__ == '__main__':
    main()
