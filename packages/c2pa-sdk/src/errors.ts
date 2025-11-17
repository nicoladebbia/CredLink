/**
 * C2PA SDK Error Classes
 */

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class SigningError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = 'SigningError';
  }
}
