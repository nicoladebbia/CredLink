import { MetadataEmbedder } from '../src/services/metadata-embedder';
import { MetadataExtractor } from '../src/services/metadata-extractor';
import { ManifestBuilder } from '../src/services/manifest-builder';
import sharp from 'sharp';

describe('EXIF Embedding Debug', () => {
  it('should embed and extract EXIF immediately', async () => {
    console.log('\n=== EXIF Embedding Debug Test ===\n');

    // Create a simple test image
    const testImage = await sharp({
      create: {
        width: 200,
        height: 200,
        channels: 3,
        background: { r: 255, g: 0, b: 0 }
      }
    }).jpeg().toBuffer();

    console.log('1. Created test image:', testImage.length, 'bytes\n');

    const embedder = new MetadataEmbedder();
    const extractor = new MetadataExtractor();
    const manifestBuilder = new ManifestBuilder();

    const testProofUri = 'https://proofs.credlink.com/debug-test';

    // Build manifest
    const testManifest = await manifestBuilder.build({
      title: 'Debug Test',
      creator: 'Test',
      timestamp: new Date().toISOString(),
      imageHash: 'sha256:debug-hash',
      imageBuffer: testImage
    });

    console.log('2. Built manifest\n');

    // Embed metadata
    console.log('3. Embedding metadata with proof URI:', testProofUri);
    const embedded = await embedder.embedProofInImage(testImage, testManifest, testProofUri);
    console.log('   Embedded image size:', embedded.length, 'bytes\n');

    // Check what EXIF data is actually in the embedded image
    console.log('4. Checking EXIF data in embedded image:');
    const metadata = await sharp(embedded).metadata();
    console.log('   Has EXIF?', !!metadata.exif);
    if (metadata.exif) {
      console.log('   EXIF buffer size:', metadata.exif.length, 'bytes');

      // Try to parse EXIF to see what fields are present
      const exifParser = require('exif-parser');
      try {
        const parser = exifParser.create(metadata.exif);
        const result = parser.parse();
        console.log('   EXIF tags:', JSON.stringify(result.tags, null, 2));
      } catch (e) {
        console.log('   EXIF parse error:', (e as Error).message);
      }
    }
    console.log();

    // Extract metadata immediately (no transformation)
    console.log('5. Extracting metadata (no transformation):');
    const result = await extractor.extract(embedded);
    console.log('   ProofUri:', result.proofUri);
    console.log('   Source:', result.source);
    console.log('   Confidence:', result.confidence);
    console.log('   Corrupted:', result.corrupted);
    console.log();

    if (result.proofUri === testProofUri) {
      console.log('✅ SUCCESS: Immediate extraction works!');
    } else {
      console.log('❌ FAILURE: Immediate extraction failed');
      console.log('   Expected:', testProofUri);
      console.log('   Received:', result.proofUri);
    }

    expect(result.proofUri).toBe(testProofUri);
  });
});
