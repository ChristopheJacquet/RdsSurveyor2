import { GROUP_0A, GROUP_0B, StationImpl } from "./rds_types";

export class Diagnostics {
  readonly findings = new Map<Finding, number>();

  public addFinding(f: Finding) {
    for (let [existingFinding, num] of this.findings) {
      if (existingFinding.sameAs(f)) {
        this.findings.set(existingFinding, num+1);
        return;
      }
    }

    this.findings.set(f, 1);
  }

  public reset() {
    this.findings.clear();
  }
}

export enum FindingType {
  ERROR,
  WARNING,
  ADVICE,
}

export class Finding {
  public constructor(
    public message: string,
    public group: number,
    public details: string="",
    public findingType: FindingType = FindingType.WARNING) {}

  public toString() {
    return this.message;
  }

  public sameAs(f: Finding): boolean {
    return this.group == f.group && this.message == f.message;
  }
}

export function performAllDiagnostics(station: StationImpl) {
  for (let diagnostic of diagnostics) {
    const finding = diagnostic(station);
    if (finding != null) {
      station.diagnostics.addFinding(finding);
    }
  }
}

const diagnostics = [usesDynamicPS];

function usesDynamicPS(station: StationImpl): Finding | null {
  if (station.usesDynamicPS()) {
    const group =
      station.group_stats[GROUP_0A] > station.group_stats[GROUP_0B]
        ? GROUP_0A
        : GROUP_0B;
    return new Finding(
      "Dynamic PS in use",
      group,
      "Dynamic PS is non-standard and should not be used. It may distract " +
      "drivers and corrupt the display of some receivers. Use Radiotext (RT) " +
      "instead to convey dynamic messages such as song titles and program " +
      "names.");
  }
  return null;
}
