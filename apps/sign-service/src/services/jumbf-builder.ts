/**
 * JUMBF (JPEG Universal Metadata Box Format) Builder
 * 
 * Implements JUMBF container format for C2PA metadata embedding
 * Follows ISO/IEC 19566-5 specification
 */

import * as crypto from 'crypto';

export interface JUMBFBox {
  type: string;
  label?: string;
  data: Buffer;
  requestable?: boolean;
}

export interface JUMBFContainer {
  boxes: JUMBFBox[];
  uuid: string;
}

export class JUMBFBuilder {
  private static readonly JUMBF_SIGNATURE = Buffer.from('jumb', 'ascii');
  private static readonly C2PA_UUID = '6332706100110010800000aa00389b71'; // C2PA UUID

  /**
   * Build a JUMBF container for C2PA manifest
   */
  async build(options: {
    type: string;
    label: string;
    data: Buffer;
    request?: string;
  }): Promise<Buffer> {
    const boxes: Buffer[] = [];

    // 1. Create Description Box (mandatory)
    const descriptionBox = this.createDescriptionBox({
      type: options.type,
      label: options.label,
      requestable: !!options.request
    });
    boxes.push(descriptionBox);

    // 2. Create Content Box (manifest data)
    const contentBox = this.createContentBox(options.data);
    boxes.push(contentBox);

    // 3. Create Request Box (proof URI) if provided
    if (options.request) {
      const requestBox = this.createRequestBox(options.request);
      boxes.push(requestBox);
    }

    // 4. Create Signature Box (placeholder for now)
    const signatureBox = this.createSignatureBox();
    boxes.push(signatureBox);

    // 5. Wrap in JUMBF container
    return this.wrapInContainer(boxes);
  }

  /**
   * Create JUMBF Description Box
   */
  private createDescriptionBox(options: {
    type: string;
    label: string;
    requestable: boolean;
  }): Buffer {
    const buffers: Buffer[] = [];

    // UUID for C2PA
    const uuid = Buffer.from(JUMBFBuilder.C2PA_UUID, 'hex');
    buffers.push(uuid);

    // Flags (1 byte)
    const flags = options.requestable ? 0x01 : 0x00;
    buffers.push(Buffer.from([flags]));

    // Label (null-terminated string)
    const label = Buffer.from(options.label + '\0', 'utf8');
    buffers.push(label);

    // Type (4 bytes)
    const type = Buffer.from(options.type.padEnd(4, ' '), 'ascii');
    buffers.push(type);

    const data = Buffer.concat(buffers);

    // Create box with length and type
    return this.createBox('jumd', data);
  }

  /**
   * Create JUMBF Content Box
   */
  private createContentBox(data: Buffer): Buffer {
    return this.createBox('json', data);
  }

  /**
   * Create JUMBF Request Box (for proof URI)
   */
  private createRequestBox(uri: string): Buffer {
    const data = Buffer.from(uri, 'utf8');
    return this.createBox('url ', data);
  }

  /**
   * Create JUMBF Signature Box
   */
  private createSignatureBox(): Buffer {
    // Placeholder signature box
    const signature = Buffer.from('CredLink-Signature-Placeholder', 'utf8');
    return this.createBox('sign', signature);
  }

  /**
   * Create a JUMBF box with length and type
   */
  private createBox(type: string, data: Buffer): Buffer {
    const typeBuffer = Buffer.from(type, 'ascii');
    
    // Length includes: 4 bytes (length) + 4 bytes (type) + data
    const length = 8 + data.length;
    const lengthBuffer = Buffer.alloc(4);
    lengthBuffer.writeUInt32BE(length, 0);

    return Buffer.concat([lengthBuffer, typeBuffer, data]);
  }

  /**
   * Wrap boxes in JUMBF container
   */
  private wrapInContainer(boxes: Buffer[]): Buffer {
    const data = Buffer.concat(boxes);
    
    // Create superbox
    const containerType = Buffer.from('jumb', 'ascii');
    const length = 8 + data.length;
    const lengthBuffer = Buffer.alloc(4);
    lengthBuffer.writeUInt32BE(length, 0);

    return Buffer.concat([lengthBuffer, containerType, data]);
  }

  /**
   * Parse JUMBF container from buffer
   */
  static parse(buffer: Buffer): JUMBFContainer | null {
    try {
      let offset = 0;
      const boxes: JUMBFBox[] = [];

      // Read container length and type
      const containerLength = buffer.readUInt32BE(offset);
      offset += 4;

      const containerType = buffer.toString('ascii', offset, offset + 4);
      offset += 4;

      if (containerType !== 'jumb') {
        return null;
      }

      // Parse boxes
      while (offset < containerLength) {
        const boxLength = buffer.readUInt32BE(offset);
        offset += 4;

        const boxType = buffer.toString('ascii', offset, offset + 4);
        offset += 4;

        const boxData = buffer.slice(offset, offset + boxLength - 8);
        offset += boxLength - 8;

        boxes.push({
          type: boxType.trim(),
          data: boxData
        });
      }

      return {
        boxes,
        uuid: JUMBFBuilder.C2PA_UUID
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Extract manifest data from JUMBF container
   */
  static extractManifest(container: JUMBFContainer): Buffer | null {
    const contentBox = container.boxes.find(box => box.type === 'json');
    return contentBox ? contentBox.data : null;
  }

  /**
   * Extract proof URI from JUMBF container
   */
  static extractProofUri(container: JUMBFContainer): string | null {
    const requestBox = container.boxes.find(box => box.type === 'url');
    return requestBox ? requestBox.data.toString('utf8') : null;
  }

  /**
   * Validate JUMBF container integrity
   */
  static validate(container: JUMBFContainer): boolean {
    // Must have at least description and content boxes
    const hasDescription = container.boxes.some(box => box.type === 'jumd');
    const hasContent = container.boxes.some(box => box.type === 'json');
    
    return hasDescription && hasContent;
  }

  /**
   * Calculate container size
   */
  static getContainerSize(container: JUMBFContainer): number {
    let size = 8; // Container header
    
    for (const box of container.boxes) {
      size += 8 + box.data.length; // Box header + data
    }
    
    return size;
  }
}
