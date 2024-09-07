import { Station } from "./base";

export class StationImpl implements Station {
  pi?: number;
  pty?: number;
  ptyn: number[] = new Array<number>(8);
  tp?: boolean;
  ta?: boolean;
  ps: number[] = new Array<number>(8);
  lps: number[] = new Array<number>(16);
  rt: number[] = new Array<number>(64);
  odas: Map<number, number> = new Map<number, number>();
  app_mapping: Map<number, string> = new Map<number, string>();
  datetime: string = "";
  group_stats: number[] = new Array<number>(32);

  setClockTime(mjd: number, hour: number, minute: number, tz_sign: boolean, tz_offset: number) {
    if(mjd >= 15079) {
      // The formulas below are valid from 1 March 1900 (MJD 15079).
      const yp = Math.floor((mjd - 15078.2)/365.25);
      const mp = Math.floor( ( mjd - 14956.1 - Math.floor(yp * 365.25) ) / 30.6001 );
      const day = mjd - 14956 - Math.floor( yp * 365.25 ) - Math.floor( mp * 30.6001 );
      const k = (mp == 14 || mp == 15) ? 1 : 0;
      const year = 1900 + yp + k;
      const month = mp - 1 - k * 12;

      this.datetime = 
        `${padNumber(hour, 2)}:${padNumber(minute, 2)}` +
        (tz_sign ? '-' : '+') + `${tz_offset*30}min ` +
        `${padNumber(year, 4)}-${padNumber(month, 2)}-${padNumber(day, 2)}`;
      //console.log("CT " + datetime);
    } else {
      // Ignore earlier dates.
      //console.log("CT invalid");
    }
  }

  // TODO: Support RDS charset.
  getPS(): string {
    return String.fromCodePoint(...this.ps);
  }

  // TODO: Support RDS charset.
  getRT(): string {
    return String.fromCodePoint(...this.rt);
  }

  addToGroupStats(type: number): void {
    this.group_stats[type]++;
  }

  constructor() {
    this.reset();
  }

  /**
   * Reset station data. Used when tuning a different station.
   */
  reset() {
    this.pi = -1;
    this.pty = -1;
    this.ptyn.fill(0);
    this.tp = undefined;
    this.ta = undefined;
    this .ps.fill(0);
    this.lps.fill(0);
    this.rt.fill(0);
    this.odas.clear();
    this.app_mapping = new Map<number, string>([
      [0b00000, "group_0A"],
      [0b00001, "group_0B"],
      [0b00100, "group_2A"],
      [0b00101, "group_2B"],
      [0b01000, "group_4A"]]);
    this.datetime = "";
    this.group_stats.fill(0);
  }
}

function padNumber(num: number, width: number) {
  return num.toString().padStart(width, "0");
}
