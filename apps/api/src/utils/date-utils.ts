/**
 * Centralized Date Management Utility
 * Eliminates hardcoded dates throughout the CredLink codebase
 */

export class DateUtils {
  /**
   * Get current date in ISO format
   */
  static now(): string {
    return new Date().toISOString();
  }

  /**
   * Get current date in YYYY-MM-DD format
   */
  static today(): string {
    return new Date().toISOString().split('T')[0];
  }

  /**
   * Get formatted date for legal documents
   */
  static legalFormat(date?: Date): string {
    const targetDate = date || new Date();
    return targetDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  /**
   * Get next review date based on interval
   */
  static nextReviewDate(intervalMonths: number = 1): string {
    const date = new Date();
    date.setMonth(date.getMonth() + intervalMonths);
    return this.legalFormat(date);
  }

  /**
   * Get next review date for compliance (quarterly)
   */
  static nextQuarterlyReview(): string {
    const date = new Date();
    const currentMonth = date.getMonth();
    
    // Find next quarter start
    const nextQuarter = Math.floor((currentMonth + 3) / 3) * 3;
    date.setMonth(nextQuarter % 12);
    
    // If we moved to next year, increment year
    if (nextQuarter >= 12) {
      date.setFullYear(date.getFullYear() + 1);
    }
    
    return this.legalFormat(date);
  }

  /**
   * Get timestamp for API responses
   */
  static apiTimestamp(): string {
    return new Date().toISOString().replace('.000', '');
  }

  /**
   * Get relative time for examples
   */
  static exampleTimestamp(hoursAgo: number = 0): string {
    const date = new Date();
    date.setHours(date.getHours() - hoursAgo);
    return date.toISOString();
  }

  /**
   * Get future date for scheduling examples
   */
  static futureDate(daysFromNow: number): string {
    const date = new Date();
    date.setDate(date.getDate() + daysFromNow);
    return date.toISOString().split('T')[0];
  }

  /**
   * Get compliance pack generation date
   */
  static compliancePackDate(): string {
    return this.apiTimestamp();
  }

  /**
   * Get retention policy review date
   */
  static retentionReviewDate(): string {
    return this.nextReviewDate(1);
  }

  /**
   * Get AI Act effective date (fixed historical date)
   */
  static aiActEffectiveDate(): string {
    return '2024-08-01';
  }

  /**
   * Get template version date
   */
  static templateVersionDate(): string {
    return this.today();
  }

  /**
   * Get test execution date
   */
  static testExecutionDate(): string {
    return this.today();
  }

  /**
   * Get changelog version date
   */
  static changelogVersionDate(): string {
    return this.today();
  }

  /**
   * Format date for specific regions
   */
  static formatDateForRegion(date: Date, region: 'US' | 'EU' | 'UK' | 'BR'): string {
    switch (region) {
      case 'US':
        return date.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
      case 'EU':
        return date.toLocaleDateString('en-GB', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
      case 'UK':
        return date.toLocaleDateString('en-GB', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
      case 'BR':
        return date.toLocaleDateString('pt-BR', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
      default:
        return this.legalFormat(date);
    }
  }

  /**
   * Get dynamic date for API examples
   */
  static apiExampleDate(): string {
    return this.apiTimestamp();
  }

  /**
   * Get mock creation date for admin examples
   */
  static mockCreationDate(daysAgo: number = 10): string {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return date.toISOString().split('T')[0];
  }

  /**
   * Get system log timestamp
   */
  static systemLogTimestamp(): string {
    const date = new Date();
    return date.toISOString().replace('T', ' ').substring(0, 19);
  }
}

/**
 * Date constants for fixed historical dates - configurable via environment variables
 */
export const DATE_CONSTANTS = {
  AI_ACT_EFFECTIVE: process.env.AI_ACT_EFFECTIVE_DATE || '2024-08-01',
  DSA_EFFECTIVE: process.env.DSA_EFFECTIVE_DATE || '2024-02-17',
  UK_OSA_ROYAL_ASSENT: process.env.UK_OSA_ROYAL_ASSENT_DATE || '2023-10-26',
  LGPD_EFFECTIVE: process.env.LGPD_EFFECTIVE_DATE || '2020-08-14',
  FTC_GUIDELINES_UPDATE: '2023-06-29'
} as const;

/**
 * Template for dynamic date generation in markdown files
 */
export const DATE_TEMPLATES = {
  CURRENT_DATE: '{{CURRENT_DATE}}',
  NEXT_REVIEW: '{{NEXT_REVIEW}}',
  QUARTERLY_REVIEW: '{{QUARTERLY_REVIEW}}',
  API_TIMESTAMP: '{{API_TIMESTAMP}}',
  LEGAL_FORMAT: '{{LEGAL_FORMAT}}'
} as const;
