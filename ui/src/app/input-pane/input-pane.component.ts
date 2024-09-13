import { Component, EventEmitter, Output } from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatButtonToggleModule} from '@angular/material/button-toggle';
import {MatTabsModule} from '@angular/material/tabs';

import { RdsReportEvent, RdsReportEventListener } from "../../../../core/drivers/input";
import { Band, ChannelSpacing, Si470x, supportedDevices } from "../../../../core/drivers/si470x";

@Component({
  selector: 'app-input-pane',
  standalone: true,
  imports: [MatButtonModule, MatButtonToggleModule, MatTabsModule],
  templateUrl: './input-pane.component.html',
  styleUrl: './input-pane.component.scss'
})
export class InputPaneComponent implements RdsReportEventListener {
  @Output() groupReceived = new EventEmitter<GroupEvent | NewStationEvent>();
  isDragging = false;

  // For station change detection.
  lastPi: number = -1;
  toBeConfirmedPi: number = -1;
  tuningState: TuningState = TuningState.INITIALIZING;
  pendingGroupEvents = Array<GroupEvent>();
  realtimePlayback: boolean = false;
  dongle: Si470x | null = null;

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

  async processTextualGroups(s: string) {
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
      if (this.realtimePlayback) {
        await sleep(87);   // Duration of a group (1000 ms / (1187.5/104)).
      }
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

  async handleFileDrop(files: FileList) {
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

  setPlaybackSpeed(event: any) {
    this.realtimePlayback = event.value == "realtime";
  }

  sendDemoGroups() {
    this.processTextualGroups(
      `F201 0408 2037 2020
      F201 0409 383B 494E
      F201 040A 3D45 5445
      F201 040F 474E 5220`);
  }

  async connectSi470x() {
    if ("hid" in navigator) {
      console.log("WebHID API is supported.");
      const [device] = await navigator.hid.requestDevice({ filters: supportedDevices });
      console.log("Device", device);
  
      this.dongle = new Si470x(device, Band.BAND_87_108, ChannelSpacing.CHANNEL_SPACING_100_KHZ, this);
  
      await this.dongle.init();
      await this.dongle.tune(99900);
    }
  }

  processRdsReportEvent(event: RdsReportEvent): void {
    this.emitGroup(event.blocks, event.ok);
  }

  seekUp() {
    if (this.dongle != null) {
      this.dongle.seek(false, 1);
    }
  }
  
  seekDown() {
    if (this.dongle != null) {
      this.dongle.seek(false, 0);
    }
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

async function sleep(duration_msec: number) {
  return new Promise(resolve => setTimeout(resolve, duration_msec));
}
