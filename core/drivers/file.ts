import { FMDemodulator } from "../signals/iq";
import { RdsPipeline, RdsSource, SeekDirection, parseHexGroup } from "./input";

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

      case FileType.AUDIO_FLAC:
      case FileType.AUDIO_WAV: {
        const buffer = await this.blob.arrayBuffer();
        this.processAudio(buffer);
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
    const timing = new Timing();
    for (let l of s.split('\n')) {
      const event = parseHexGroup(l);
      if (event == undefined) {
        continue;
      }
      this.pipeline.processRdsReportEvent(event);
      if (this.stoppingPlayback) {
        return;
      }
      // Stream 0 groups (which are always present) set the cadence. Enforce
      // duration of a group (1000 ms / (1187.5/104)) each time a Stream 0
      // group is received.
      await timing.enforceInterval(
        this.realtimePlayback && event.stream == 0 ? (1000 / (1187.5/104)) : 0);
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

  async processAudio(buffer: ArrayBuffer) {
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
    
    const audioBuffer = await context.decodeAudioData(buffer);

    switch (audioBuffer.numberOfChannels) {
      case 1:
        console.log("Processing MPX file.");
        await this.processMpx(blockSize, delayBetweenBlocks, audioBuffer.getChannelData(0));
        break;

      case 2:
        console.log("Processing I/Q file.");
        await this.processIq(sampleRate, blockSize, delayBetweenBlocks, audioBuffer.getChannelData(0), audioBuffer.getChannelData(1));
        break;

      default:
        console.log(`Don't know what to do with ${audioBuffer.numberOfChannels}-channel audio file.`);
    }
    this.pipeline.reportSourceEnd();
  }

  async processMpx(blockSize: number, delayBetweenBlocks: number, samples: Float32Array) {
    const timing = new Timing();

    for (let i = 0; i < samples.length; i += blockSize) {
      const slice = samples.slice(i, Math.min(i + blockSize, samples.length));
      this.pipeline.processMpxSamples(slice);
      if (this.stoppingPlayback) {
        return;
      }
      await timing.enforceInterval(this.realtimePlayback ? delayBetweenBlocks : 0);
    }
  }

  async processIq(sampleRate: number, blockSize: number, delayBetweenBlocks: number,
                  samplesI: Float32Array, samplesQ: Float32Array) {
    const timing = new Timing();
    const demodulator = new FMDemodulator(MAX_FM_DEVIATION / sampleRate);
    const out = new Float32Array(blockSize);

    for (let i = 0; i < samplesI.length; i += blockSize) {
      const sliceI = samplesI.slice(i, Math.min(i + blockSize, samplesI.length));
      const sliceQ = samplesQ.slice(i, Math.min(i + blockSize, samplesQ.length));
      demodulator.demodulate(sliceI, sliceQ, out);
      this.pipeline.processMpxSamples(out, sliceI.length);
      if (this.stoppingPlayback) {
        return;
      }
      await timing.enforceInterval(this.realtimePlayback ? delayBetweenBlocks : 0);
    }
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
  AUDIO_FLAC,
  AUDIO_WAV,
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
    return FileType.AUDIO_WAV;
  }

  if (
      header[0] == 0x66 &&   // f
      header[1] == 0x4C &&   // L
      header[2] == 0x61 &&   // a
      header[3] == 0x43) {   // C
    return FileType.AUDIO_FLAC;
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

const MAX_FM_DEVIATION = 75_000;   // 75 kHz, as defined in FM broadcast standard.
