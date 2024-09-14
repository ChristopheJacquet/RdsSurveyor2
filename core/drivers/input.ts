export class RdsReportEvent {
  public blocks?: Uint16Array;
  public ok?: boolean[];
  public freq!: number;
  public sourceInfo!: string;
}

export interface RdsReportEventListener {
  processRdsReportEvent(event: RdsReportEvent): void;
}
