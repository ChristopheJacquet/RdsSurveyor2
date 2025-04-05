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
