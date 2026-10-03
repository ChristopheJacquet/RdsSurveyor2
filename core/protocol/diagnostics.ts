import { GROUP_0A, GROUP_0B, GROUP_10A, GROUP_14A, GROUP_2A, GROUP_2B, RdsStringHistoryEntry, StationImpl } from "./rds_types";

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
  rtHasTrailingSpaces,
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

function rtHasTrailingSpaces(station: StationImpl): Finding | null {
  const isPadded = (entry: RdsStringHistoryEntry) => {
    if (entry.groupType != GROUP_2A && entry.groupType != GROUP_2B) {
      return false;
    }
    // 16 segments of 4 (2A) or 2 (2B) characters.
    const isVersionA = entry.groupType == GROUP_2A;
    const maxLength = isVersionA ? 64 : 32;
    const charsPerSegment = isVersionA ? 4 : 2;
    const segmentsNeeded = (len: number) =>
      len >= maxLength ? 16 : Math.ceil((len + 1) / charsPerSegment);

    // Already cut at 0x0D. Slicing drops the unused half of the buffer in 2B.
    const rt = entry.message.slice(0, maxLength);
    return rt.length > 0 &&
      segmentsNeeded(rt.trimEnd().length) < segmentsNeeded(rt.length);
  };

  // Include the current text only if fully received (up to 0x0D, if any,
  // otherwise up to the max number of segments).
  // TODO: make RDSString.isComplete() work for both RT lengths, and take
  // 0x0Ds into account. Then we can essentially remove the following code.
  const entries = [...station.rt.history];
  const maxLength = station.rt.groupType == GROUP_2B ? 32 : 64;
  const current = station.rt.currentText.subarray(0, maxLength);
  const end = current.indexOf(0x0D);
  if (!station.rt.empty &&
      !current.subarray(0, end >= 0 ? end : maxLength).includes(0)) {
    entries.push(station.rt.getPastMessages(true)[0]);
  }

  const padded = entries.find(isPadded);
  if (padded) {
    const isVersionA = padded.groupType == GROUP_2A;
    return new Finding(
      "Radiotext padded with spaces",
      isVersionA ? GROUP_2A : GROUP_2B,
      "Radiotext (RT) is padded with trailing spaces, which needlessly " +
      "occupy RT segments. This is a waste of transmission capacity. " +
      "Messages shorter than the maximum length " +
      `(${isVersionA ? 64 : 32} characters) ` +
      "should be terminated by a carriage return (code 0x0D), and the " +
      "remaining segments need not be transmitted.",
      FindingType.ADVICE);
  }
  return null;
}
