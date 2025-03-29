import { RdsPipeline, RdsReportEventType, RdsSource, SeekDirection } from "./input";

export class FileSource implements RdsSource {
  public name = "File";
  public realtimePlayback: boolean = false;
  private blob?: Blob;
  private stoppingPlayback = true;

  constructor (private pipeline: RdsPipeline) {}

  seek(direction: SeekDirection): Promise<void> {
    throw new Error("Method not implemented.");
  }

  tune(frequencyKhz: number): Promise<void> {
    throw new Error("Method not implemented.");
  }

  public async start(): Promise<boolean> {
    if (this.blob == undefined) {
      throw new Error("file: Trying to play undefined blob.");
    }

    this.stoppingPlayback = false;
    const header = await this.blob.slice(0, 16).arrayBuffer();
    switch (guessFileType(new Uint8Array(header))) {
      case FileType.HEX_GROUPS: {
        const text = await this.blob.text();
        this.processTextualGroups(text);
        return true;
      }

      case FileType.UNSYNCED_BINARY_RDS: {
        const bytes = await this.blob.arrayBuffer();
        this.processBinaryGroups(new Uint8Array(bytes));
        return true;
      }

      case FileType.MPX_FLAC:
      case FileType.MPX_WAV: {
        const buffer = await this.blob.arrayBuffer();
        this.processMpx(buffer);
        return true;
      }
    }
    return false;
  }

  public async stop(): Promise<void> {
    this.stoppingPlayback = true;
  }

  public setBlob(blob: Blob): void {
    this.blob = blob;
  }

  async processTextualGroups(s: string) {
    //this.demodulator = null;
    //this.synchronizer = null;

    const timing = new Timing();
    for (let l of s.split('\n')) {
      l = l.split(/[@%]/)[0];
      const blocks = l.trim().split(' ');
      if (blocks.length != 4) {
        console.log("Unrecognized line: ", l);
        continue;
      }
      const bl: number[] = [];
      const ok: boolean[] = [];
      for (let i = 0; i<4; i++) {
        const [is_ok, val] = parseHexBlock(blocks[i]);
        bl.push(val);
        ok.push(is_ok);
          
      }
      this.pipeline.processRdsReportEvent({
        type: RdsReportEventType.GROUP,
        ok: ok,
        blocks: Uint16Array.from(bl),
        sourceInfo: "file"
      });
      if (this.stoppingPlayback) {
        return;
      }
      // Duration of a group (1000 ms / (1187.5/104)).
      await timing.enforceInterval(this.realtimePlayback ? (1000 / (1187.5/104)) : 0);
    }
    this.pipeline.reportSourceEnd();
  }

  async processBinaryGroups(data: Uint8Array) {
    let remainingLength = data.length;
    let pos = 0;

    const timing = new Timing();
    while (remainingLength > 0) {
      const l = Math.min(remainingLength, 8);
      const dataSlice = data.slice(pos, pos+l);
      pos += 8;
      remainingLength -= 8;
      this.pipeline.processBits(dataSlice);

      if (this.stoppingPlayback) {
        return;
      }
      // Duration of a slice of 8*8 bits.
      await timing.enforceInterval(this.realtimePlayback ? 1000 / (1187.5/(8*8)) : 0);
    }
    this.pipeline.reportSourceEnd();
  }

  async processMpx(buffer: ArrayBuffer) {
    const sampleRate = 250000;
    // Blocksize is chosen so that blockSize samples represent a bit less than
    // one group (so the UI is fluid). Since there are 11.4 groups per second,
    // we want sampleRate / blockSize to be 11.4, or a bit more. In addition,
    // we want blockSize to be a power of 2 (so that computing the modulo is
    // cheap). Therefore, it's the greatest power of 2 such that
    // sampleRate / blockSize >= 11.4.
    const blockSize = 16384;
    const delayBetweenBlocks = blockSize * 1000 / sampleRate;

    const context = new OfflineAudioContext(
      1,        // Number of channels.
      1000000,  // Length.
      sampleRate
    );
    
    const mpxBuffer = await context.decodeAudioData(buffer);
    const samples = mpxBuffer.getChannelData(0);
    const timing = new Timing();

    for (let i = 0; i < samples.length; i += blockSize) {
      const slice = samples.slice(i, Math.min(i + blockSize, samples.length));
      this.pipeline.processMpxSamples(slice);
      if (this.stoppingPlayback) {
        return;
      }
      await timing.enforceInterval(this.realtimePlayback ? delayBetweenBlocks : 0);
    }
    this.pipeline.reportSourceEnd();
  }
}

async function sleep(duration_msec: number) {
  return new Promise(resolve => setTimeout(resolve, duration_msec));
}

class Timing {
  lastTimestamp = 0;

  async enforceInterval(duration_msec: number) {
    if (this.lastTimestamp == 0) {
      this.lastTimestamp = Date.now();  // Milliseconds since epoch.
      return;
    }

    // If we're not actually waiting (duration_msec = 0), then ensure we don't
    // call sleep more than 10x per second (i.e. with intervals shorter than 100
    // ms). The purpose is to be fast when we need to.
    const timestamp = Date.now();

    if (duration_msec == 0 && timestamp - this.lastTimestamp < 100) {
      return;
    }

    const sleepDuration = this.lastTimestamp + duration_msec - timestamp;
    await sleep(sleepDuration > 0 ? sleepDuration : 0);
    this.lastTimestamp = Date.now();
  }
}

enum FileType {
  UNSYNCED_BINARY_RDS,
  HEX_GROUPS,
  MPX_FLAC,
  MPX_WAV,
}

function guessFileType(header: Uint8Array): FileType {
  if (
      header[0] == 0x52 &&   // R
      header[1] == 0x49 &&   // I
      header[2] == 0x46 &&   // F
      header[3] == 0x46 &&   // F
      header[8] == 0x57 &&   // W
      header[9] == 0x41 &&   // A
      header[10] == 0x56 &&  // V
      header[11] == 0x45 &&  // E
      header[12] == 0x66 &&  // f
      header[13] == 0x6D &&  // m
      header[14] == 0x74 &&  // t
      header[15] == 0x20) {  // ' '
    return FileType.MPX_WAV;
  }

  if (
      header[0] == 0x66 &&   // f
      header[1] == 0x4C &&   // L
      header[2] == 0x61 &&   // a
      header[3] == 0x43) {   // C
    return FileType.MPX_FLAC;
  }

  let binary = false;
  for (let i=0; i<header.length; i++) {
    const b = header[i];
    if (! ((b >= 32 && b<127) || b==10 || b==13)) {
      binary = true;
      break;
    }
  }

  if (binary) {
    return FileType.UNSYNCED_BINARY_RDS;
  } else {
    return FileType.HEX_GROUPS;
  }
}

function parseHexBlock(s: string): [boolean, number] {
  if (s.match(/^[0-9A-Z]{4}$/)) {
    const val = parseInt(s, 16);
    return [!Number.isNaN(val), val];
  }

  const m = s.match(/^(?<value>[0-9A-Z]{4})\/(?<errors>\d)$/);
  if (m) {
    const value = parseInt(m[1], 16);
    const errors = parseInt(m[2]);
    console.log(`With errors: ${value} / ${errors}`);
    return [errors == 0, value];
  }

  // Placeholder for any unrecognized block.
  return [false, 0];
}
