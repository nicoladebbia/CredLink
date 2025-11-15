#!/usr/bin/env node

/**
 * Phase 20: Policy Engine & Assertions Builder - CLI Tool
 * Command-line interface for policy management and compilation
 */

import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { C2PAPolicyEngine } from './policy-engine.js';
import { templateRegistry } from './templates/template-registry.js';

// Simple YAML parser for demo purposes
// SECURITY: Hardened parser prevents injection and DoS attacks
const parseYaml = (content: string): any => {
  // SECURITY: Limit input size to prevent DoS attacks
  const MAX_INPUT_SIZE = 1024 * 1024; // 1MB
  if (content.length > MAX_INPUT_SIZE) {
    throw new Error('Input too large');
  }
  
  // SECURITY: Limit line count to prevent parsing attacks
  const MAX_LINES = 10000;
  const lines = content.split('\n');
  if (lines.length > MAX_LINES) {
    throw new Error('Too many lines');
  }
  
  const result: any = {};
  let current: any = result;
  const stack: any[] = [result];
  
  // SECURITY: Limit nesting depth to prevent stack overflow
  const MAX_DEPTH = 50;
  let currentDepth = 0;
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    
    // SECURITY: Prevent excessively long lines
    if (trimmed.length > 1000) {
      throw new Error('Line too long');
    }
    
    if (trimmed.includes(':')) {
      const [key, ...valueParts] = trimmed.split(':');
      const value = valueParts.join(':').trim();
      
      // SECURITY: Validate key format to prevent injection
      if (!/^[a-zA-Z0-9_-]+$/.test(key)) {
        throw new Error('Invalid key format');
      }
      
      if (value === '') {
        if (currentDepth >= MAX_DEPTH) {
          throw new Error('Nesting too deep');
        }
        current[key] = {};
        stack.push(current[key]);
        current = current[key];
        currentDepth++;
      } else if (value.startsWith('[') && value.endsWith(']')) {
        // SECURITY: Limit array size
        const arrayItems = value.slice(1, -1).split(',').map(v => v.trim().replace(/['"]/g, ''));
        if (arrayItems.length > 100) {
          throw new Error('Array too large');
        }
        current[key] = arrayItems;
      } else if (value === 'true' || value === 'false') {
        current[key] = value === 'true';
      } else if (/^\d+$/.test(value)) {
        // SECURITY: Limit number size
        const num = parseInt(value);
        if (num > Number.MAX_SAFE_INTEGER) {
          throw new Error('Number too large');
        }
        current[key] = num;
      } else {
        // SECURITY: Limit string length
        if (value.length > 500) {
          throw new Error('String value too long');
        }
        current[key] = value.replace(/['"]/g, '');
      }
    }
  }
  
  return result;
};

const stringifyYaml = (obj: any): string => {
  // Simple YAML stringifier for demo purposes
  return JSON.stringify(obj, null, 2);
};

// Mock Commander for demo purposes - simplified
const mockProgram = {
  name: () => mockProgram,
  description: () => mockProgram,
  version: () => mockProgram,
  command: () => mockProgram,
  argument: () => mockProgram,
  option: () => mockProgram,
  action: () => mockProgram,
  parse: () => {},
  configureOutput: () => {}
};

const policyEngine = new C2PAPolicyEngine();

// CLI would be implemented here in production
// For demo purposes, we just export the main functions
export { parseYaml, stringifyYaml, policyEngine, templateRegistry };

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});
