import { GROUP_0A, GROUP_0B, GROUP_10A, GROUP_14A, GROUP_2A, GROUP_2B, RdsStringHistoryEntry, RdsVariant, StationImpl, showInvisibleChars } from "./rds_types";

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
  public readonly groups: number[];

  public constructor(
    public message: string,
    groups: number | number[],
    public details: string="",
    public findingType: FindingType = FindingType.WARNING) {
    this.groups = ([] as number[]).concat(groups);
  }

  public toString() {
    return this.message;
  }

  public sameAs(f: Finding): boolean {
    return this.message == f.message &&
      this.groups.join() == f.groups.join();
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

const diagnostics = [
  badPiCode,
  usesDynamicPS,
  mixes2Aand2Bgroups,
  rtUses2BWith0A,
  rtFlagNotToggled,
  eonReferencesTunedStation,
  ptynIsStationName,
  ptynIsEmpty,
  rtHasTrailingSpaces,
  rtIsEmpty,
];

// Returns past RTs, plus the current one only if fully received (up to 0x0D,
// if any, otherwise up to the max number of segments).
// TODO: make RDSString.isComplete() work for both RT lengths, and take 0x0Ds
// into account. Then this can be simplified.
function completeRtHistory(station: StationImpl): RdsStringHistoryEntry[] {
  const entries = [...station.rt.history];
  const maxLength = station.rt.groupType == GROUP_2B ? 32 : 64;
  const current = station.rt.currentText.subarray(0, maxLength);
  const end = current.indexOf(0x0D);
  if (!station.rt.empty &&
      !current.subarray(0, end >= 0 ? end : maxLength).includes(0)) {
    entries.push(station.rt.getPastMessages(true)[0]);
  }
  return entries;
}

function badPiCode(station: StationImpl): Finding | null {
  if (station.pi == undefined || station.pi < 0) {
    return null;
  }

  const pi = station.pi;
  const piStr = pi.toString(16).toUpperCase().padStart(4, '0');
  const countryCode = pi >> 12;
  const areaCoverage = (pi >> 8) & 0xF;
  const refNumber = pi & 0xFF;

  if (countryCode == 0) {
    // PI is carried by all groups, so no specific group is reported.
    return new Finding(
      `Invalid PI code ${piStr} (country code 0)`,
      [],
      "The first nibble of the Programme Identification (PI) code is the " +
      "country code, which must be between 1 and F. Country code 0 is " +
      "not valid, neither for broadcast transmitters nor for low-power " +
      "short-range transmitting devices.",
      FindingType.ERROR);
  }

  // In RBDS, PI codes may be derived from call letters, so reference
  // number 00 is legitimate there.
  if (refNumber == 0 && station.variant == RdsVariant.RDS) {
    if (areaCoverage > 1) {
      return new Finding(
        `Invalid PI code ${piStr} (reference number 00)`,
        [],
        "The last two nibbles of the Programme Identification (PI) code " +
        "are the programme reference number. Value 00 is reserved for " +
        "low-power short-range transmitting devices, which in turn must " +
        "use 0 (no AF list) or 1 (AF list used) as the second nibble " +
        `(area coverage), not ${areaCoverage.toString(16).toUpperCase()}. ` +
        "Broadcast transmitters must use a reference number between 01 " +
        "and FF.",
        FindingType.ERROR);
    }
    return new Finding(
      `PI code ${piStr} is reserved for short-range devices`,
      [],
      "The Programme Identification (PI) code has a programme reference " +
      "number (last two nibbles) of 00. This value is reserved for " +
      "low-power short-range transmitting devices (e.g. in-car FM " +
      "transmitters), and is not to be used by fixed location " +
      "transmitters. Broadcast transmitters must use a reference number " +
      "between 01 and FF, assigned to identify the programme.",
      FindingType.ADVICE);
  }

  return null;
}

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
      [GROUP_2A, GROUP_2B],
      "While mixing 2A and 2B groups for different Radiotext (RT) messages " +
      "not prohibited by the standard, it might confuse some receivers " +
      "without having any concrete benefits. Unless you have a strong " +
      "reason to increase the repetition rate of PI, you should probably " +
      "just use 2A groups.",
      FindingType.ADVICE);
  }
  return null;
}

function rtUses2BWith0A(station: StationImpl): Finding | null {
  // Version B groups carry PI twice, for receivers that need a high PI
  // repetition rate. Transmitting PS in 0A shows this is not needed here.
  if (station.group_stats[GROUP_2B] > 5 && station.group_stats[GROUP_0A] >= 5) {
    return new Finding(
      "Radiotext in 2B groups while PS is in 0A groups",
      [GROUP_2B, GROUP_0A],
      "Radiotext (RT) is transmitted in 2B groups, which carry only 2 " +
      "characters each, because the third block repeats PI. Version B " +
      "groups are only useful when a high PI repetition rate is needed, " +
      "but PS is transmitted in 0A groups, which suggests it is not. " +
      "Using 2A groups instead would carry 4 characters per group, " +
      "transmitting RT twice as fast (or doubling its repetition rate) " +
      "for the same capacity, and allow messages up to 64 characters.",
      FindingType.ADVICE);
  }
  return null;
}

function rtFlagNotToggled(station: StationImpl): Finding | null {
  // Look at each change of message, and check whether the A/B flag was
  // toggled.
  const history = completeRtHistory(station).reverse();
  let changes = 0;
  let missedToggles = 0;
  let example: [RdsStringHistoryEntry, RdsStringHistoryEntry] | undefined;
  for (let i = 1; i < history.length; i++) {
    const prev = history[i-1];
    const cur = history[i];
    if (prev.abFlag == undefined || cur.abFlag == undefined) {
      continue;
    }
    changes++;
    if (prev.abFlag == cur.abFlag) {
      missedToggles++;
      example = [prev, cur];
    }
  }

  // Only report a sustained problem, because a single missed toggle may come
  // from a reception error.
  if (changes < 4 || missedToggles < 0.75 * changes || example == undefined) {
    return null;
  }

  const [prev, cur] = example;
  return new Finding(
    "Radiotext A/B flag not toggled on message changes",
    cur.groupType == GROUP_2B ? GROUP_2B : GROUP_2A,
    `In ${missedToggles} out of ${changes} Radiotext (RT) message ` +
    "changes, the A/B flag was not toggled. " +
    "The text A/B flag must be toggled whenever a new message is " +
    "transmitted, and must remain unchanged while the same message is " +
    "repeated. Receivers rely on it to clear their display and buffer " +
    "before receiving a new message. Otherwise, they may show a mix of " +
    "the old and new messages, in particular when the new message is " +
    "shorter than the old one. " +
    `Example: "${showInvisibleChars(prev)}" followed by ` +
    `"${showInvisibleChars(cur)}", both with flag ${cur.abFlag ? 'A' : 'B'}.`,
    FindingType.WARNING);
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
    // 16 segments of 4 (2A) or 2 (2B) characters.
    const isVersionA = entry.groupType != GROUP_2B;
    const maxLength = isVersionA ? 64 : 32;
    const charsPerSegment = isVersionA ? 4 : 2;
    const segmentsNeeded = (len: number) =>
      len >= maxLength ? 16 : Math.ceil((len + 1) / charsPerSegment);

    // Already cut at 0x0D. Slicing drops the unused half of the buffer in 2B.
    const rt = entry.message.slice(0, maxLength);
    return rt.length > 0 &&
      segmentsNeeded(rt.trimEnd().length) < segmentsNeeded(rt.length);
  };

  const padded = completeRtHistory(station).find(isPadded);
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
      "remaining segments need not be transmitted. " +
      `Example: "${showInvisibleChars(padded)}".`,
      FindingType.ADVICE);
  }
  return null;
}

function rtIsEmpty(station: StationImpl): Finding | null {
  const empty = completeRtHistory(station).find(entry =>
    // Slicing drops the unused half of the buffer in 2B.
    entry.message.slice(0, entry.groupType == GROUP_2B ? 32 : 64)
      .trim().length == 0);
  if (empty) {
    return new Finding(
      "Radiotext is empty",
      empty.groupType == GROUP_2B ? GROUP_2B : GROUP_2A,
      "Some Radiotext (RT) message is empty or only contains spaces. " +
      "This is a waste of transmission capacity. Either transmit a " +
      "meaningful RT, or stop transmitting 2A/2B groups.",
      FindingType.ADVICE);
  }
  return null;
}
