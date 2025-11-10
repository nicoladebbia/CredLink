import { readFileSync } from 'fs';
import { resolve } from 'path';
import { load as yamlLoad } from 'js-yaml';
import { HostilePathMatrix } from './types.js';

export function loadMatrix(matrixPath: string): HostilePathMatrix {
  try {
    const content = readFileSync(resolve(matrixPath), 'utf8');
    const matrix = yamlLoad(content) as HostilePathMatrix;
    
    if (!matrix.version || !matrix.scenarios) {
      throw new Error('Invalid matrix format: missing version or scenarios');
    }
    
    if (matrix.scenarios.length < 12) {
      throw new Error(`Phase 0 requires at least 12 scenarios, got ${matrix.scenarios.length}`);
    }
    
    return matrix;
  } catch (error) {
    throw new Error(`Failed to load matrix from ${matrixPath}: ${error}`);
  }
}
