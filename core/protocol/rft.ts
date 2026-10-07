const MAX_SIZE = 163_840;
const MAX_CHUNKS = 512;

enum ByteState {
  ABSENT,
  PRESENT,
  CRC_OK,
  CRC_NOK,
}

enum CrcState {
  ABSENT,
  PRESENT,
}

export class RftPipe {
  data = new Uint8Array(MAX_SIZE);
  dataState = new Array<ByteState>(MAX_SIZE);
  crc = new Uint16Array(MAX_CHUNKS);
  crcState = new Array<CrcState>(MAX_CHUNKS);
  size: number = 0;
  bytesPresent: number = 0;
  fileId: number = 0;
  fileVersion: number = 0;
  crcPresent: boolean = false;
  // Result of the PNG analysis, or null if the file is not (yet) identified
  // as a PNG file.
  png: PngAnalysis | null = null;
  // True once the complete file has been handed over to the ODA that the
  // pipe belongs to.
  delivered: boolean = false;

  reset() {
    this.dataState.fill(ByteState.ABSENT);
    this.crcState.fill(CrcState.ABSENT);
    this.size = 0;
    this.fileId = 0;
    this.fileVersion = 0;
    this.crcPresent = false;
    this.png = null;
    this.delivered = false;
  }

  constructor() {
    this.reset();
  }

  addByte(offset: number, value: number) {
    this.data[offset] = value;
    this.dataState[offset] = ByteState.PRESENT;
  }

  /**
   * Updates the analysis of the data received so far. Meant to be called
   * once after a batch of addByte() calls, as it scans the whole file.
   *
   * @returns true if the file is complete.
   */
  update(): boolean {
    this.png = analyzePng(this.data, (i) => this.dataState[i] != ByteState.ABSENT, this.size);
    return this.isComplete();
  }

  addCrc(mode: number, chunkAddr: number, crc: number) {
    // TODO: Handle mode.
    this.crc[chunkAddr] = crc;
    this.crcState[chunkAddr] = CrcState.PRESENT;
  }

  isComplete(): boolean {
    if (this.size > 0) {
      let presentCount = 0;
      for (let a=0; a<this.size; a++) {
        if (this.dataState[a] != ByteState.ABSENT) {
          presentCount++;
        }
      }
      this.bytesPresent = presentCount;
      return presentCount == this.size;
    }
    return false;
  }

  getData(): Blob | null {
    if (this.isComplete()) {
      return new Blob([this.data.slice(0, this.size)]);
    } else {
      return null;
    }
  }
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

export enum PngChunkStatus {
  INCOMPLETE,  // Not all bytes of the chunk have been received yet.
  CRC_OK,
  CRC_ERROR,
}

export interface PngChunk {
  // Offset of the chunk (its length field) in the file.
  offset: number;
  // Length of the chunk's data field (excluding length, type and CRC).
  length: number;
  type: string;
  // Number of bytes of the chunk (including length, type and CRC) received.
  bytesPresent: number;
  status: PngChunkStatus;
}

export interface PngImageHeader {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  compressionMethod: number;
  filterMethod: number;
  interlaceMethod: number;
}

export interface PngAnalysis {
  chunks: PngChunk[];
  // Contents of the IHDR chunk, if received with a valid CRC.
  header: PngImageHeader | null;
  // True if the chunk list could be parsed up to the IEND chunk (some chunks
  // may still be incomplete).
  endReached: boolean;
  // Structural errors found so far.
  errors: string[];
  // True if all chunks up to IEND were received with a valid CRC, and no
  // errors were found.
  ok: boolean;
}

/**
 * Analyzes a possibly partially received PNG file. Returns null if the file
 * is not identified as a PNG file (or if its signature has not been received
 * yet).
 *
 * @param data The file's bytes.
 * @param isPresent Tells whether the byte at the given offset has been received.
 * @param size The file size, or 0 if not known.
 */
export function analyzePng(data: Uint8Array, isPresent: (i: number) => boolean, size: number): PngAnalysis | null {
  const limit = size > 0 ? Math.min(size, data.length) : data.length;
  const rangePresent = (start: number, len: number) => {
    for (let i = start; i < start + len; i++) {
      if (!isPresent(i)) return false;
    }
    return true;
  };

  if (limit < PNG_SIGNATURE.length || !rangePresent(0, PNG_SIGNATURE.length)) {
    return null;
  }
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (data[i] != PNG_SIGNATURE[i]) return null;
  }

  const result: PngAnalysis = {
    chunks: [], header: null, endReached: false, errors: [], ok: false,
  };

  let offset = PNG_SIGNATURE.length;
  // Since each chunk's length is known as soon as its header is received,
  // parsing can continue past incomplete chunks, until reaching a chunk whose
  // header (length and type) has not been received yet.
  while (offset + 8 <= limit && rangePresent(offset, 8)) {
    const length = readUint32(data, offset);
    const type = String.fromCharCode(...data.subarray(offset + 4, offset + 8));
    const totalLength = 12 + length;
    const end = offset + totalLength;

    if (end > limit) {
      result.errors.push(`Chunk ${type} at offset ${offset} extends beyond the end of the file`);
      result.chunks.push({
        offset, length, type, bytesPresent: 0, status: PngChunkStatus.INCOMPLETE,
      });
      break;
    }

    let bytesPresent = 0;
    for (let i = offset; i < end; i++) {
      if (isPresent(i)) bytesPresent++;
    }

    let status = PngChunkStatus.INCOMPLETE;
    if (bytesPresent == totalLength) {
      // The CRC covers the type and data fields.
      const crc = crc32(data.subarray(offset + 4, offset + 8 + length));
      status = crc == readUint32(data, offset + 8 + length) ?
        PngChunkStatus.CRC_OK : PngChunkStatus.CRC_ERROR;
    }
    result.chunks.push({ offset, length, type, bytesPresent, status });

    if (type == 'IHDR' && status == PngChunkStatus.CRC_OK && length >= 13) {
      const d = offset + 8;
      result.header = {
        width: readUint32(data, d),
        height: readUint32(data, d + 4),
        bitDepth: data[d + 8],
        colorType: data[d + 9],
        compressionMethod: data[d + 10],
        filterMethod: data[d + 11],
        interlaceMethod: data[d + 12],
      };
    }

    offset = end;
    if (type == 'IEND') break;
  }

  const last = result.chunks[result.chunks.length - 1];
  result.endReached = last != undefined && last.type == 'IEND';

  if (result.chunks.length > 0 && result.chunks[0].type != 'IHDR') {
    result.errors.push('The first chunk is not IHDR');
  }
  if (last != undefined && last.type == 'IEND' && size > 0 && offset < size) {
    result.errors.push(`${size - offset} extra byte(s) after the IEND chunk`);
  }
  for (const c of result.chunks) {
    if (c.status == PngChunkStatus.CRC_ERROR) {
      result.errors.push(`Invalid CRC in chunk ${c.type} at offset ${c.offset}`);
    }
  }

  result.ok = result.endReached && result.errors.length == 0 &&
    result.chunks.every(c => c.status == PngChunkStatus.CRC_OK);
  return result;
}

function readUint32(data: Uint8Array, offset: number): number {
  return ((data[offset] << 24) | (data[offset + 1] << 16) |
    (data[offset + 2] << 8) | data[offset + 3]) >>> 0;
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xFFFFFFFF;
  for (const b of bytes) {
    c = CRC32_TABLE[(c ^ b) & 0xFF] ^ (c >>> 8);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}
