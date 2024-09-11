import { Component, EventEmitter, Output } from '@angular/core';

@Component({
  selector: 'app-input-pane',
  standalone: true,
  imports: [],
  templateUrl: './input-pane.component.html',
  styleUrl: './input-pane.component.scss'
})
export class InputPaneComponent {
  @Output() groupReceived = new EventEmitter<GroupEvent | NewStationEvent>();
  isDragging = false;

  // For station change detection.
  lastPi: number = -1;
  toBeConfirmedPi: number = -1;
  tuningState: TuningState = TuningState.INITIALIZING;
  pendingGroupEvents = Array<GroupEvent>();

  emitGroup(blocks: Uint16Array, ok: boolean[]) {
    // Station change detection.
    const pi = blocks[0];
    if (ok[0]) {
      switch (this.tuningState) {
        case TuningState.INITIALIZING:
          this.lastPi = pi;
          this.tuningState = TuningState.TUNED;
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
            this.tuningState = TuningState.TUNED;
            this.lastPi = pi;
            this.groupReceived.emit(new NewStationEvent());
            for (let evt of this.pendingGroupEvents) {
              this.groupReceived.emit(evt);
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
    if (this.tuningState != TuningState.CONFIRMING) {
      this.groupReceived.emit(evt);
    } else {
      this.pendingGroupEvents.push(evt);
    }
  }

  processTextualGroups(s: string) {
    for (let l of s.split('\n')) {
      l = l.split('@')[0];
      const blocks = l.trim().split(' ');
      if (blocks.length != 4) {
        console.log("Unrecognized line: ", l);
        continue;
      }
      const bl: number[] = [];
      const ok: boolean[] = [];
      for (let i = 0; i<4; i++) {
        const val = parseInt(blocks[i], 16);
        bl.push(val);
        ok.push(!Number.isNaN(val));
      }
      this.emitGroup(Uint16Array.from(bl), ok);
    }
  }

  onDrop(e: any) {
    e.preventDefault();
    e.stopPropagation();
    this.isDragging = false;
    this.handleFileDrop(e.dataTransfer.files);
  }

  onDragOver(event: any): void {
    event.preventDefault();
    this.isDragging = true;
  }

  stopDrag(event: any): void {
    this.isDragging = false;
    event.preventDefault();
    event.stopPropagation();
  }

  handleFileDrop(files: FileList) {
    const reader = new FileReader();
    reader.addEventListener(
      "load",
      () => {
        if (reader.result) {
          const contents = reader.result.toString();
          //console.log("contents", contents);
          this.processTextualGroups(contents);
        }
      },
      false);
    for (let f of Array.from(files)) {
      //console.log(f);
      reader.readAsText(f);
    }
  }

  onFileSelect(event: any) {
    this.handleFileDrop(event.target.files);
  }

  sendDemoGroups() {
    this.processTextualGroups(
      `F201 0408 2037 2020
      F201 0409 383B 494E
      F201 040A 3D45 5445
      F201 040F 474E 5220`);
  }
}

export class GroupEvent {
  public blocks: Uint16Array;
  public ok: boolean[];

  constructor(blocks: Uint16Array, ok: boolean[]) {
    this.blocks = blocks;
    this.ok = ok;
  }
}

export class NewStationEvent {
}

// Tuning state used for station change detection.
enum TuningState {
  INITIALIZING,
  TUNED,
  CONFIRMING,
}
