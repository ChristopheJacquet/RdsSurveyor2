import { Group } from "../drivers/input";

// Tuning state used for station change detection.
enum TuningState {
  INITIALIZING,
  TUNED,
  CONFIRMING,
}

export enum ReceiverEventKind { "GroupEvent", "NewStationEvent"};

export class GroupEvent {
  readonly kind = ReceiverEventKind.GroupEvent
  public stream: number;
  public group: Group;

  constructor(stream: number, group: Group, maxErrors: number) {
    this.stream = stream;
    this.group = group;
    // Single place where the user's configured error tolerance is applied:
    // narrow each block's "ok" flag, never widen it.
    for (const b of group.blocks) {
      if (b.errorCount > maxErrors) b.ok = false;
    }
  }

  public hexDump(): string {
    return this.hexDumpParts().map(
      (p) => p.text
    ).join(" ");
  }

  // Per-block breakdown of the hex dump, tagging blocks that were corrected
  // by error correction so the UI can highlight them.
  public hexDumpParts(): Array<{ text: string, correctedErrors: number }> {
    return this.group.blocks.map((b) => ({
      text: b.ok ? b.value.toString(16).toUpperCase().padStart(4, "0") : "----",
      correctedErrors: b.ok ? b.errorCount : 0,
    }));
  }
}

export class NewStationEvent {
  readonly kind = ReceiverEventKind.NewStationEvent;
  public pi: number;

  constructor(pi: number) {
    this.pi = pi;
  }
}

export type ReceiverEvent = GroupEvent | NewStationEvent;

export class StationChangeDetector {
  lastPi: number = -1;
  toBeConfirmedPi: number = -1;
  tuningState: TuningState = TuningState.INITIALIZING;
  pendingGroupEvents = Array<GroupEvent>();

  processGroup(stream: number, group: Group, maxErrors: number): Array<ReceiverEvent> {
    const result = new Array<ReceiverEvent>();
    const evt = new GroupEvent(stream, group, maxErrors);
    const piOk = group.blocks[0].ok;

    // Station change detection (for stream 0 groups; for other streams state
    // does not change).
    if (stream == 0 && piOk) {
      const pi = group.blocks[0].value;
      switch (this.tuningState) {
        case TuningState.INITIALIZING:
          this.lastPi = pi;
          this.tuningState = TuningState.TUNED;
          result.push(new NewStationEvent(pi));
          break;
        case TuningState.TUNED:
          if (pi != this.lastPi) {
            // If a new PI is detected, wait for confirmation, but already
            // flush any pending PI-less group, as we don't know if they belong
            // to the previous or the potential new station.
            this.tuningState = TuningState.CONFIRMING;
            this.pendingGroupEvents = [];
            this.toBeConfirmedPi = pi;
          }
          break;
        case TuningState.CONFIRMING:
          if (pi == this.toBeConfirmedPi) {
            // New station confirmed.
            this.lastPi = pi;
            this.tuningState = TuningState.TUNED;
            result.push(new NewStationEvent(pi));
          } else if (pi == this.lastPi) {
            // Back to original PI. Flush pending groups.
            this.tuningState = TuningState.TUNED;
            this.pendingGroupEvents = [];
          } else {
            // Yet another PI. Remain in CONFIRMING state but flush pending groups.
            this.toBeConfirmedPi = pi;
            this.pendingGroupEvents = [];
          }
          break;
      }
    }

    if (this.tuningState == TuningState.TUNED && piOk) {
      this.emitAllPendingEvents(result);
      result.push(evt);
    } else {
      this.pendingGroupEvents.push(evt);
    }

    return result;
  }

  private emitAllPendingEvents(result: Array<ReceiverEvent>) {
    for (let evt of this.pendingGroupEvents) {
      result.push(evt);
    }
    this.pendingGroupEvents = [];
  }
}
