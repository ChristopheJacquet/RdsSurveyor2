import { ERtApp } from './base';
import { Oda, RdsString, RdsStringInUnicode, StationImpl } from './rds_types';

export class ERtAppImpl implements Oda, ERtApp {
  private station: StationImpl;
  public enabled: boolean = false;
  ert: RdsStringInUnicode = new RdsStringInUnicode(128);

  constructor(station: StationImpl) {
    this.station = station;
  }

  set utf8_encoding(utf8_enabled: boolean) {
    this.ert.encoding = utf8_enabled ? "utf-8" : "utf-16le";
  }

  getName(): string {
    throw new Error('Enhanced Radio Text');
  }

  reset() {
    this.enabled = false;
  }
}
