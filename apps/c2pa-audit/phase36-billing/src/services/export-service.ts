/**
 * Phase 36 Billing - Export Service
 * Tenant data export and cancellation functionality
 */

import { createWriteStream, createReadStream } from 'fs';
import { mkdir, readdir, stat, unlink } from 'fs/promises';
import { join } from 'path';
import { archiver, ZipOptions } from 'archiver';
import tar from 'tar';
import { Redis } from 'ioredis';
import Stripe from 'stripe';
import { 
  TenantExport,
  ExportIncludes,
  CancelTenantRequest,
  CancelTenantResponse,
  Tenant,
  UsageWindow,
  InvoiceLineItem
} from '@/types';

export interface ExportServiceConfig {
  redis: Redis;
  stripe: Stripe;
  exportStoragePath: string;
  manifestRetentionDays: number;
  dataRetentionDays: number;
  maxExportSizeGb: number;
}

export class ExportService {
  private redis: Redis;
  private stripe: Stripe;
  private config: ExportServiceConfig;

  constructor(config: ExportServiceConfig) {
    this.redis = config.redis;
    this.stripe = config.stripe;
    this.config = config;
  }

  /**
   * Cancel tenant subscription and create export
   */
  async cancelTenant(
    tenantId: string,
    request: CancelTenantRequest
  ): Promise<CancelTenantResponse> {
    try {
      // Get tenant information
      const tenant = await this.getTenant(tenantId);
      if (!tenant) {
        throw new Error('Tenant not found');
      }

      let exportUrl: string | undefined;

      // Create export if requested
      if (request.export_data) {
        const exportJob = await this.createExportJob(tenantId, {
          manifests: true,
          verify_logs: true,
          invoices: true,
          compliance_reports: true,
          usage_data: true,
        });

        exportUrl = await this.processExportJob(exportJob);
      }

      // Cancel Stripe subscription
      await this.stripe.subscriptions.update(tenant.stripe_subscription_id, {
        cancel_at_period_end: true,
      });

      // Update tenant status
      tenant.status = 'canceled';
      tenant.updated_at = new Date().toISOString();
      await this.storeTenant(tenant);

      // Calculate cancellation dates
      const subscription = await this.stripe.subscriptions.retrieve(tenant.stripe_subscription_id);
      const cancellationDate = new Date(subscription.cancel_at! * 1000).toISOString();
      const finalInvoiceDate = new Date(subscription.current_period_end * 1000).toISOString();

      return {
        export_url: exportUrl,
        cancellation_date: cancellationDate,
        final_invoice_date: finalInvoiceDate,
        data_retention_days: this.config.dataRetentionDays,
      };
    } catch (error) {
      throw new Error(`Failed to cancel tenant: ${error}`);
    }
  }

  /**
   * Create export job for tenant
   */
  async createExportJob(tenantId: string, includes: ExportIncludes): Promise<TenantExport> {
    const exportId = this.generateExportId();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (7 * 24 * 60 * 60 * 1000)); // 7 days

    const exportJob: TenantExport = {
      tenant_id: tenantId,
      export_id: exportId,
      status: 'preparing',
      created_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      format: 'zip',
      includes,
    };

    // Store export job
    await this.storeExportJob(exportJob);

    return exportJob;
  }

  /**
   * Process export job and generate data package
   */
  async processExportJob(exportJob: TenantExport): Promise<string> {
    try {
      const exportDir = await this.createExportDirectory(exportJob.export_id);
      const archivePath = join(exportDir, `tenant-${exportJob.tenant_id}-export.${exportJob.format}`);

      // Create archive
      const archive = archiver('zip', {
        zlib: { level: 9 }, // Maximum compression
      });

      const output = createWriteStream(archivePath);
      archive.pipe(output);

      // Add tenant data to archive
      if (exportJob.includes.manifests) {
        await this.addManifestsToArchive(exportJob.tenant_id, archive);
      }

      if (exportJob.includes.verify_logs) {
        await this.addVerifyLogsToArchive(exportJob.tenant_id, archive);
      }

      if (exportJob.includes.invoices) {
        await this.addInvoicesToArchive(exportJob.tenant_id, archive);
      }

      if (exportJob.includes.compliance_reports) {
        await this.addComplianceReportsToArchive(exportJob.tenant_id, archive);
      }

      if (exportJob.includes.usage_data) {
        await this.addUsageDataToArchive(exportJob.tenant_id, archive);
      }

      // Add metadata
      await this.addExportMetadata(exportJob, archive);

      await archive.finalize();

      // Wait for archive to complete
      await new Promise((resolve, reject) => {
        output.on('close', resolve);
        archive.on('error', reject);
      });

      // Get file size
      const archiveStats = await stat(archivePath);
      const fileSizeGb = archiveStats.size / (1024 * 1024 * 1024);

      if (fileSizeGb > this.config.maxExportSizeGb) {
        throw new Error(`Export size (${fileSizeGb.toFixed(2)}GB) exceeds maximum allowed size (${this.config.maxExportSizeGb}GB)`);
      }

      // Update export job
      exportJob.status = 'ready';
      exportJob.download_url = `/exports/${exportJob.export_id}/download`;
      exportJob.file_size = archiveStats.size;
      await this.storeExportJob(exportJob);

      return exportJob.download_url;
    } catch (error) {
      // Update export job with error status
      exportJob.status = 'expired'; // Use expired to indicate failure
      await this.storeExportJob(exportJob);
      throw new Error(`Failed to process export job: ${error}`);
    }
  }

  /**
   * Get export job
   */
  async getExportJob(exportId: string): Promise<TenantExport | null> {
    try {
      const data = await this.redis.get(`export:${exportId}`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      throw new Error(`Failed to get export job: ${error}`);
    }
  }

  /**
   * Get export file stream for download
   */
  async getExportFileStream(exportId: string): Promise<NodeJS.ReadableStream> {
    try {
      const exportJob = await this.getExportJob(exportId);
      if (!exportJob) {
        throw new Error('Export job not found');
      }

      if (exportJob.status !== 'ready') {
        throw new Error('Export is not ready for download');
      }

      if (new Date() > new Date(exportJob.expires_at)) {
        throw new Error('Export has expired');
      }

      const exportDir = join(this.config.exportStoragePath, exportJob.export_id);
      const archivePath = join(exportDir, `tenant-${exportJob.tenant_id}-export.${exportJob.format}`);

      return createReadStream(archivePath);
    } catch (error) {
      throw new Error(`Failed to get export file stream: ${error}`);
    }
  }

  /**
   * Delete expired exports
   */
  async cleanupExpiredExports(): Promise<void> {
    try {
      const pattern = `export:*`;
      const keys = await this.redis.keys(pattern);

      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          const exportJob: TenantExport = JSON.parse(data);
          
          if (new Date() > new Date(exportJob.expires_at)) {
            // Delete export files
            await this.deleteExportFiles(exportJob.export_id);
            
            // Delete export job from Redis
            await this.redis.del(key);
          }
        }
      }
    } catch (error) {
      console.error('Failed to cleanup expired exports:', error);
    }
  }

  /**
   * Generate compliance report for tenant
   */
  async generateComplianceReport(tenantId: string, startDate: string, endDate: string): Promise<{
    tenant_id: string;
    report_period: { start: string; end: string };
    generated_at: string;
    summary: {
      total_sign_events: number;
      total_verify_events: number;
      total_manifests: number;
      total_invoices: number;
      total_revenue: number;
    };
    details: {
      usage_data: UsageWindow[];
      invoices: InvoiceLineItem[];
      manifests: Array<{ hash: string; created_at: string; size_bytes: number }>;
    };
  }> {
    try {
      const tenant = await this.getTenant(tenantId);
      if (!tenant) {
        throw new Error('Tenant not found');
      }

      // Get usage data for period
      const usagePattern = `usage:window:${tenantId}:*`;
      const usageKeys = await this.redis.keys(usagePattern);
      const usageData: UsageWindow[] = [];

      for (const key of usageKeys) {
        const data = await this.redis.get(key);
        if (data) {
          const window: UsageWindow = JSON.parse(data);
          if (window.window >= startDate && window.window <= endDate) {
            usageData.push(window);
          }
        }
      }

      // Get invoice data from Stripe
      const invoices = await this.stripe.invoices.list({
        customer: tenant.stripe_customer_id,
        created: {
          gte: Math.floor(new Date(startDate).getTime() / 1000),
          lte: Math.floor(new Date(endDate).getTime() / 1000),
        },
        status: 'paid',
      });

      const invoiceLineItems: InvoiceLineItem[] = [];
      let totalRevenue = 0;

      for (const invoice of invoices.data) {
        totalRevenue += invoice.amount_paid;
        
        for (const lineItem of invoice.lines.data) {
          invoiceLineItems.push({
            id: lineItem.id,
            description: lineItem.description || 'Unknown',
            quantity: lineItem.quantity || 0,
            unit_price: lineItem.amount || 0,
            amount: lineItem.amount || 0,
            period: {
              start: new Date(lineItem.period!.start * 1000).toISOString(),
              end: new Date(lineItem.period!.end * 1000).toISOString(),
            },
            proration: lineItem.proration || false,
          });
        }
      }

      // Get manifest data
      const manifests = await this.getTenantManifests(tenantId);

      // Calculate summary
      const summary = {
        total_sign_events: usageData.reduce((sum, window) => sum + window.sign_events, 0),
        total_verify_events: usageData.reduce((sum, window) => sum + window.verify_events, 0),
        total_manifests: manifests.length,
        total_invoices: invoices.data.length,
        total_revenue: totalRevenue / 100, // Convert from cents
      };

      return {
        tenant_id: tenantId,
        report_period: { start: startDate, end: endDate },
        generated_at: new Date().toISOString(),
        summary,
        details: {
          usage_data: usageData,
          invoices: invoiceLineItems,
          manifests,
        },
      };
    } catch (error) {
      throw new Error(`Failed to generate compliance report: ${error}`);
    }
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private async getTenant(tenantId: string): Promise<Tenant | null> {
    try {
      const data = await this.redis.get(`tenant:${tenantId}`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      throw new Error(`Failed to get tenant: ${error}`);
    }
  }

  private async storeTenant(tenant: Tenant): Promise<void> {
    await this.redis.setex(
      `tenant:${tenant.tenant_id}`,
      86400 * 30, // 30 days TTL
      JSON.stringify(tenant)
    );
  }

  private generateExportId(): string {
    return `export_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private async storeExportJob(exportJob: TenantExport): Promise<void> {
    await this.redis.setex(
      `export:${exportJob.export_id}`,
      86400 * 7, // 7 days TTL
      JSON.stringify(exportJob)
    );
  }

  private async createExportDirectory(exportId: string): Promise<string> {
    const exportDir = join(this.config.exportStoragePath, exportId);
    await mkdir(exportDir, { recursive: true });
    return exportDir;
  }

  private async addManifestsToArchive(tenantId: string, archive: archiver.Archiver): Promise<void> {
    try {
      // Get tenant's manifest directory
      const manifestDir = join(this.config.exportStoragePath, '..', 'assets', 'manifests', tenantId);
      
      try {
        const files = await readdir(manifestDir);
        
        for (const file of files) {
          if (file.endsWith('.c2pa')) {
            const filePath = join(manifestDir, file);
            archive.file(filePath, { name: `manifests/${file}` });
          }
        }
      } catch (error) {
        // Directory might not exist, which is fine
        console.log(`No manifest directory found for tenant ${tenantId}`);
      }

      // Add manifest index
      const manifestIndex = {
        tenant_id: tenantId,
        exported_at: new Date().toISOString(),
        total_manifests: 0,
      };

      archive.append(JSON.stringify(manifestIndex, null, 2), { name: 'manifests/index.json' });
    } catch (error) {
      console.error(`Failed to add manifests to archive: ${error}`);
    }
  }

  private async addVerifyLogsToArchive(tenantId: string, archive: archiver.Archiver): Promise<void> {
    try {
      // Get verification logs from Redis
      const pattern = `verify:log:${tenantId}:*`;
      const keys = await this.redis.keys(pattern);

      const logs: any[] = [];
      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          logs.push(JSON.parse(data));
        }
      }

      // Convert to NDJSON format
      const ndjsonLogs = logs.map(log => JSON.stringify(log)).join('\n');
      archive.append(ndjsonLogs, { name: 'verify_logs/verification_logs.ndjson' });

      // Add metadata
      const metadata = {
        tenant_id: tenantId,
        exported_at: new Date().toISOString(),
        total_logs: logs.length,
        format: 'ndjson',
      };

      archive.append(JSON.stringify(metadata, null, 2), { name: 'verify_logs/metadata.json' });
    } catch (error) {
      console.error(`Failed to add verify logs to archive: ${error}`);
    }
  }

  private async addInvoicesToArchive(tenantId: string, archive: archiver.Archiver): Promise<void> {
    try {
      const tenant = await this.getTenant(tenantId);
      if (!tenant) return;

      // Get invoices from Stripe
      const invoices = await this.stripe.invoices.list({
        customer: tenant.stripe_customer_id,
        limit: 100,
      });

      const invoiceData: any[] = [];
      for (const invoice of invoices.data) {
        invoiceData.push({
          id: invoice.id,
          created: new Date(invoice.created * 1000).toISOString(),
          status: invoice.status,
          amount_paid: invoice.amount_paid,
          currency: invoice.currency,
          hosted_invoice_url: invoice.hosted_invoice_url,
          invoice_pdf: invoice.invoice_pdf,
        });
      }

      archive.append(JSON.stringify(invoiceData, null, 2), { name: 'invoices/invoices.json' });

      // Add metadata
      const metadata = {
        tenant_id: tenantId,
        exported_at: new Date().toISOString(),
        total_invoices: invoiceData.length,
        total_amount: invoiceData.reduce((sum, inv) => sum + inv.amount_paid, 0),
      };

      archive.append(JSON.stringify(metadata, null, 2), { name: 'invoices/metadata.json' });
    } catch (error) {
      console.error(`Failed to add invoices to archive: ${error}`);
    }
  }

  private async addComplianceReportsToArchive(tenantId: string, archive: archiver.Archiver): Promise<void> {
    try {
      // Generate current compliance report
      const now = new Date();
      const startDate = new Date(now.getFullYear(), 0, 1).toISOString(); // Start of year
      const endDate = now.toISOString();

      const complianceReport = await this.generateComplianceReport(tenantId, startDate, endDate);
      
      archive.append(JSON.stringify(complianceReport, null, 2), { 
        name: `compliance_reports/compliance_report_${now.toISOString().split('T')[0]}.json` 
      });

      // Add metadata
      const metadata = {
        tenant_id: tenantId,
        exported_at: new Date().toISOString(),
        report_type: 'annual_compliance',
        generated_at: complianceReport.generated_at,
      };

      archive.append(JSON.stringify(metadata, null, 2), { name: 'compliance_reports/metadata.json' });
    } catch (error) {
      console.error(`Failed to add compliance reports to archive: ${error}`);
    }
  }

  private async addUsageDataToArchive(tenantId: string, archive: archiver.Archiver): Promise<void> {
    try {
      // Get usage windows
      const pattern = `usage:window:${tenantId}:*`;
      const keys = await this.redis.keys(pattern);

      const usageData: UsageWindow[] = [];
      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          usageData.push(JSON.parse(data));
        }
      }

      // Sort by date
      usageData.sort((a, b) => a.window.localeCompare(b.window));

      archive.append(JSON.stringify(usageData, null, 2), { name: 'usage_data/usage_windows.json' });

      // Add monthly aggregates
      const monthlyData = this.aggregateUsageByMonth(usageData);
      archive.append(JSON.stringify(monthlyData, null, 2), { name: 'usage_data/monthly_aggregates.json' });

      // Add metadata
      const metadata = {
        tenant_id: tenantId,
        exported_at: new Date().toISOString(),
        total_windows: usageData.length,
        date_range: {
          earliest: usageData.length > 0 ? usageData[0].window : null,
          latest: usageData.length > 0 ? usageData[usageData.length - 1].window : null,
        },
      };

      archive.append(JSON.stringify(metadata, null, 2), { name: 'usage_data/metadata.json' });
    } catch (error) {
      console.error(`Failed to add usage data to archive: ${error}`);
    }
  }

  private async addExportMetadata(exportJob: TenantExport, archive: archiver.Archiver): Promise<void> {
    const metadata = {
      export_id: exportJob.export_id,
      tenant_id: exportJob.tenant_id,
      created_at: exportJob.created_at,
      expires_at: exportJob.expires_at,
      format: exportJob.format,
      includes: exportJob.includes,
      version: '1.0',
      generated_by: 'C2PA Billing System v1.1.0',
    };

    archive.append(JSON.stringify(metadata, null, 2), { name: 'export_metadata.json' });
  }

  private async deleteExportFiles(exportId: string): Promise<void> {
    try {
      const exportDir = join(this.config.exportStoragePath, exportId);
      const files = await readdir(exportDir);

      for (const file of files) {
        await unlink(join(exportDir, file));
      }

      // Note: We don't delete the directory itself as it might be recreated
    } catch (error) {
      console.error(`Failed to delete export files for ${exportId}:`, error);
    }
  }

  private async getTenantManifests(tenantId: string): Promise<Array<{ hash: string; created_at: string; size_bytes: number }>> {
    // This would integrate with your manifest storage system
    // For now, return empty array
    return [];
  }

  private aggregateUsageByMonth(windows: UsageWindow[]): Array<{ month: string; sign_events: number; verify_events: number; rfc3161_timestamps: number }> {
    const monthlyMap = new Map<string, { sign_events: number; verify_events: number; rfc3161_timestamps: number }>();

    for (const window of windows) {
      const month = window.window.substring(0, 7); // YYYY-MM
      
      if (!monthlyMap.has(month)) {
        monthlyMap.set(month, { sign_events: 0, verify_events: 0, rfc3161_timestamps: 0 });
      }

      const monthly = monthlyMap.get(month)!;
      monthly.sign_events += window.sign_events;
      monthly.verify_events += window.verify_events;
      monthly.rfc3161_timestamps += window.rfc3161_timestamps;
    }

    return Array.from(monthlyMap.entries()).map(([month, usage]) => ({
      month,
      ...usage,
    }));
  }
}
