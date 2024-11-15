// Tuning state used for station change detection.
enum TuningState {
  INITIALIZING,
  TUNED,
  CONFIRMING,
}

export enum ReceiverEventKind { "GroupEvent", "NewStationEvent"};

export class GroupEvent {
  readonly kind = ReceiverEventKind.GroupEvent
  public blocks: Uint16Array;
  public ok: boolean[];

  constructor(blocks: Uint16Array, ok: boolean[]) {
    this.blocks = blocks;
    this.ok = ok;
  }

  public hexDump(): string {
    return [...this.blocks].map(
      (b, i) => this.ok[i] ? b.toString(16).toUpperCase().padStart(4, "0") : "----"
    ).join(" ");
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
  eventHandler: (event: ReceiverEvent) => Promise<void>;

  constructor(eventHandler: (event: ReceiverEvent) => Promise<void>) {
    this.eventHandler = eventHandler;
  }

  async processGroup(blocks: Uint16Array, ok: boolean[]) {
    // Station change detection.
    const pi = blocks[0];
    if (ok[0]) {
      switch (this.tuningState) {
        case TuningState.INITIALIZING:
          this.lastPi = pi;
          this.tuningState = TuningState.TUNED;
          await this.eventHandler(new NewStationEvent(pi));
          break;
        case TuningState.TUNED:
          if (pi != this.lastPi) {
            this.tuningState = TuningState.CONFIRMING;
            this.toBeConfirmedPi = pi;
          }
          break;
        case TuningState.CONFIRMING:
          if (pi == this.toBeConfirmedPi) {
            // New station confirmed.
            this.lastPi = pi;
            this.tuningState = TuningState.TUNED;
            await this.eventHandler(new NewStationEvent(pi));
            for (let evt of this.pendingGroupEvents) {
              this.eventHandler(evt);
            }
            this.pendingGroupEvents = [];
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

    const evt = new GroupEvent(blocks, ok);
    if (this.tuningState == TuningState.TUNED) {
      await this.eventHandler(evt);
    } else {
      this.pendingGroupEvents.push(evt);
    }
  }
}
