import { DecimalPipe } from '@angular/common';
import { AfterViewInit, Component, ElementRef, EventEmitter, Output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import {MatButtonModule} from '@angular/material/button';
import {MatButtonToggleModule} from '@angular/material/button-toggle';
import {MatIconModule} from '@angular/material/icon'; 
import {MatTabsModule} from '@angular/material/tabs';

import { RdsReportEvent, RdsReportEventListener } from "../../../../core/drivers/input";
import { Band, ChannelSpacing, Si470x, supportedDevices } from "../../../../core/drivers/si470x";
import { BitStreamSynchronizer } from "../../../../core/signals/bitstream";
import { Demodulator } from "../../../../core/signals/baseband";

@Component({
  selector: 'app-input-pane',
  standalone: true,
  imports: [CommonModule, DecimalPipe, MatButtonModule, MatButtonToggleModule, MatIconModule, MatTabsModule],
  templateUrl: './input-pane.component.html',
  styleUrl: './input-pane.component.scss'
})
export class InputPaneComponent implements AfterViewInit, RdsReportEventListener  {
  @ViewChild('blerGraph') public blerGraph!: ElementRef;
  @Output() groupReceived = new EventEmitter<GroupEvent | NewStationEvent>();
  isDragging = false;

  // For station change detection.
  lastPi: number = -1;
  toBeConfirmedPi: number = -1;
  tuningState: TuningState = TuningState.INITIALIZING;
  pendingGroupEvents = Array<GroupEvent>();
  realtimePlayback: boolean = false;
  dongle: Si470x | null = null;
  frequency: number = -1;
  logDirHandle: FileSystemDirectoryHandle | null = null;
  logFileStream: FileSystemWritableFileStream | null = null;
  blerGraphCx: CanvasRenderingContext2D | null = null;
  blerGraphWidth: number = 0;
  blerGraphHeight: number = 0;
  synchronizer: BitStreamSynchronizer | null = null;

  public ngAfterViewInit() {
    const blerGraphEl: HTMLCanvasElement = this.blerGraph.nativeElement;
    this.blerGraphCx = blerGraphEl.getContext('2d');
    this.blerGraphWidth = blerGraphEl.width;
    this.blerGraphHeight = blerGraphEl.height;

    if (this.blerGraphCx == null) {
      return;
    }
    this.blerGraphCx.fillStyle = "black";
    this.blerGraphCx.fillRect(0, 0, this.blerGraphWidth, this.blerGraphHeight);
  }

  async emitGroup(blocks: Uint16Array, ok: boolean[]) {
    this.updateBlerGraph(ok);

    // Station change detection.
    const pi = blocks[0];
    if (ok[0]) {
      switch (this.tuningState) {
        case TuningState.INITIALIZING:
          this.lastPi = pi;
          this.tuningState = TuningState.TUNED;
          this.startNewLogFile(pi);
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
            await this.startNewLogFile(pi);
            this.groupReceived.emit(new NewStationEvent());
            for (let evt of this.pendingGroupEvents) {
              await this.logGroupEvent(evt);
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
      await this.logGroupEvent(evt);
      this.groupReceived.emit(evt);
    } else {
      this.pendingGroupEvents.push(evt);
    }
  }

  updateBlerGraph(ok: boolean[]) {
    if (this.blerGraphCx == null) {
      return;
    }

    // Scroll left.
    this.blerGraphCx.drawImage(
      this.blerGraphCx.canvas,
      1, 0, this.blerGraphWidth-1, this.blerGraphHeight,
      0, 0, this.blerGraphWidth-1, this.blerGraphHeight);
    
    // Draw line for new group.
    const x = this.blerGraphWidth-1;
    let prevY = 0;
    for (let i = 0; i < 4; i++) {
      this.blerGraphCx.strokeStyle = ok[i] ? "#8F8" : "#F88";
      const y = (i+1)*this.blerGraphHeight/4;
      this.blerGraphCx.beginPath();
      this.blerGraphCx.moveTo(x, prevY);
      this.blerGraphCx.lineTo(x, y);
      this.blerGraphCx.stroke();
      prevY = y;
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

  async processBinaryGroups(data: Uint8Array) {
    this.synchronizer = new BitStreamSynchronizer(this);
    let remainingLength = data.length;
    let pos = 0;
    while (remainingLength > 0) {
      const l = Math.min(remainingLength, 8);
      const dataSlice = data.slice(pos, pos+l);
      pos += 8;
      remainingLength -= 8;
      this.synchronizer.addBits(dataSlice);
      if (this.realtimePlayback) {
        await sleep(1000 / (1187.5/(8*8)));   // Duration of a slice of 8*8 bits.
      }
    }
  }

  async processBasebandWav(buffer: ArrayBuffer) {
    const context = new OfflineAudioContext(
      1,        // Number of channels.
      1000000,  // Length.
      250000    // Sample rate.
    );
    
    const basebandBuffer = await context.decodeAudioData(buffer);
    const samples = basebandBuffer.getChannelData(0);
    const demod = new Demodulator(this);
    for (let i=0; i<samples.length; i++) {
      demod.addSample(samples[i]);
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
    for (let f of Array.from(files)) {
      const header = await f.slice(0, 16).arrayBuffer();
      switch (guessFileType(new Uint8Array(header))) {
        case FileType.HEX_GROUPS: {
          const text = await f.text();
          this.processTextualGroups(text);
          break;
        }

        case FileType.UNSYNCED_BINARY_RDS: {
          const bytes = await f.arrayBuffer();
          this.processBinaryGroups(new Uint8Array(bytes));
          break;
        }

        case FileType.BASEBAND_WAV: {
          const buffer = await f.arrayBuffer();
          this.processBasebandWav(buffer);
          break;
        }
      }
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

      const devices = await navigator.hid.getDevices();
      let device: HIDDevice;
      if (devices.length == 1) {
        device = devices[0];
        console.log("Re-using previously selected device", device);
      } else {
        [device] = await navigator.hid.requestDevice({ filters: supportedDevices });
        console.log("Selected device", device);
      }
  
      this.dongle = new Si470x(device, Band.BAND_87_108, ChannelSpacing.CHANNEL_SPACING_100_KHZ, this);
  
      await this.dongle.init();
      await this.dongle.tune(99900);
    }
  }

  async processRdsReportEvent(event: RdsReportEvent) {
    this.frequency = event.freq;
    if (event.ok != undefined && event.blocks != undefined) {
      this.emitGroup(event.blocks, event.ok);
    }
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

  tuneBy(frequencyDiff: number) {
    if (this.dongle != null) {
      let newFreq = this.frequency + frequencyDiff;
      if(newFreq > 108000) newFreq = 87500;
      if(newFreq < 87500) newFreq = 108000;
      this.dongle.tune(newFreq);
      this.frequency = newFreq;
    }
  }

  tuneUp() {
    this.tuneBy(100);
  }

  tuneDown() {
    this.tuneBy(-100);
  }

  async selectLogDir() {
    if ('showDirectoryPicker' in self) {
      this.logDirHandle = await window.showDirectoryPicker();
      console.log(this.logDirHandle);
    }
  }

  async startNewLogFile(pi: number) {
    if (this.logDirHandle == null) {
      return;
    }

    if (this.logFileStream != null) {
      // Write out pending log data to the previous log file.
      this.logFileStream.close();
    }

    const logFileHandle = await this.logDirHandle.getFileHandle(pi.toString(16).toUpperCase().padStart(4, '0') + ' ' + Date.now() + '.txt', { create: true });
    this.logFileStream = await logFileHandle.createWritable();
    await this.logFileStream.write('% Log file\n');
  }

  async logGroupEvent(evt: GroupEvent) {
    if (this.logFileStream == null) {
      return;
    }

    let str = "";
    for (let i=0; i<4; i++) {
      str += evt.ok[i] ? evt.blocks[i].toString(16).toUpperCase().padStart(4, "0") + " " : "---- ";
    }

    await this.logFileStream.write(str + "\n");
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

enum FileType {
  UNSYNCED_BINARY_RDS,
  HEX_GROUPS,
  BASEBAND_WAV,
}

function guessFileType(header: Uint8Array): FileType {
  if (
    header[0] == 0x52 &&   // R
    header[1] == 0x49 &&   // I
    header[2] == 0x46 &&   // F
    header[3] == 0x46 &&   // F
    header[8] == 0x57 &&   // W
    header[9] == 0x41 &&   // A
    header[10] == 0x56 &&  // V
    header[11] == 0x45 &&  // E
    header[12] == 0x66 &&  // f
    header[13] == 0x6D &&  // m
    header[14] == 0x74 &&  // t
    header[15] == 0x20) {  // ' '
      return FileType.BASEBAND_WAV;
    }

  let binary = false;
  for (let i=0; i<header.length; i++) {
    const b = header[i];
    if (! ((b >= 32 && b<127) || b==10 || b==13)) {
      binary = true;
      break;
    }
  }

  if (binary) {
    return FileType.UNSYNCED_BINARY_RDS;
  } else {
    return FileType.HEX_GROUPS;
  }
}
