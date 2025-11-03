#!/usr/bin/env node

/**
 * C2PA Audit CLI
 * Command-line interface for manifest diff and lineage analysis
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { readFile, writeFile } from 'fs/promises';
import { resolve } from 'path';
import { 
  CLIOptions, 
  LineageOptions, 
  OpenRawOptions,
  C2PAError,
  ValidationError 
} from '@/types';
import { ManifestParser } from '@/core/parser';
import { ManifestValidator } from '@/core/validator';
import { ManifestDiffer } from '@/core/differ';
import { LineageReconstructor } from '@/core/lineage';

/**
 * CLI Application class
 */
class C2PAAuditCLI {
  private program: Command;

  constructor() {
    this.program = new Command();
    this.setupCommands();
  }

  /**
   * Setup CLI commands
   */
  private setupCommands(): void {
    this.program
      .name('c2c-audit')
      .description('C2PA Manifest Diff and Audit Tool')
      .version('1.0.0');

    // Diff command
    this.program
      .command('diff')
      .description('Compare two C2PA manifests')
      .requiredOption('-b, --base <path>', 'Base manifest or asset path')
      .requiredOption('-t, --target <path>', 'Target manifest or asset path')
      .option('-o, --out <path>', 'Output file path')
      .option('-f, --format <format>', 'Output format (semantic|json-patch|merge-patch|lineage|evidence-pack)', 'semantic')
      .option('-v, --verbose', 'Verbose output')
      .option('-r, --raw', 'Include raw manifest data')
      .action(this.handleDiffCommand.bind(this));

    // Lineage command
    this.program
      .command('lineage')
      .description('Analyze manifest lineage')
      .requiredOption('-a, --asset <path>', 'Asset or manifest path')
      .option('-o, --out <path>', 'Output file path')
      .option('-d, --max-depth <number>', 'Maximum recursion depth', '10')
      .option('--include-redactions', 'Include redaction information')
      .action(this.handleLineageCommand.bind(this));

    // Open raw command
    this.program
      .command('open-raw')
      .description('Extract and display raw manifest data')
      .requiredOption('--asset <path>', 'Asset or manifest path')
      .option('-o, --out <path>', 'Output directory')
      .option('--include-jumbf', 'Include JUMBF structure map')
      .action(this.handleOpenRawCommand.bind(this));

    // Validate command
    this.program
      .command('validate')
      .description('Validate a single manifest')
      .requiredOption('--manifest <path>', 'Manifest or asset path')
      .option('-v, --verbose', 'Verbose validation output')
      .action(this.handleValidateCommand.bind(this));

    // Info command
    this.program
      .command('info')
      .description('Display manifest information')
      .requiredOption('--manifest <path>', 'Manifest or asset path')
      .action(this.handleInfoCommand.bind(this));
  }

  /**
   * Handle diff command
   */
  private async handleDiffCommand(options: any): Promise<void> {
    const spinner = ora('Parsing manifests...').start();

    try {
      // Validate input paths
      if (!options.base || !options.target) {
        throw new Error('Base and target paths are required');
      }

      // Validate format
      const validFormats = ['semantic', 'json-patch', 'merge-patch', 'lineage', 'evidence-pack'];
      if (!validFormats.includes(options.format)) {
        throw new Error(`Invalid format: ${options.format}. Must be one of: ${validFormats.join(', ')}`);
      }

      // Parse base and target manifests with size limits
      const baseData = await readFile(resolve(options.base));
      const targetData = await readFile(resolve(options.target));

      // Validate file sizes
      if (baseData.length > 100 * 1024 * 1024) {
        throw new Error('Base file exceeds 100MB limit');
      }
      if (targetData.length > 100 * 1024 * 1024) {
        throw new Error('Target file exceeds 100MB limit');
      }

      const baseManifest = await ManifestParser.parseManifest(baseData.buffer);
      const targetManifest = await ManifestParser.parseManifest(targetData.buffer);

      spinner.text = 'Validating manifests...';

      // Validate manifests
      const trustAnchors: any[] = []; // TODO: Load from config
      const baseValidation = await ManifestValidator.validateManifest(baseManifest, trustAnchors);
      const targetValidation = await ManifestValidator.validateManifest(targetManifest, trustAnchors);

      spinner.text = 'Generating diff...';

      // Generate diff based on format
      let result: any;

      switch (options.format) {
        case 'semantic':
          result = ManifestDiffer.generateSemanticDiff(baseManifest, targetManifest);
          break;
        
        case 'json-patch':
          result = ManifestDiffer.generateJSONPatch(baseManifest, targetManifest);
          break;
        
        case 'merge-patch':
          result = ManifestDiffer.generateMergePatch(baseManifest, targetManifest);
          break;
        
        case 'lineage':
          result = await LineageReconstructor.buildLineage(targetManifest, trustAnchors);
          break;
        
        case 'evidence-pack':
          result = await this.createEvidencePack(baseManifest, targetManifest, baseValidation, targetValidation);
          break;
        
        default:
          throw new C2PAError(`Unknown format: ${options.format}`, 'INVALID_FORMAT');
      }

      spinner.succeed('Diff generated successfully');

      // Output results
      if (options.out) {
        const outputPath = resolve(options.out);
        await writeFile(outputPath, JSON.stringify(result, null, 2));
        console.log(chalk.green(`✓ Results saved to ${outputPath}`));
      } else {
        this.displayResult(result, options.format, options.verbose, options.raw);
      }

    } catch (error) {
      spinner.fail('Diff generation failed');
      this.handleError(error);
    }
  }

  /**
   * Handle lineage command
   */
  private async handleLineageCommand(options: LineageOptions): Promise<void> {
    const spinner = ora('Analyzing lineage...').start();

    try {
      // Validate input
      if (!options.asset) {
        throw new Error('Asset path is required');
      }

      const maxDepth = parseInt(options.maxDepth || '10');
      if (isNaN(maxDepth) || maxDepth < 1 || maxDepth > 100) {
        throw new Error('Max depth must be between 1 and 100');
      }

      // Parse manifest with size validation
      const assetData = await readFile(resolve(options.asset));
      if (assetData.length > 100 * 1024 * 1024) {
        throw new Error('Asset file exceeds 100MB limit');
      }

      const manifest = await ManifestParser.parseManifest(assetData.buffer);

      spinner.text = 'Building lineage graph...';

      // Build lineage
      const trustAnchors: any[] = []; // TODO: Load from config
      const lineage = await LineageReconstructor.buildLineage(
        manifest, 
        trustAnchors, 
        maxDepth
      );

      spinner.succeed('Lineage analysis complete');

      // Prepare result
      const result = {
        lineage,
        manifest_info: {
          hash: manifest.manifest_hash,
          generator: manifest.claim_generator,
          timestamp: manifest.timestamp,
          signer: manifest.claim_signature.certificate_chain[0]?.subject || 'unknown'
        }
      };

      if (!options.includeRedactions) {
        delete result.lineage.redactions;
      }

      // Output results
      if (options.out) {
        const outputPath = resolve(options.out);
        await writeFile(outputPath, JSON.stringify(result, null, 2));
        console.log(chalk.green(`✓ Lineage saved to ${outputPath}`));
      } else {
        this.displayLineage(result, options.verbose);
      }

    } catch (error) {
      spinner.fail('Lineage analysis failed');
      this.handleError(error);
    }
  }

  /**
   * Handle open raw command
   */
  private async handleOpenRawCommand(options: any): Promise<void> {
    const spinner = ora('Extracting raw manifest...').start();

    try {
      // Parse manifest
      const assetData = await readFile(resolve(options.asset));
      const manifest = await ManifestParser.parseManifest(assetData.buffer);

      spinner.succeed('Raw manifest extracted');

      // Prepare result
      const result = {
        manifest,
        extracted_at: new Date().toISOString(),
        asset_path: resolve(options.asset)
      };

      if (options.includeJumbf) {
        // TODO: Extract JUMBF structure
        result.jumbf_map = { note: 'JUMBF extraction not yet implemented' };
      }

      // Output results
      if (options.out) {
        const outputPath = resolve(options.out, 'detailed.json');
        await writeFile(outputPath, JSON.stringify(result, null, 2));
        console.log(chalk.green(`✓ Raw manifest saved to ${outputPath}`));
      } else {
        console.log(JSON.stringify(result, null, 2));
      }

    } catch (error) {
      spinner.fail('Raw manifest extraction failed');
      this.handleError(error);
    }
  }

  /**
   * Handle validate command
   */
  private async handleValidateCommand(options: any): Promise<void> {
    const spinner = ora('Validating manifest...').start();

    try {
      // Validate input
      if (!options.manifest) {
        throw new Error('Manifest path is required');
      }

      // Parse manifest with size validation
      const manifestData = await readFile(resolve(options.manifest));
      if (manifestData.length > 100 * 1024 * 1024) {
        throw new Error('Manifest file exceeds 100MB limit');
      }

      const manifest = await ManifestParser.parseManifest(manifestData.buffer);

      const trustAnchors: any[] = []; // TODO: Load from config
      const validation = await ManifestValidator.validateManifest(manifest, trustAnchors);

      spinner.succeed('Validation complete');

      // Display results
      this.displayValidation(manifest, validation, options.verbose);

    } catch (error) {
      spinner.fail('Validation failed');
      this.handleError(error);
    }
  }

  /**
   * Handle info command
   */
  private async handleInfoCommand(options: any): Promise<void> {
    const spinner = ora('Extracting manifest info...').start();

    try {
      // Parse manifest
      const manifestData = await readFile(resolve(options.manifest));
      const manifest = await ManifestParser.parseManifest(manifestData.buffer);

      spinner.succeed('Info extracted');

      // Display manifest information
      this.displayManifestInfo(manifest);

    } catch (error) {
      spinner.fail('Info extraction failed');
      this.handleError(error);
    }
  }

  /**
   * Display diff results
   */
  private displayResult(result: any, format: string, verbose: boolean, includeRaw: boolean): void {
    console.log(chalk.bold.blue(`\\n=== C2PA Diff Result (${format}) ===\\n`));

    switch (format) {
      case 'semantic':
        this.displaySemanticDiff(result, verbose);
        break;
      
      case 'json-patch':
        this.displayJSONPatch(result, verbose);
        break;
      
      case 'merge-patch':
        this.displayMergePatch(result, verbose);
        break;
      
      case 'lineage':
        this.displayLineage({ lineage: result }, verbose);
        break;
      
      case 'evidence-pack':
        console.log(chalk.yellow('Evidence pack generated (use --out to save to file)'));
        if (verbose) {
          console.log(JSON.stringify(result, null, 2));
        }
        break;
    }
  }

  /**
   * Display semantic diff
   */
  private displaySemanticDiff(diff: any, verbose: boolean): void {
    console.log(chalk.bold('Signer Changes:'));
    console.log(`  Trust: ${diff.signer_diff.chain_trust}`);
    console.log(`  Algorithm: ${diff.signer_diff.algorithm}`);
    if (diff.signer_diff.subject) {
      console.log(`  Subject: ${diff.signer_diff.subject}`);
    }

    console.log(chalk.bold('\\nTimestamp Changes:'));
    console.log(`  Provider: ${diff.tsa_diff.provider}`);
    console.log(`  Time Difference: ${diff.tsa_diff.genTime_diff_ms}ms`);

    if (diff.assertions_added.length > 0) {
      console.log(chalk.bold.green('\\nAssertions Added:'));
      diff.assertions_added.forEach((a: any) => {
        console.log(`  + ${a.label} ${a.redacted ? '(redacted)' : ''}`);
      });
    }

    if (diff.assertions_removed.length > 0) {
      console.log(chalk.bold.red('\\nAssertions Removed:'));
      diff.assertions_removed.forEach((a: any) => {
        console.log(`  - ${a.label} ${a.redacted ? '(redacted)' : ''}`);
      });
    }

    if (diff.assertions_modified.length > 0) {
      console.log(chalk.bold.yellow('\\nAssertions Modified:'));
      diff.assertions_modified.forEach((a: any) => {
        console.log(`  ~ ${a.label} ${a.redacted ? '(redacted)' : ''}`);
      });
    }

    if (verbose) {
      console.log(chalk.bold('\\nValidation Codes:'));
      console.log(`  Base: ${diff.validation_codes.base.join(', ')}`);
      console.log(`  Target: ${diff.validation_codes.target.join(', ')}`);
    }
  }

  /**
   * Display JSON patch
   */
  private displayJSONPatch(patch: any[], verbose: boolean): void {
    console.log(`Found ${patch.length} patch operations:\\n`);

    patch.forEach((op, index) => {
      const operation = chalk.cyan(op.op);
      const path = chalk.yellow(op.path);
      console.log(`${index + 1}. ${operation} ${path}`);
      
      if (verbose && op.value !== undefined) {
        console.log(`   Value: ${JSON.stringify(op.value, null, 2)}`);
      }
    });
  }

  /**
   * Display merge patch
   */
  private displayMergePatch(patch: any, verbose: boolean): void {
    console.log(JSON.stringify(patch, null, verbose ? 2 : 0));
  }

  /**
   * Display lineage
   */
  private displayLineage(result: any, verbose: boolean): void {
    const { lineage, manifest_info } = result;

    console.log(chalk.bold('Manifest Information:'));
    console.log(`  Hash: ${manifest_info?.hash || 'unknown'}`);
    console.log(`  Generator: ${manifest_info?.generator || 'unknown'}`);
    console.log(`  Signer: ${manifest_info?.signer || 'unknown'}`);
    console.log(`  Timestamp: ${manifest_info?.timestamp || 'unknown'}`);

    console.log(chalk.bold('\\nLineage Summary:'));
    console.log(`  Total Nodes: ${lineage.validation_summary.total_nodes}`);
    console.log(`  Validated: ${chalk.green(lineage.validation_summary.validated_nodes)}`);
    console.log(`  Warnings: ${chalk.yellow(lineage.validation_summary.warning_nodes)}`);
    console.log(`  Failed: ${chalk.red(lineage.validation_summary.failed_nodes)}`);
    console.log(`  Overall Status: ${this.getStatusColor(lineage.validation_summary.overall_status)}`);

    if (verbose) {
      console.log(chalk.bold('\\nLineage Nodes:'));
      lineage.nodes.forEach((node: any) => {
        const status = this.getStatusColor(node.status);
        console.log(`  ${status} ${node.label}`);
        console.log(`    Hash: ${node.id.substring(0, 16)}...`);
        console.log(`    Signer: ${node.signer_thumbprint.substring(0, 16)}...`);
      });
    }
  }

  /**
   * Display validation results
   */
  private displayValidation(manifest: any, validation: any, verbose: boolean): void {
    const status = validation.valid ? chalk.green('VALID') : chalk.red('INVALID');
    console.log(chalk.bold(`Validation Status: ${status}`));
    console.log(`Summary: ${validation.summary}`);

    if (verbose && validation.codes.length > 0) {
      console.log(chalk.bold('\\nValidation Codes:'));
      validation.codes.forEach((code: string) => {
        const color = code.includes('valid') || code.includes('trusted') ? chalk.green : chalk.red;
        console.log(`  ${color(code)}`);
      });
    }
  }

  /**
   * Display manifest information
   */
  private displayManifestInfo(manifest: any): void {
    console.log(chalk.bold('Manifest Information:'));
    console.log(`  Hash: ${manifest.manifest_hash}`);
    console.log(`  Generator: ${manifest.claim_generator}`);
    console.log(`  Version: ${manifest.claim_generator_version}`);
    console.log(`  Timestamp: ${manifest.timestamp}`);
    console.log(`  Assertions: ${manifest.assertions.length}`);
    console.log(`  Ingredients: ${manifest.ingredients?.length || 0}`);

    const signer = manifest.claim_signature.certificate_chain[0];
    if (signer) {
      console.log(chalk.bold('\\nSigner Information:'));
      console.log(`  Subject: ${signer.subject}`);
      console.log(`  Issuer: ${signer.issuer}`);
      console.log(`  Thumbprint: ${signer.thumbprint}`);
    }
  }

  /**
   * Get colored status string
   */
  private getStatusColor(status: string): string {
    switch (status) {
      case 'validated':
        return chalk.green('✓ Validated');
      case 'validated_with_warnings':
        return chalk.yellow('⚠ Validated with warnings');
      case 'failed':
        return chalk.red('✗ Failed');
      default:
        return chalk.gray(status);
    }
  }

  /**
   * Create evidence pack
   */
  private async createEvidencePack(
    baseManifest: any, 
    targetManifest: any, 
    baseValidation: any, 
    targetValidation: any
  ): Promise<any> {
    const semanticDiff = ManifestDiffer.generateSemanticDiff(baseManifest, targetManifest);
    const lineage = await LineageReconstructor.buildLineage(targetManifest, []);

    return {
      base_raw: JSON.stringify(baseManifest, null, 2),
      target_raw: JSON.stringify(targetManifest, null, 2),
      semantic_diff: semanticDiff,
      lineage_graph: lineage,
      verification_transcript: {
        base_verification: baseValidation.codes.map((code: string) => ({
          step: code,
          code: code,
          result: baseValidation.valid
        })),
        target_verification: targetValidation.codes.map((code: string) => ({
          step: code,
          code: code,
          result: targetValidation.valid
        })),
        timestamps: {
          base_validation: new Date().toISOString(),
          target_validation: new Date().toISOString(),
          export: new Date().toISOString()
        }
      },
      exported_at: new Date().toISOString()
    };
  }

  /**
   * Handle CLI errors
   */
  private handleError(error: unknown): void {
    if (error instanceof C2PAError) {
      console.error(chalk.red(`Error: ${error.message} (${error.code})`));
      if (error.spec_reference) {
        console.error(chalk.gray(`See: ${error.spec_reference}`));
      }
    } else if (error instanceof ValidationError) {
      console.error(chalk.red(`Validation Error: ${error.message}`));
      console.error(chalk.yellow(`Codes: ${error.validation_codes.join(', ')}`));
    } else if (error instanceof Error) {
      console.error(chalk.red(`Error: ${error.message}`));
    } else {
      console.error(chalk.red('Unknown error occurred'));
    }

    process.exit(1);
  }

  /**
   * Run CLI application
   */
  async run(argv: string[]): Promise<void> {
    try {
      await this.program.parseAsync(argv);
    } catch (error) {
      this.handleError(error);
    }
  }
}

// Run CLI if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const cli = new C2PAAuditCLI();
  cli.run(process.argv).catch((error) => {
    console.error('CLI startup failed:', error);
    process.exit(1);
  });
}

export { C2PAAuditCLI };
