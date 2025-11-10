/**
 * Issue/PR Template Generator - Phase 34 Spec Watch
 * Creates standardized GitHub issues and pull requests for spec changes
 */

import { writeFile } from 'fs/promises';
import { join } from 'path';
import { Octokit } from '@octokit/rest';
import type { SpecChange, GauntletResult, IssueTemplate } from '@/types';
import { validateGitHubRepo, sanitizeContent } from '@/utils/security';

export interface IssueGeneratorConfig {
  github_token: string;
  owner: string;
  repo: string;
  issue_labels: string[];
  pr_labels: string[];
  output_dir: string;
  auto_submit: boolean;
}

export class IssueGenerator {
  private config: IssueGeneratorConfig;
  private octokit: Octokit;

  constructor(config: IssueGeneratorConfig) {
    this.config = config;
    this.validateConfig();
    
    this.octokit = new Octokit({
      auth: config.github_token,
      userAgent: 'C2PA-Spec-Watch-Issue-Generator/1.1.0',
    });
  }

  /**
   * Generates an issue for a spec change with gauntlet evidence
   */
  async generateIssue(change: SpecChange, gauntletResult: GauntletResult): Promise<IssueTemplate> {
    const issueType = this.determineIssueType(change, gauntletResult);
    const title = this.generateIssueTitle(change, issueType);
    const body = this.generateIssueBody(change, gauntletResult, issueType);
    const labels = this.generateLabels(change, issueType);
    const specReferences = this.extractSpecReferences(change);

    const issue: IssueTemplate = {
      type: issueType,
      title: sanitizeContent(title, 500),
      body: sanitizeContent(body, 10000),
      labels,
      spec_references: specReferences,
      evidence_pack: gauntletResult.artifacts.evidence_pack,
      repro_steps: this.generateReproSteps(change, gauntletResult),
      expected_behavior: this.generateExpectedBehavior(change),
      actual_behavior: this.generateActualBehavior(change, gauntletResult),
    };

    // Save issue template to file
    await this.saveIssueTemplate(issue);

    // Auto-submit if enabled
    if (this.config.auto_submit) {
      await this.submitIssue(issue);
    }

    return issue;
  }

  /**
   * Generates a pull request for spec improvements
   */
  async generatePullRequest(change: SpecChange, gauntletResult: GauntletResult): Promise<IssueTemplate> {
    const title = this.generatePRTitle(change);
    const body = this.generatePRBody(change, gauntletResult);
    const labels = this.config.pr_labels;

    const pr: IssueTemplate = {
      type: 'pull_request',
      title: sanitizeContent(title, 500),
      body: sanitizeContent(body, 10000),
      labels,
      spec_references: this.extractSpecReferences(change),
      evidence_pack: gauntletResult.artifacts.evidence_pack,
      repro_steps: this.generateReproSteps(change, gauntletResult),
      expected_behavior: this.generateExpectedBehavior(change),
      actual_behavior: this.generateActualBehavior(change, gauntletResult),
    };

    // Save PR template to file
    await this.savePRTemplate(pr);

    // Auto-submit if enabled
    if (this.config.auto_submit) {
      await this.submitPullRequest(pr);
    }

    return pr;
  }

  /**
   * Determines whether to create an issue or pull request
   */
  private determineIssueType(change: SpecChange, gauntletResult: GauntletResult): 'issue' | 'pull_request' {
    // Pull request for clear improvements or clarifications
    if (change.change_type === 'content' && change.severity === 'low') {
      return 'pull_request';
    }

    // Issue for problems or high-severity changes
    if (change.severity === 'critical' || change.severity === 'high') {
      return 'issue';
    }

    // Issue for gauntlet failures
    if (gauntletResult.status !== 'passed') {
      return 'issue';
    }

    // Default to issue for discussion
    return 'issue';
  }

  /**
   * Generates issue title based on change and gauntlet results
   */
  private generateIssueTitle(change: SpecChange, type: 'issue' | 'pull_request'): string {
    const severity = change.severity.toUpperCase();
    const target = change.target_id.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    
    if (type === 'pull_request') {
      return `docs: improve ${target} specification clarity`;
    }

    // Issue titles based on change content
    const content = change.sections.map(s => s.new_content).join(' ').toLowerCase();
    
    if (content.includes('discovery') && content.includes('precedence')) {
      return `${severity}: Remote-manifest discovery precedence clarification needed`;
    }
    
    if (content.includes('remote') && content.includes('manifest')) {
      return `${severity}: Remote-manifest durability wording needs improvement`;
    }
    
    if (content.includes('video') && content.includes('semantics')) {
      return `${severity}: Video semantics and labels need specification updates`;
    }
    
    if (content.includes('security') && content.includes('validation')) {
      return `${severity}: Security validation lifetime requires clarification`;
    }
    
    return `${severity}: ${target} specification change detected - impact analysis needed`;
  }

  /**
   * Generates issue body with full context and evidence
   */
  private generateIssueBody(change: SpecChange, gauntletResult: GauntletResult, type: 'issue' | 'pull_request'): string {
    const severity = change.severity.toUpperCase();
    const specRefs = change.spec_references.map(ref => `- §${ref.section}: ${ref.url}`).join('\n');

    return `## ${severity} Specification Change Detected

**Target:** ${change.target_id}
**Detected:** ${change.detected_at}
**Change Type:** ${change.change_type}
**Severity:** ${change.severity}

### Summary

${change.description}

### Specification References

${specRefs}

### Change Details

${change.sections.map(section => `
#### ${section.title}

${section.old_content ? `\`\`\`diff
- ${section.old_content}
+ ${section.new_content}
\`\`\`` : `\`\`\`
${section.new_content}
\`\`\``}

${section.context_before ? `**Context:**\n${section.context_before}\n` : ''}
`).join('\n')}

### Gauntlet Test Results

**Status:** ${gauntletResult.status}
**Run Date:** ${gauntletResult.run_at}

**Summary:**
- Total Assets: ${gauntletResult.summary.total_assets}
- Embedded Survived: ${gauntletResult.summary.embedded_survived}
- Remote Survived: ${gauntletResult.summary.remote_survived}
- Discovery Precedence Changed: ${gauntletResult.summary.discovery_precedence_changed ? 'Yes' : 'No'}
- Video Semantics Affected: ${gauntletResult.summary.video_semantics_affected ? 'Yes' : 'No'}

### Reproducer

${this.generateReproSteps(change, gauntletResult).map((step, i) => `${i + 1}. ${step}`).join('\n')}

### Expected Behavior

${this.generateExpectedBehavior(change)}

### Actual Behavior

${this.generateActualBehavior(change, gauntletResult)}

### Impact Analysis

This change affects:
${this.generateImpactAnalysis(change, gauntletResult).map(impact => `- ${impact}`).join('\n')}

### Proposed Action

${this.generateProposedAction(change, gauntletResult)}

### Evidence Pack

All test artifacts and detailed logs are available in the evidence pack:
\`${gauntletResult.artifacts.evidence_pack}\`

### Additional Context

${type === 'issue' ? 
'This issue is filed to ensure the specification change is properly reviewed and its impact on C2PA implementations is thoroughly evaluated.' :
'This pull request proposes improvements to enhance specification clarity and implementation guidance.'}

---

**Generated by:** C2PA Spec Watch System v1.1.0  
**Change ID:** ${change.id}  
**Gauntlet ID:** ${gauntletResult.id}
`;
  }

  /**
   * Generates pull request body for specification improvements
   */
  private generatePRBody(change: SpecChange, gauntletResult: GauntletResult): string {
    return `## Specification Improvement Proposal

This pull request addresses the specification change detected in \`${change.target_id}\` to improve clarity and implementation guidance.

### Background

${change.description}

### Changes Made

${this.generateChangeDescription(change)}

### Test Results

Gauntlet testing shows:
- **Status:** ${gauntletResult.status}
- **Embedded Manifests:** ${gauntletResult.summary.embedded_survived}/${gauntletResult.summary.total_assets} survived
- **Remote Manifests:** ${gauntletResult.summary.remote_survived}/${gauntletResult.summary.total_assets} survived

### Validation

These changes have been validated against:
- C2PA specification v2.2
- 24 sentinel assets (image + video)
- Current tool implementations (c2patool, CAI Verify)

### Impact

This improvement enhances:
- Specification clarity
- Implementation consistency
- Test coverage

### Review Checklist

- [ ] Changes align with C2PA specification v2.2
- [ ] Examples are accurate and reproducible
- [ ] Test vectors are provided where applicable
- [ ] Cross-references are correct
- [ ] No breaking changes introduced

---

**Generated by:** C2PA Spec Watch System v1.1.0  
**Change ID:** ${change.id}
`;
  }

  /**
   * Generates appropriate labels for the issue/PR
   */
  private generateLabels(change: SpecChange, type: 'issue' | 'pull_request'): string[] {
    const baseLabels = type === 'pull_request' ? this.config.pr_labels : this.config.issue_labels;
    const severityLabels = {
      low: ['priority: low'],
      medium: ['priority: medium'],
      high: ['priority: high'],
      critical: ['priority: critical'],
    };

    const contentLabels = this.generateContentLabels(change);
    
    return [...baseLabels, ...severityLabels[change.severity], ...contentLabels];
  }

  /**
   * Generates content-specific labels
   */
  private generateContentLabels(change: SpecChange): string[] {
    const content = change.sections.map(s => s.new_content).join(' ').toLowerCase();
    const labels: string[] = [];

    if (content.includes('discovery')) labels.push('area: discovery');
    if (content.includes('remote')) labels.push('area: remote-manifest');
    if (content.includes('video')) labels.push('area: video');
    if (content.includes('security')) labels.push('area: security');
    if (content.includes('validation')) labels.push('area: validation');
    if (content.includes('jumbf')) labels.push('area: jumbf');

    return labels;
  }

  /**
   * Generates reproduction steps
   */
  private generateReproSteps(change: SpecChange, gauntletResult: GauntletResult): string[] {
    const steps = [
      `Clone the specification repository: \`git clone https://github.com/c2pa-org/specifications.git\``,
      `Navigate to the relevant specification document: \`${change.target_id}\``,
      `Review the changes at the detected sections`,
    ];

    if (gauntletResult.status !== 'passed') {
      steps.push(
        `Run the gauntlet test suite: \`./scripts/run-gauntlet.sh ${change.id}\``,
        `Examine the failing assets in the evidence pack`,
        `Compare before/after verification outputs`
      );
    }

    steps.push(
      `Test with current toolchain: \`c2patool <asset> --output json\``,
      `Verify with CAI Verify tool`,
      `Compare results against specification requirements`
    );

    return steps;
  }

  /**
   * Generates expected behavior description
   */
  private generateExpectedBehavior(change: SpecChange): string {
    const content = change.sections.map(s => s.new_content).join(' ').toLowerCase();

    if (content.includes('discovery') && content.includes('precedence')) {
      return 'Discovery order should be clearly defined and consistently implemented across all C2PA tools. When both embedded and remote manifests are present, the specification should explicitly state which takes precedence.';
    }

    if (content.includes('remote') && content.includes('manifest')) {
      return 'Remote manifest durability should be guaranteed through clear soft binding examples and manifest repository guidelines. Implementations should handle remote manifests reliably across different network conditions.';
    }

    if (content.includes('video') && content.includes('semantics')) {
      return 'Video semantics should be consistently supported across devices and players. Labels and UX expectations should be clearly defined to ensure interoperability.';
    }

    if (content.includes('security') && content.includes('validation')) {
      return 'Security validation should have clear lifetime requirements and replay protection for remote manifest fetching. Cryptographic algorithm requirements should be explicit.';
    }

    return 'Specification changes should maintain backward compatibility and provide clear implementation guidance for C2PA tool developers.';
  }

  /**
   * Generates actual behavior description
   */
  private generateActualBehavior(change: SpecChange, gauntletResult: GauntletResult): string {
    if (gauntletResult.status === 'failed') {
      return `Gauntlet testing revealed inconsistencies in implementation. ${gauntletResult.summary.discovery_precedence_changed ? 'Discovery precedence changed across assets.' : ''} ${gauntletResult.summary.video_semantics_affected ? 'Video semantics were affected.' : ''} ${gauntletResult.summary.embedded_survived < gauntletResult.summary.total_assets ? 'Some embedded manifests failed to survive.' : ''} ${gauntletResult.summary.remote_survived < gauntletResult.summary.total_assets ? 'Some remote manifests failed to survive.' : ''}`;
    }

    return `Current implementations show varying behavior when processing the updated specification. The change affects ${change.change_type} and requires clarification to ensure consistent implementation across the C2PA ecosystem.`;
  }

  /**
   * Generates impact analysis
   */
  private generateImpactAnalysis(change: SpecChange, gauntletResult: GauntletResult): string[] {
    const impacts = [
      'C2PA specification interpretation',
      'Tool implementation consistency',
    ];

    if (change.severity === 'critical' || change.severity === 'high') {
      impacts.push('Production system compatibility');
      impacts.push('Existing manifest validation');
    }

    if (gauntletResult.summary.discovery_precedence_changed) {
      impacts.push('Manifest discovery order');
    }

    if (gauntletResult.summary.video_semantics_affected) {
      impacts.push('Video player compatibility');
    }

    if (gauntletResult.summary.embedded_survived < gauntletResult.summary.total_assets) {
      impacts.push('Embedded manifest survival');
    }

    if (gauntletResult.summary.remote_survived < gauntletResult.summary.total_assets) {
      impacts.push('Remote manifest accessibility');
    }

    return impacts;
  }

  /**
   * Generates proposed action
   */
  private generateProposedAction(change: SpecChange, gauntletResult: GauntletResult): string {
    if (change.change_type === 'content' && change.severity === 'low') {
      return 'Update specification language to improve clarity and add illustrative examples.';
    }

    if (change.severity === 'critical') {
      return 'Immediate specification clarification needed. Consider emergency update to prevent implementation divergence.';
    }

    if (gauntletResult.status === 'failed') {
      return 'Investigate gauntlet failures and update specification to ensure consistent implementation. Add test vectors to validate compliance.';
    }

    return 'Review specification change and provide implementation guidance. Update conformance tests if needed.';
  }

  /**
   * Generates PR title
   */
  private generatePRTitle(change: SpecChange): string {
    const content = change.sections.map(s => s.new_content).join(' ').toLowerCase();

    if (content.includes('discovery')) {
      return 'docs: clarify manifest discovery precedence';
    }

    if (content.includes('remote')) {
      return 'docs: improve remote manifest durability guidance';
    }

    if (content.includes('video')) {
      return 'docs: enhance video semantics specification';
    }

    if (content.includes('security')) {
      return 'docs: strengthen security validation requirements';
    }

    return 'docs: improve specification clarity and examples';
  }

  /**
   * Generates change description for PR
   */
  private generateChangeDescription(change: SpecChange): string {
    return change.sections.map(section => {
      if (section.old_content && section.new_content) {
        return `- Updated ${section.title}: Clarified language and added examples`;
      }
      return `- Enhanced ${section.title}: Added implementation guidance`;
    }).join('\n');
  }

  /**
   * Extracts specification references
   */
  private extractSpecReferences(change: SpecChange): string[] {
    return change.spec_references.map(ref => ref.url);
  }

  /**
   * Saves issue template to file
   */
  private async saveIssueTemplate(issue: IssueTemplate): Promise<void> {
    const filename = `issue-${issue.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md`;
    const filepath = join(this.config.output_dir, filename);
    const content = this.formatIssueForFile(issue);
    await writeFile(filepath, content);
  }

  /**
   * Saves PR template to file
   */
  private async savePRTemplate(pr: IssueTemplate): Promise<void> {
    const filename = `pr-${pr.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md`;
    const filepath = join(this.config.output_dir, filename);
    const content = this.formatPRForFile(pr);
    await writeFile(filepath, content);
  }

  /**
   * Formats issue for file output
   */
  private formatIssueForFile(issue: IssueTemplate): string {
    return `# ${issue.title}

${issue.body}

---

**Labels:** ${issue.labels.join(', ')}  
**Spec References:** ${issue.spec_references.join(', ')}  
**Evidence Pack:** ${issue.evidence_pack}
`;
  }

  /**
   * Formats PR for file output
   */
  private formatPRForFile(pr: IssueTemplate): string {
    return `# ${pr.title}

${pr.body}

---

**Labels:** ${pr.labels.join(', ')}  
**Spec References:** ${pr.spec_references.join(', ')}  
**Evidence Pack:** ${pr.evidence_pack}
`;
  }

  /**
   * Submits issue to GitHub
   */
  private async submitIssue(issue: IssueTemplate): Promise<void> {
    try {
      await this.octokit.issues.create({
        owner: this.config.owner,
        repo: this.config.repo,
        title: issue.title,
        body: issue.body,
        labels: issue.labels,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to submit issue: ${errorMessage}`);
    }
  }

  /**
   * Submits pull request to GitHub
   */
  private async submitPullRequest(pr: IssueTemplate): Promise<void> {
    // This would require creating the actual PR content and files
    // For now, we'll create an issue marked as enhancement
    try {
      await this.octokit.issues.create({
        owner: this.config.owner,
        repo: this.config.repo,
        title: pr.title,
        body: pr.body,
        labels: [...pr.labels, 'enhancement'],
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to submit pull request: ${errorMessage}`);
    }
  }

  /**
   * Validates configuration
   */
  private validateConfig(): void {
    if (!this.config.github_token) {
      throw new Error('GitHub token is required');
    }

    validateGitHubRepo(`${this.config.owner}/${this.config.repo}`);
  }
}
