/**
 * Output encoding utilities to prevent XSS and injection attacks
 */

/**
 * Escape HTML special characters in strings
 */
export function escapeHtml(unsafe: string): string {
  if (typeof unsafe !== 'string') {
    return String(unsafe);
  }
  
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
    .replace(/\//g, "&#x2F;")
    .replace(/`/g, "&#x60;")
    .replace(/=/g, "&#x3D;");
}

/**
 * Sanitize user input for logging
 */
export function sanitizeForLogging(input: any): any {
  if (typeof input === 'string') {
    return input
      .replace(/[<>]/g, '')
      .replace(/javascript:/gi, '')
      .replace(/data:/gi, '')
      .substring(0, 200); // Limit length
  }
  
  if (typeof input === 'object' && input !== null) {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(input)) {
      // Remove potentially sensitive keys
      if (key.toLowerCase().includes('password') || 
          key.toLowerCase().includes('secret') ||
          key.toLowerCase().includes('token') ||
          key.toLowerCase().includes('key')) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = sanitizeForLogging(value);
      }
    }
    return sanitized;
  }
  
  return input;
}

/**
 * Create safe error messages that don't include user input
 */
export function createSafeError(message: string, userInput?: string): string {
  // Remove any potential user input from the message
  const safeMessage = message
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/data:/gi, '')
    .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[IP]')
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]')
    .replace(/\b(?:https?:\/\/)?(?:www\.)?[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:\/\S*)?\b/g, '[URL]');
  
  return safeMessage;
}

/**
 * Sanitize JSON responses
 */
export function sanitizeJsonResponse(data: any): any {
  if (typeof data === 'string') {
    return escapeHtml(data);
  }
  
  if (Array.isArray(data)) {
    return data.map(item => sanitizeJsonResponse(item));
  }
  
  if (typeof data === 'object' && data !== null) {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(data)) {
      const safeKey = escapeHtml(key);
      sanitized[safeKey] = sanitizeJsonResponse(value);
    }
    return sanitized;
  }
  
  return data;
}

/**
 * Validate and sanitize file names
 */
export function sanitizeFileName(fileName: string): string {
  return fileName
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\.\./g, '_')
    .replace(/^\.+/, '')
    .substring(0, 255);
}

/**
 * Remove potentially dangerous patterns from text
 */
export function removeDangerousPatterns(text: string): string {
  return text
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/data:(?!image\/)/gi, '')
    .replace(/vbscript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .replace(/expression\s*\(/gi, '');
}

/**
 * Create safe log entry
 */
export function createSafeLogEntry(level: string, message: string, meta: any = {}): any {
  return {
    level,
    message: createSafeError(message),
    meta: sanitizeForLogging(meta),
    timestamp: new Date().toISOString()
  };
}
