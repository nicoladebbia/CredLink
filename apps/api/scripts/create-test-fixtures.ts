import sharp from 'sharp';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

async function createTestFixtures() {
  console.log('Creating test fixtures...');

  const fixturesDir = join(__dirname, '..', 'test-fixtures', 'images');
  mkdirSync(fixturesDir, { recursive: true });

  // Create test JPEG image (800x600, colorful gradient)
  const jpegBuffer = await sharp({
    create: {
      width: 800,
      height: 600,
      channels: 3,
      background: { r: 255, g: 100, b: 50 }
    }
  })
  .jpeg({ quality: 90 })
  .toBuffer();

  writeFileSync(join(fixturesDir, 'test-image.jpg'), jpegBuffer);
  console.log('✓ Created test-image.jpg (800x600)');

  // Create test PNG image (640x480, blue background)
  const pngBuffer = await sharp({
    create: {
      width: 640,
      height: 480,
      channels: 4,
      background: { r: 50, g: 100, b: 255, alpha: 1 }
    }
  })
  .png()
  .toBuffer();

  writeFileSync(join(fixturesDir, 'test-image.png'), pngBuffer);
  console.log('✓ Created test-image.png (640x480)');

  // Create smaller test image for performance tests
  const smallJpegBuffer = await sharp({
    create: {
      width: 200,
      height: 200,
      channels: 3,
      background: { r: 100, g: 200, b: 100 }
    }
  })
  .jpeg({ quality: 85 })
  .toBuffer();

  writeFileSync(join(fixturesDir, 'small-test.jpg'), smallJpegBuffer);
  console.log('✓ Created small-test.jpg (200x200)');

  // Create test WebP image (400x300)
  const webpBuffer = await sharp({
    create: {
      width: 400,
      height: 300,
      channels: 3,
      background: { r: 200, g: 100, b: 200 }
    }
  })
  .webp({ quality: 85 })
  .toBuffer();

  writeFileSync(join(fixturesDir, 'test-image.webp'), webpBuffer);
  console.log('✓ Created test-image.webp (400x300)');

  console.log('\nAll test fixtures created successfully!');
  console.log('Location:', fixturesDir);
}

createTestFixtures().catch(console.error);
