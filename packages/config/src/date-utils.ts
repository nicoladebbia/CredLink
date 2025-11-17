// ===========================================
// Date Utilities - Eliminate All Hardcoded Dates
// ===========================================

export class DateUtils {
  // ===========================================
  // Relative Date Generators
  // ===========================================
  
  static now(): Date {
    return new Date();
  }
  
  static nowISOString(): string {
    return new Date().toISOString();
  }
  
  static addDays(days: number): Date {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date;
  }
  
  static addMonths(months: number): Date {
    const date = new Date();
    date.setMonth(date.getMonth() + months);
    return date;
  }
  
  static addYears(years: number): Date {
    const date = new Date();
    date.setFullYear(date.getFullYear() + years);
    return date;
  }
  
  static addHours(hours: number): Date {
    const date = new Date();
    date.setHours(date.getHours() + hours);
    return date;
  }
  
  // ===========================================
  // Business Date Calculations
  // ===========================================
  
  static getApiSunsetDate(): string {
    // Sunset date configurable via environment, defaults to 1 year from now
    const sunsetMonths = parseInt(process.env.API_SUNSET_MONTHS || '12');
    return this.addMonths(sunsetMonths).toISOString().split('T')[0];
  }
  
  static getCertificateExpiryDate(years: number = 1): Date {
    return this.addYears(years);
  }
  
  static getPolicyWindowStartDate(): string {
    // Policy windows configurable, defaults to current date
    const startOffset = parseInt(process.env.POLICY_START_OFFSET_DAYS || '0');
    return this.addDays(startOffset).toISOString();
  }
  
  static getPolicyWindowEndDate(years: number = 1): string {
    const endYears = parseInt(process.env.POLICY_END_YEARS || String(years));
    return this.addYears(endYears).toISOString();
  }
  
  static getCompliancePurgeDate(years: number = 2): string {
    const purgeYears = parseInt(process.env.COMPLIANCE_PURGE_YEARS || String(years));
    return this.addYears(purgeYears).toISOString();
  }
  
  // ===========================================
  // Test Data Date Generators
  // ===========================================
  
  static getTestTimestamp(daysAgo: number = 0): string {
    return this.addDays(-daysAgo).toISOString();
  }
  
  static getTestDate(year: number, month: number, day: number): string {
    return new Date(year, month - 1, day).toISOString().split('T')[0];
  }
  
  static getTestDateTime(year: number, month: number, day: number, hour: number = 0, minute: number = 0): string {
    return new Date(year, month - 1, day, hour, minute).toISOString();
  }
  
  // ===========================================
  // Format Utilities
  // ===========================================
  
  static formatDate(date: Date, format: 'iso' | 'date' | 'datetime' = 'iso'): string {
    switch (format) {
      case 'date':
        return date.toISOString().split('T')[0];
      case 'datetime':
        return date.toISOString().replace('T', ' ').substring(0, 19);
      case 'iso':
      default:
        return date.toISOString();
    }
  }
  
  static formatTimestamp(date: Date): string {
    return date.toISOString();
  }
  
  // ===========================================
  // Validation Utilities
  // ===========================================
  
  static isValidDate(dateString: string): boolean {
    const date = new Date(dateString);
    return !isNaN(date.getTime());
  }
  
  static isFutureDate(dateString: string): boolean {
    const date = new Date(dateString);
    return date > new Date();
  }
  
  static isPastDate(dateString: string): boolean {
    const date = new Date(dateString);
    return date < new Date();
  }
  
  // ===========================================
  // Template Resolution
  // ===========================================
  
  static resolveDateTemplate(template: string, variables: Record<string, any> = {}): string {
    const dateVariables: Record<string, string> = {
      ...variables,
      NOW: this.nowISOString(),
      TODAY: this.formatDate(this.now(), 'date'),
      TOMORROW: this.formatDate(this.addDays(1), 'date'),
      NEXT_MONTH: this.formatDate(this.addMonths(1), 'date'),
      NEXT_YEAR: this.formatDate(this.addYears(1), 'date'),
      ONE_YEAR_FROM_NOW: this.formatDate(this.addYears(1), 'iso'),
      TWO_YEARS_FROM_NOW: this.formatDate(this.addYears(2), 'iso'),
    };
    
    return template.replace(/\{([A-Z_]+)\}/g, (match, key: string) => {
      return dateVariables[key] || match;
    });
  }
  
  // ===========================================
  // Environment-based Date Configuration
  // ===========================================
  
  static getEnvironmentDate(key: string, defaultValue?: Date): Date | null {
    const envValue = process.env[key];
    if (!envValue) return defaultValue || null;
    
    const date = new Date(envValue);
    return isNaN(date.getTime()) ? (defaultValue || null) : date;
  }
  
  static getEnvironmentDateString(key: string, defaultValue?: string): string | null {
    const envValue = process.env[key];
    if (!envValue) return defaultValue || null;
    
    const date = new Date(envValue);
    return isNaN(date.getTime()) ? (defaultValue || null) : date.toISOString();
  }
}

// ===========================================
// Date Constants (Configurable via Environment)
// ===========================================

export const DATE_CONSTANTS = {
  // API Configuration
  API_SUNSET_MONTHS: parseInt(process.env.API_SUNSET_MONTHS || '12'),
  
  // Certificate Configuration
  CERTIFICATE_VALIDITY_YEARS: parseInt(process.env.CERTIFICATE_VALIDITY_YEARS || '1'),
  
  // Policy Configuration
  POLICY_START_OFFSET_DAYS: parseInt(process.env.POLICY_START_OFFSET_DAYS || '0'),
  POLICY_END_YEARS: parseInt(process.env.POLICY_END_YEARS || '1'),
  
  // Compliance Configuration
  COMPLIANCE_PURGE_YEARS: parseInt(process.env.COMPLIANCE_PURGE_YEARS || '2'),
  
  // Test Configuration
  TEST_DATE_OFFSET_DAYS: parseInt(process.env.TEST_DATE_OFFSET_DAYS || '0'),
  
  // Time Periods (in milliseconds)
  ONE_DAY_MS: 24 * 60 * 60 * 1000,
  ONE_WEEK_MS: 7 * 24 * 60 * 60 * 1000,
  ONE_MONTH_MS: 30 * 24 * 60 * 60 * 1000,
  ONE_YEAR_MS: 365 * 24 * 60 * 60 * 1000,
};
