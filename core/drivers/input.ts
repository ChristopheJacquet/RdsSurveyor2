export class RdsReportEvent {
  public type: RdsReportEventType = RdsReportEventType.GROUP;
  public stream?: number = 0;
  public blocks?: Uint16Array;
  public ok?: boolean[];
  public sourceInfo!: string;
}

export enum RdsReportEventType {
  GROUP,
  UNSYNCED_GROUP_DURATION,
  INFO_REPORT
}

export interface RdsPipeline {
  processMpxSamples(samples: Float32Array): void;
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
  if (blocks.length != 4) {
    console.log("Unrecognized line: ", l);
    return undefined;
  }
  const bl: number[] = [];
  const ok: boolean[] = [];
  for (let i = 0; i<4; i++) {
    const [is_ok, val] = parseHexBlock(blocks[i]);
    bl.push(val);
    ok.push(is_ok);
  }
  return {
    type: RdsReportEventType.GROUP,
    stream: stream,
    ok: ok,
    blocks: Uint16Array.from(bl),
    sourceInfo: "file"
  };
}
