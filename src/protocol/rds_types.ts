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
  app_mapping: Map<number, string>;;

  // TODO: Support RDS charset.
  getPS(): string {
    return String.fromCodePoint(...this.ps);
  }

  // TODO: Support RDS charset.
  getRT(): string {
    return String.fromCodePoint(...this.rt);
  }

  constructor() {
    this.app_mapping = new Map<number, string>([
      [0b00000, "group_0A"],
      [0b00001, "group_0B"],
      [0b00100, "group_2A"],
      [0b00101, "group_2B"]]);
  }
}