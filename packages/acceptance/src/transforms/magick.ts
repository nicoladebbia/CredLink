import sharp from 'sharp';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// Security: Allowed magick operations whitelist
const ALLOWED_OPERATIONS = [
  '-strip', '-quality', '-resize', '-webp', '-avif', 
  '-gravity', '-crop', '-interlace', '-rotate', 
  '-thumbnail', '-gravity', '-pointsize', '-fill', 
  '-undercolor', '-annotate', '-set'
];

// Security: Validate and sanitize magick arguments
function validateMagickArgs(args: string[]): void {
  for (const arg of args) {
    // Check for dangerous characters that could lead to command injection
    if (/[;&|`$(){}[\]<>]/.test(arg)) {
      throw new Error(`Dangerous character detected in argument: ${arg}`);
    }
    
    // Check if operation is in whitelist
    if (arg.startsWith('-') && !ALLOWED_OPERATIONS.includes(arg)) {
      throw new Error(`Operation not allowed: ${arg}`);
    }
    
    // Validate numeric arguments
    if (arg.match(/^\d+$/) && (parseInt(arg) < 0 || parseInt(arg) > 10000)) {
      throw new Error(`Numeric argument out of range: ${arg}`);
    }
  }
}

export async function magickTransform(inputBuffer: Buffer, args: string[]): Promise<Buffer> {
  try {
    // Security: Validate all arguments before execution
    validateMagickArgs(args);
    
    // For simple operations, use sharp for better performance
    if (args.length === 0) {
      return inputBuffer;
    }

    // Parse common operations
    if (args.includes('-strip')) {
      const image = sharp(inputBuffer);
      return await image.toBuffer(); // Remove withoutMetadata as it doesn't exist
    }

    if (args.includes('-resize')) {
      const resizeIndex = args.indexOf('-resize');
      const size = args[resizeIndex + 1];
      const image = sharp(inputBuffer);
      // Use object form to avoid TypeScript string issues
      if (size.includes('x')) {
        const [width, height] = size.split('x').map(s => s ? parseInt(s) : null);
        return await image.resize(width, height).toBuffer();
      } else if (size.includes('%')) {
        return await image.resize({ width: parseInt(size) }).toBuffer();
      } else {
        const dimension = parseInt(size);
        return await image.resize(dimension).toBuffer();
      }
    }

    if (args.includes('-quality')) {
      const qualityIndex = args.indexOf('-quality');
      const quality = parseInt(args[qualityIndex + 1]);
      if (quality < 0 || quality > 100) {
        throw new Error('Quality must be between 0 and 100');
      }
      const image = sharp(inputBuffer);
      return await image.jpeg({ quality }).toBuffer();
    }

    if (args.includes('webp')) {
      const image = sharp(inputBuffer);
      return await image.webp().toBuffer();
    }

    if (args.includes('avif')) {
      const image = sharp(inputBuffer);
      return await image.avif().toBuffer();
    }

    if (args.includes('-gravity') && args.includes('-crop')) {
      const gravityIndex = args.indexOf('-gravity');
      const gravity = args[gravityIndex + 1];
      const cropIndex = args.indexOf('-crop');
      const crop = args[cropIndex + 1];
      
      const image = sharp(inputBuffer);
      const metadata = await image.metadata();
      
      // Parse crop dimensions (e.g., "50%x50%")
      const [widthPercent, heightPercent] = crop.split('%').map(p => parseInt(p) / 100);
      const width = Math.floor((metadata.width || 0) * widthPercent);
      const height = Math.floor((metadata.height || 0) * heightPercent);
      
      return await image.extract({
        left: Math.floor((metadata.width || 0) - width) / 2,
        top: Math.floor((metadata.height || 0) - height) / 2,
        width,
        height
      }).toBuffer();
    }

    if (args.includes('-interlace') && args.includes('none')) {
      const image = sharp(inputBuffer);
      return await image.jpeg({ progressive: false }).toBuffer();
    }

    if (args.includes('-rotate')) {
      const rotateIndex = args.indexOf('-rotate');
      const angle = parseInt(args[rotateIndex + 1]);
      const image = sharp(inputBuffer);
      return await image.rotate(angle).toBuffer();
    }

    if (args.includes('-set')) {
      // For metadata operations, just return the original image with basic processing
      // In a real implementation, this would modify EXIF metadata
      const image = sharp(inputBuffer);
      return await image.jpeg().toBuffer();
    }

    if (args.includes('-thumbnail')) {
      const thumbnailIndex = args.indexOf('-thumbnail');
      const size = args[thumbnailIndex + 1];
      const image = sharp(inputBuffer);
      if (size.includes('x')) {
        const [width, height] = size.split('x').map(s => s ? parseInt(s) : null);
        return await image.resize(width, height).toBuffer();
      } else {
        const dimension = parseInt(size);
        return await image.resize(dimension).toBuffer();
      }
    }

    // Fallback to ImageMagick for complex operations with security constraints
    // Check which command is available (magick for IM7, convert for IM6)
    let magickCommand = 'magick';
    try {
      await execFileAsync('which', ['magick']);
    } catch {
      magickCommand = 'convert';
    }
    
    const { stdout } = await execFileAsync(magickCommand, [
      '-', ...args, '-'
    ], {
      encoding: null,
      timeout: 30000, // Security: 30 second timeout
      maxBuffer: 50 * 1024 * 1024 // Security: 50MB max buffer
    });
    
    return stdout;
  } catch (error) {
    throw new Error(`Magick transform failed: ${error}`);
  }
}
