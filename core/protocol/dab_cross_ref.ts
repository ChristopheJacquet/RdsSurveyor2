import { DabCrossRefApp } from "./base";
import { Oda } from "./rds_types";

export class DabCrossRefAppImpl implements Oda, DabCrossRefApp {
  ensembleTable: Array<EnsembleTableEntry> = new Array<EnsembleTableEntry>();

  getName(): string {
    return "DAB cross-reference";
  }

  enabled: boolean = false;

  reset(): void {
    this.ensembleTable = [];
    this.enabled = false;
  }

	addEnsemble(mode: number, frequency: number, eid: number): void {
    this.enabled = true;
    const freqKhz = frequency * 16;
    const modeS = modeString(mode);
    for (let e of this.ensembleTable) {
      if (e.mode == modeS && e.freqKhz == freqKhz && e.eid == eid) {
        return;
      }
    }
    this.ensembleTable.push(new EnsembleTableEntry(modeS, freqKhz, eid));
  }

	addServiceEnsembleInfo(eid: number, sid: number): void {
    console.log(`Eid: ${eid}, SId: ${sid}`);
    this.enabled = true;
  }

	addServiceLinkageInfo(linkageInfo: number, sid: number): void {
    console.log(`Linkage info: ${linkageInfo}, SId: ${sid}`);
    this.enabled = true;
  }
}

export class EnsembleTableEntry {
  constructor(
    public mode: string,
    public freqKhz: number,
    public eid: number) {};
}

function modeString(mode: number): string {
  switch (mode) {
    case 1: return "Mode I";
    case 2: return "Mode II or III";
    case 3: return "Mode IV";
    default: return "Unspecified mode";
  }
}
