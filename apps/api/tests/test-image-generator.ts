/**
 * Test Image Generator
 * Creates valid test images for different formats
 */

import sharp from 'sharp';
import { writeFileSync } from 'fs';
import { join } from 'path';

async function generateTestImages() {
  const testFixturesDir = join(__dirname, '../../test-fixtures/images');
  
  // Create different sized and colored squares for better hash differentiation
  const images = [
    { name: 'test-image.jpg', width: 100, height: 100, color: { r: 255, g: 0, b: 0 } }, // Red
    { name: 'test-image.png', width: 150, height: 150, color: { r: 0, g: 255, b: 0 } }, // Green
    { name: 'test-image.webp', width: 120, height: 80, color: { r: 0, g: 0, b: 255 } }  // Blue
  ];
  
  for (const img of images) {
    const buffer = await sharp({
      create: {
        width: img.width,
        height: img.height,
        channels: 3,
        background: img.color
      }
    })
    .jpeg({ quality: 90 })
    .toBuffer();
    
    writeFileSync(join(testFixturesDir, img.name), buffer);
    console.log(`✅ Created ${img.name} (${img.width}x${img.height})`);
  }
  
  console.log('\n✅ All test images generated successfully!');
  console.log(`Location: ${testFixturesDir}`);
}

// Run if executed directly
if (require.main === module) {
  generateTestImages().catch(console.error);
}

export { generateTestImages };
