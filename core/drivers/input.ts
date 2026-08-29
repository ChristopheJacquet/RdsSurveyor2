export const UNCORRECTABLE_ERRORS = 6 as const;

export type ErrorCount = 0 | 1 | 2 | 3 | 4 | 5 | typeof UNCORRECTABLE_ERRORS;

export class Block {
  private readonly nominal?: void;
  // True unless the block is genuinely uncorrectable. GroupEvent further
  // narrows this (never widens it) based on the user's configured error
  // tolerance; it is the only signal most consumers should look at.
  public ok: boolean;

  constructor(public value: number, public errorCount: number) {
    this.ok = errorCount != UNCORRECTABLE_ERRORS;
  }

  toString(): string {
    return this.value.toString(16).toUpperCase().padStart(4, "0") + "/" + this.errorCount;
  }
}

export class Group {
  private readonly nominal?: void;
  constructor(public blocks: [Block, Block, Block, Block]) {
  }

  toString(): string {
    return this.blocks.join(" ");
  }
}

export class RdsReportEvent {
  public type: RdsReportEventType = RdsReportEventType.GROUP;
  public stream?: number = 0;
  public group?: Group;
  public sourceInfo!: string;
}

export enum RdsReportEventType {
  GROUP,
  UNSYNCED_GROUP_DURATION,
  INFO_REPORT
}

export interface RdsPipeline {
  processMpxSamples(samples: Float32Array, length?: number): void;
  processBits(bytes: Uint8Array): void;
  processRdsReportEvent(event: RdsReportEvent): void;
  // signalStrength is a floating-point number between 0 (min) and 1 (max).
  reportReceiverStatus(frequencyKhz: number, signalStrength: number, rdsSync: boolean): void;
  // Reports when the source "ended", i.e. completed the work (for example:
  // file playback complete).
  reportSourceEnd(): void;
}

export enum SeekDirection {
  UP,
  DOWN
}

export interface RdsSource {
  name: string;
  seek(direction: SeekDirection): Promise<void>;
  tune(frequencyKhz: number): Promise<void>;
  start(): Promise<boolean>;
  stop(): Promise<void>;
}


function parseHexBlock(s: string): Block {
  if (s.match(/^[0-9A-F]{4}$/)) {
    const value = parseInt(s, 16);
    return new Block(value, 0);
  }

  const m = s.match(/^(?<value>[0-9A-F]{4})\/(?<errors>\d)$/);
  if (m) {
    const value = parseInt(m[1], 16);
    const errorCount = Math.min(parseInt(m[2]), UNCORRECTABLE_ERRORS) as ErrorCount;
    console.log(`With errors: ${value} / ${errorCount}`);
    return new Block(value, errorCount);
  }

  // Placeholder for any unrecognized block.
  return new Block(0, UNCORRECTABLE_ERRORS);
}

export function parseHexGroup(l: string): RdsReportEvent | undefined {
  let stream = 0;

  // First, remove the optional timestamp on the right.
  l = l.split(/[@%]/)[0].trim();

  // Does it contain a stream marker?
  const m = l.match(/^#S(\d) /);
  if (m) {
    stream = Number.parseInt(m[1]);
    l = l.substring(4);
  }

  const blocks = l.trim().split(' ');
  if (blocks.length < 4) {
    console.log("Unrecognized line: ", l);
    return undefined;
  }
  const group: Group = new Group([
      parseHexBlock(blocks[0]),
      parseHexBlock(blocks[1]),
      parseHexBlock(blocks[2]),
      parseHexBlock(blocks[3])]);
  return {
    type: RdsReportEventType.GROUP,
    stream: stream,
    group: group,
    sourceInfo: "file"
  };
}
