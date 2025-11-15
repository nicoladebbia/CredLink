import sharp from 'sharp';

describe('Sharp EXIF Behavior', () => {
  it('should show what EXIF fields Sharp actually writes and reads', async () => {
    console.log('\n=== Sharp EXIF Debug ===\n');

    // Create a test image
    const testImage = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 255, g: 0, b: 0 }
      }
    }).jpeg().toBuffer();

    console.log('1. Original image created\n');

    // Embed EXIF using Sharp
    const embedded = await sharp(testImage)
      .withMetadata({
        exif: {
          IFD0: {
            ImageDescription: 'CredLink:https://test.com/proof',
            Software: 'CredLink/1.0',
            Copyright: 'C2PA Signed - 2025-11-11',
            Artist: 'Test Creator'
          }
        }
      })
      .jpeg({ quality: 95, mozjpeg: true })
      .toBuffer();

    console.log('2. Embedded EXIF metadata\n');

    // Read back the metadata
    const metadata = await sharp(embedded).metadata();
    console.log('3. Metadata from Sharp:');
    console.log('   format:', metadata.format);
    console.log('   width:', metadata.width);
    console.log('   height:', metadata.height);
    console.log('   hasEXIF:', !!metadata.exif);
    console.log();

    if (metadata.exif) {
      console.log('4. EXIF buffer exists, size:', metadata.exif.length, 'bytes');
      console.log();

      // Sharp also provides parsed EXIF in metadata object
      console.log('5. Checking what Sharp parsed:');
      const exif = metadata.exif as any;
      console.log('   Raw exif object keys:', Object.keys(exif));
      console.log('   exif object:', JSON.stringify(exif, null, 2));
      console.log();

      // Check specific fields
      console.log('6. Looking for our data:');
      console.log('   exif.ImageDescription:', exif.ImageDescription);
      console.log('   exif.Software:', exif.Software);
      console.log('   exif.Copyright:', exif.Copyright);
      console.log('   exif.Artist:', exif.Artist);
      console.log();

      // Check IFD0
      if (exif.IFD0) {
        console.log('7. IFD0 exists:');
        console.log('   IFD0:', JSON.stringify(exif.IFD0, null, 2));
      } else {
        console.log('7. No IFD0 in parsed EXIF');
      }
    } else {
      console.log('4. ❌ NO EXIF FOUND');
    }

    // Test if it survives a simple transformation
    console.log('\n8. Testing if EXIF survives .withMetadata() transformation:');
    const transformed = await sharp(embedded)
      .withMetadata()
      .jpeg({ quality: 80 })
      .toBuffer();

    const transformedMetadata = await sharp(transformed).metadata();
    console.log('   hasEXIF after transformation:', !!transformedMetadata.exif);
    if (transformedMetadata.exif) {
      const exif = transformedMetadata.exif as any;
      console.log('   ImageDescription:', exif.ImageDescription);
    }
  });
});
