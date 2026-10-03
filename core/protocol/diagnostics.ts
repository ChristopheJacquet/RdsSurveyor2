import { GROUP_0A, GROUP_0B, GROUP_10A, GROUP_14A, GROUP_2A, GROUP_2B, StationImpl } from "./rds_types";

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

function multigroup(...groups: number[]): number {
  let result = 0;
  for (let g of groups) {
    result = (result<<5) | g;
  }
  return result;
}

export function performAllDiagnostics(station: StationImpl) {
  for (let diagnostic of diagnostics) {
    const finding = diagnostic(station);
    if (finding != null) {
      station.diagnostics.addFinding(finding);
    }
  }
}

const diagnostics = [
  usesDynamicPS,
  mixes2Aand2Bgroups,
  eonReferencesTunedStation,
  ptynIsStationName,
  ptynIsEmpty,
];

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
      "names.",
      FindingType.ERROR);
  }
  return null;
}

function mixes2Aand2Bgroups(station: StationImpl): Finding | null {
  if (station.group_stats[GROUP_2A] > 5 && station.group_stats[GROUP_2B] > 5) {
    return new Finding(
      "Mixing 2A and 2B groups",
      multigroup(GROUP_2A, GROUP_2B),
      "While mixing 2A and 2B groups for different Radiotext (RT) messages " +
      "not prohibited by the standard, it might confuse some receivers " +
      "without having any concrete benefits. Unless you have a strong " +
      "reason to increase the repetition rate of PI, you should probably " +
      "just use 2A groups.",
      FindingType.ADVICE);
  }
  return null;
}

function eonReferencesTunedStation(station: StationImpl): Finding | null {
  if (station.pi != undefined && station.pi >= 0 &&
      station.other_networks.has(station.pi)) {
    return new Finding(
      `EON information about the tuned network (PI ${station.pi.toString(16).toUpperCase().padStart(4, '0')})`,
      GROUP_14A,
      "Enhanced Other Networks (EON) groups are transmitted with the PI of " +
      "the tuned network. EON is meant to convey information about other " +
      "networks only: information about the tuned network itself must be " +
      "transmitted using the regular groups (e.g. 0A/0B for PS and AFs), " +
      "with the only exception of Linkage Information. This wastes " +
      "capacity and might confuse receivers.",
      FindingType.ERROR);
  }
  return null;
}

function ptynIsStationName(station: StationImpl): Finding | null {
  const ptyn = station.ptyn.getMostFrequentText();
  const stationName = station.ps.getMostFrequentText();

  if (ptyn.length < 8 || stationName.length < 8) {
    return null;
  }
  
  if (ptyn.trim() == stationName.trim()) {
    return new Finding(
      `PTYN is the station name ("${ptyn}")`,
      GROUP_10A,
      "Program Type Name (PTYN) is meant to refine the Program Type (PTY), " +
      "for example \"Football\" for PTY \"Sport\". It should not be used " +
      "to transmit the station's name, which is already conveyed by PS. " +
      "Receivers may display PTYN alongside or in place of the PTY label, " +
      "so a station name there is misleading, and this is a waste of " +
      "transmission capacity.",
      FindingType.WARNING);
  }
  return null;
}

function ptynIsEmpty(station: StationImpl): Finding | null {
  const ptyn = station.ptyn.getMostFrequentText();

  if (ptyn.length == 8 && ptyn.trim().length == 0) {
    return new Finding(
      "PTYN is empty",
      GROUP_10A,
      "Program Type Name (PTYN) is transmitted, but it only contains " +
      "spaces. This is a waste of transmission capacity. Either transmit " +
      "a meaningful PTYN that refines the Program Type (PTY), for example " +
      "\"Football\" for PTY \"Sport\", or stop transmitting 10A groups.",
      FindingType.WARNING);
  }
  return null;
}
