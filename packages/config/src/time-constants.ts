/**
 * Time Constants for CredLink Configuration
 * 
 * Provides base time units to avoid hardcoded calculations throughout the codebase.
 * These constants can be imported and multiplied to create specific intervals.
 */

export const TIME_CONSTANTS = {
  // Base time units in milliseconds
  SECOND_MS: 1000,
  MINUTE_MS: 60 * 1000,
  HOUR_MS: 60 * 60 * 1000,
  DAY_MS: 24 * 60 * 60 * 1000,
  WEEK_MS: 7 * 24 * 60 * 60 * 1000,
  MONTH_MS: 30 * 24 * 60 * 60 * 1000,
  YEAR_MS: 365 * 24 * 60 * 60 * 1000,

  // Common intervals
  FIVE_MINUTES_MS: 5 * 60 * 1000,
  TEN_MINUTES_MS: 10 * 60 * 1000,
  THIRTY_MINUTES_MS: 30 * 60 * 1000,
  ONE_HOUR_MS: 60 * 60 * 1000,
  TWO_HOURS_MS: 2 * 60 * 60 * 1000,
  SIX_HOURS_MS: 6 * 60 * 60 * 1000,
  TWELVE_HOURS_MS: 12 * 60 * 60 * 1000,
  TWENTY_FOUR_HOURS_MS: 24 * 60 * 60 * 1000,
  ONE_WEEK_MS: 7 * 24 * 60 * 60 * 1000,
  THIRTY_DAYS_MS: 30 * 24 * 60 * 60 * 1000,
  NINETY_DAYS_MS: 90 * 24 * 60 * 60 * 1000,
  ONE_YEAR_MS: 365 * 24 * 60 * 60 * 1000,
} as const;

// Helper functions for common calculations
export const TimeHelpers = {
  minutes: (minutes: number): number => minutes * TIME_CONSTANTS.MINUTE_MS,
  hours: (hours: number): number => hours * TIME_CONSTANTS.HOUR_MS,
  days: (days: number): number => days * TIME_CONSTANTS.DAY_MS,
  weeks: (weeks: number): number => weeks * TIME_CONSTANTS.WEEK_MS,
  months: (months: number): number => months * TIME_CONSTANTS.MONTH_MS,
  years: (years: number): number => years * TIME_CONSTANTS.YEAR_MS,
} as const;
