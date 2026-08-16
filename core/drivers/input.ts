import { Block, Group, ErrorCount, UNCORRECTABLE_ERRORS } from "../protocol/rds_types";

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
  reportFrequency(frequencyKhz: number): void;
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
