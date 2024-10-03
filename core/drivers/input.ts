export class RdsReportEvent {
  public type: RdsReportEventType = RdsReportEventType.GROUP;
  public blocks?: Uint16Array;
  public ok?: boolean[];
  public freq!: number;
  public sourceInfo!: string;
}

export enum RdsReportEventType {
  GROUP,
  UNSYNCED_GROUP_DURATION,
  INFO_REPORT
}

export interface RdsReportEventListener {
  processRdsReportEvent(event: RdsReportEvent): void;
}
