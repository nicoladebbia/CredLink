import { Transform } from '../types.js';
import { magickTransform } from './magick.js';
import { simulateProxyTransform } from './simulate-proxy.js';
import { copyTransform } from './copy.js';

export async function applyTransform(
  inputBuffer: Buffer,
  transform: Transform
): Promise<Buffer> {
  switch (transform.tool) {
    case 'magick':
      return magickTransform(inputBuffer, transform.args);
    case 'simulate-proxy':
      return simulateProxyTransform(inputBuffer, transform.args);
    case 'copy':
      return copyTransform(inputBuffer, transform.args);
    default:
      throw new Error(`Unknown transform tool: ${transform.tool}`);
  }
}

export async function applyTransforms(
  inputBuffer: Buffer,
  transforms: Transform[]
): Promise<Buffer> {
  let buffer = inputBuffer;
  for (const transform of transforms) {
    buffer = await applyTransform(buffer, transform);
  }
  return buffer;
}
