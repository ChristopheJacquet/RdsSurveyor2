import { DecimalPipe } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { AfterViewInit, Component, ElementRef, EventEmitter, Output, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {MatButtonModule} from '@angular/material/button';
import {MatButtonToggleModule} from '@angular/material/button-toggle';
import {MatIconModule} from '@angular/material/icon';
import {MatSnackBar} from '@angular/material/snack-bar';
import {MatTabsModule} from '@angular/material/tabs';

import { RdsReportEvent, RdsReportEventListener, RdsReportEventType } from "../../../../core/drivers/input";
import { Band, ChannelSpacing, Si470x, supportedDevices } from "../../../../core/drivers/si470x";
import { BitStreamSynchronizer } from "../../../../core/signals/bitstream";
import { Demodulator } from "../../../../core/signals/mpx";
import { GroupEvent, ReceiverEvent, ReceiverEventKind, StationChangeDetector } from "../../../../core/protocol/station_change";
import { Pref } from '../prefs';
import { catchError } from 'rxjs';

@Component({
  selector: 'app-input-pane',
  standalone: true,
  imports: [CommonModule, DecimalPipe, MatButtonModule, MatButtonToggleModule, MatIconModule, MatTabsModule],
  templateUrl: './input-pane.component.html',
  styleUrl: './input-pane.component.scss'
})
export class InputPaneComponent implements AfterViewInit, RdsReportEventListener  {
  @ViewChild('blerGraph') public blerGraph!: ElementRef;
  @ViewChild('constellationDiagram') public constellationDiagram!: ElementRef;
  @Output() groupReceived = new EventEmitter<ReceiverEvent>();
  isDragging = false;

  stationChangeDetector = new StationChangeDetector();
  realtimePlayback: boolean = false;
  si470xDongle: Si470x | null = null;
  si470xActive = false;
  // True if any input source is active. Disable the others until it stops.
  inputActive = false;
  // Normally set to true, except during file playback. Set to true to request stopping playback.
  stoppingPlayback = true;
  frequency: number = -1;
  logDirHandle: FileSystemDirectoryHandle | null = null;
  logFileStream: FileSystemWritableFileStream | null = null;
  synchronizer: BitStreamSynchronizer | null = null;
  demodulator: Demodulator | null = null;

  blerGraphCx: CanvasRenderingContext2D | null = null;
  blerGraphWidth: number = 0;
  blerGraphHeight: number = 0;

  constellationDiagramCx: CanvasRenderingContext2D | null = null;
  constellationDiagramWidth: number = 0;
  constellationDiagramHeight: number = 0;

  prefPlaybackSpeed = new Pref<string>("pref.playback_speed", "fast");
  prefTunedFrequency = new Pref<number>("pref.tuned_frequency", 100000);

  private snackBar = inject(MatSnackBar);

  constructor(private httpClient: HttpClient, private route: ActivatedRoute) {}

  public ngAfterViewInit() {
    // Initialize block error rate graph.
    const blerGraphEl: HTMLCanvasElement = this.blerGraph.nativeElement;
    this.blerGraphCx = blerGraphEl.getContext('2d');
    this.blerGraphWidth = blerGraphEl.width;
    this.blerGraphHeight = blerGraphEl.height;

    if (this.blerGraphCx == null) {
      return;
    }
    this.blerGraphCx.fillStyle = "#aaa";
    this.blerGraphCx.fillRect(0, 0, this.blerGraphWidth, this.blerGraphHeight);

    // Initialize constellation diagram.
    const diagramEl: HTMLCanvasElement = this.constellationDiagram.nativeElement;
    this.constellationDiagramCx = diagramEl.getContext('2d');
    this.constellationDiagramWidth = diagramEl.width;
    this.constellationDiagramHeight = diagramEl.height;
    return this.constellationDiagramCx;
  }

  private async handleHttpError(error: HttpErrorResponse) {
    console.log(error);
    this.snackBar.open(
      `Unable to load RDS sample file from ${error.url}.`
      + 'The URL provided in the play_url parameter may be incorrect.',
      'Dismiss');
  }

  public ngOnInit() {
    this.prefPlaybackSpeed.init();
    this.realtimePlayback = this.prefPlaybackSpeed.value == "realtime";

    this.prefTunedFrequency.init();

    // If a play_url param is provided, try to load a file from the provided URL.
    const httpClient = this.httpClient;
    const sub = this.route.queryParams.subscribe(params => {
      if (!params['play_url']) {
        return;
      }
      const url = params["play_url"];

      httpClient.get(url, {responseType: 'blob'})
        .pipe(catchError(err => this.handleHttpError(err)))
        .subscribe(response => {
          if (response) {
            console.log("Contents", response);
            this.playbackBlob(response);
          }
        });
    });
  }

  async emitGroup(blocks: Uint16Array, ok: boolean[]) {
    this.updateBlerGraph(true, ok);

    const events = this.stationChangeDetector.processGroup(blocks, ok);
    for (let event of events) {
      switch (event.kind) {
        case ReceiverEventKind.NewStationEvent:
          await this.startNewLogFile(event.pi);
          break;
        
        case ReceiverEventKind.GroupEvent:
          await this.logGroupEvent(event);
          break;
      }
      this.groupReceived.emit(event);
    }
  }

  updateBlerGraph(synced: boolean, ok: boolean[]) {
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
      this.blerGraphCx.strokeStyle =
        synced ? (ok[i] ? "#8F8" : "#F88") : "#aaa";
      const y = (i+1)*this.blerGraphHeight/4;
      this.blerGraphCx.beginPath();
      this.blerGraphCx.moveTo(x, prevY);
      this.blerGraphCx.lineTo(x, y);
      this.blerGraphCx.stroke();
      prevY = y;
    }
  }

  updateConstellationDiagram(symbolsI: number[], symbolsQ: number[]) {
    if (this.constellationDiagramCx == null) {
      return;
    }

    this.constellationDiagramCx.clearRect(
      0, 0, this.constellationDiagramWidth, this.constellationDiagramHeight);
    
    const xC = this.constellationDiagramWidth / 2;
    const yC = this.constellationDiagramHeight / 2;
    
    this.constellationDiagramCx.strokeStyle = "#000";

    this.constellationDiagramCx.beginPath();
    this.constellationDiagramCx.moveTo(xC, 0);
    this.constellationDiagramCx.lineTo(xC, this.constellationDiagramHeight);
    this.constellationDiagramCx.stroke();

    this.constellationDiagramCx.beginPath();
    this.constellationDiagramCx.moveTo(0, yC);
    this.constellationDiagramCx.lineTo(this.constellationDiagramWidth, yC);
    this.constellationDiagramCx.stroke();

    let max = 0;
    for (let i = 0; i < symbolsI.length; i++) {
      max = Math.max(max, Math.abs(symbolsI[i]), Math.abs(symbolsQ[i]));
    }

    const scale = this.constellationDiagramWidth / 2 / max / 1.1;  // Add 10% margin.

    this.constellationDiagramCx.fillStyle = "#004";
    for (let i = 0; i < symbolsI.length; i++) {
      this.constellationDiagramCx.beginPath();
      this.constellationDiagramCx.arc(
        xC + symbolsI[i] * scale,
        yC + symbolsQ[i] * scale,
        2,
        0,
        2 * Math.PI
      );
      this.constellationDiagramCx.fill();
    }
  }

  async processTextualGroups(s: string) {
    this.demodulator = null;
    this.synchronizer = null;

    const timing = new Timing();
    for (let l of s.split('\n')) {
      l = l.split(/[@%]/)[0];
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
      if (this.stoppingPlayback) {
        return;
      }
      // Duration of a group (1000 ms / (1187.5/104)).
      await timing.enforceInterval(this.realtimePlayback ? 87 : 0);
    }
  }

  async processBinaryGroups(data: Uint8Array) {
    this.demodulator = null;
    this.synchronizer = new BitStreamSynchronizer(this);

    let remainingLength = data.length;
    let pos = 0;

    const timing = new Timing();
    while (remainingLength > 0) {
      const l = Math.min(remainingLength, 8);
      const dataSlice = data.slice(pos, pos+l);
      pos += 8;
      remainingLength -= 8;
      this.synchronizer.addBits(dataSlice);

      if (this.stoppingPlayback) {
        return;
      }
      // Duration of a slice of 8*8 bits.
      await timing.enforceInterval(this.realtimePlayback ? 1000 / (1187.5/(8*8)) : 0);
    }
  }

  async processMpx(buffer: ArrayBuffer) {
    const sampleRate = 250000;
    // Blocksize is chosen so that blockSize samples represent a bit less than
    // one group (so the UI is fluid). Since there are 11.4 groups per second,
    // we want sampleRate / blockSize to be 11.4, or a bit more. In addition,
    // we want blockSize to be a power of 2 (so that computing the modulo is
    // cheap). Therefore, it's the greatest power of 2 such that
    // sampleRate / blockSize >= 11.4.
    const blockSize = 16384;
    const delayBetweenBlocks = blockSize * 1000 / sampleRate;

    const context = new OfflineAudioContext(
      1,        // Number of channels.
      1000000,  // Length.
      sampleRate
    );
    const timing = new Timing();
    
    const mpxBuffer = await context.decodeAudioData(buffer);
    const samples = mpxBuffer.getChannelData(0);

    this.synchronizer = new BitStreamSynchronizer(this);
    this.demodulator = new Demodulator(this.synchronizer);

    for (let i=0; i<samples.length; i++) {
      this.demodulator.addSample(samples[i]);

      if (this.stoppingPlayback) {
        return;
      }

      if (i % blockSize == 0) {
        await timing.enforceInterval(this.realtimePlayback ? delayBetweenBlocks : 0);
        this.updateConstellationDiagram(this.demodulator.syncOutI, this.demodulator.syncOutQ);
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
    for (let f of Array.from(files)) {
      await this.playbackBlob(f);
    }
  }

  async playbackBlob(f: Blob) {
    if (this.inputActive) {
      // Don't play a file back if input is already active.
      return;
    }

    this.inputActive = true;
    this.stoppingPlayback = false;
    console.log(`inputActive: ${this.inputActive}, si470xActive: ${this.si470xActive}`);

    const header = await f.slice(0, 16).arrayBuffer();
    switch (guessFileType(new Uint8Array(header))) {
      case FileType.HEX_GROUPS: {
        const text = await f.text();
        await this.processTextualGroups(text);
        break;
      }

      case FileType.UNSYNCED_BINARY_RDS: {
        const bytes = await f.arrayBuffer();
        await this.processBinaryGroups(new Uint8Array(bytes));
        break;
      }

      case FileType.MPX_FLAC:
      case FileType.MPX_WAV: {
        const buffer = await f.arrayBuffer();
        await this.processMpx(buffer);
        break;
      }
    }

    this.inputActive = false;
    this.stoppingPlayback = true;
  }

  onFileSelect(event: any) {
    this.handleFileDrop(event.target.files);
  }

  setPlaybackSpeed(event: any) {
    this.realtimePlayback = event.value == "realtime";
    this.prefPlaybackSpeed.setValue(event.value);
  }

  stopPlayback() {
    this.stoppingPlayback = true;
  }

  sendDemoGroups() {
    this.processTextualGroups(
      `F201 0408 2037 2020
      F201 0409 383B 494E
      F201 040A 3D45 5445
      F201 040F 474E 5220`);
  }

  async connectOrCloseSi470x() {
    console.log(`inputActive: ${this.inputActive}, si470xActive: ${this.si470xActive}`);
    if (this.inputActive && !this.si470xActive) {
      console.log("Another input source is active, not connecting or deconnecting the Si470x dongle.");
      return;
    }

    if (this.si470xActive) {
      // Already running: close it.
      if (this.si470xDongle != null) {
        await this.si470xDongle.close();
      }
      this.si470xActive = false;
      this.inputActive = false;
      this.frequency = -1;
      return;
    }

    // If dongle not initialized yet, try to do so.
    if (this.si470xDongle == null && "hid" in navigator) {
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
  
      this.synchronizer = null;
      this.si470xDongle = new Si470x(device, Band.BAND_87_108, ChannelSpacing.CHANNEL_SPACING_100_KHZ, this);
    }

    if (this.si470xDongle != null) {
      await this.si470xDongle.init();
      await this.si470xDongle.tune(this.prefTunedFrequency.value);

      this.si470xActive = true;
      this.inputActive = true;
    }
  }

  async processRdsReportEvent(event: RdsReportEvent) {
    this.prefTunedFrequency.setValue(event.freq);
    this.frequency = event.freq;
    if (event.type == RdsReportEventType.GROUP 
      && event.ok != undefined && event.blocks != undefined) {
      this.emitGroup(event.blocks, event.ok);
    }
    if (event.type == RdsReportEventType.UNSYNCED_GROUP_DURATION) {
      this.updateBlerGraph(false, []);
    }
  }

  seekUp() {
    if (this.si470xDongle != null) {
      this.si470xDongle.seek(false, 1);
    }
  }
  
  seekDown() {
    if (this.si470xDongle != null) {
      this.si470xDongle.seek(false, 0);
    }
  }

  tuneBy(frequencyDiff: number) {
    if (this.si470xDongle != null) {
      let newFreq = this.frequency + frequencyDiff;
      if(newFreq > 108000) newFreq = 87500;
      if(newFreq < 87500) newFreq = 108000;
      this.si470xDongle.tune(newFreq);
      this.frequency = newFreq;
      this.prefTunedFrequency.setValue(newFreq);
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

    const date = new Date();
    const fileName = pi.toString(16).toUpperCase().padStart(4, '0')
      + ' ' + date.getFullYear().toString().padStart(4, '0')
      + '-' + (date.getMonth() + 1).toString().padStart(2, '0')
      + '-' + date.getDate().toString().padStart(2, '0')
      + ' ' + date.getHours().toString().padStart(2, '0')
      + '-' + date.getMinutes().toString().padStart(2, '0')
      + '-' + date.getSeconds().toString().padStart(2, '0')
      + '.txt'
    const logFileHandle = await this.logDirHandle.getFileHandle(fileName, { create: true });
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

async function sleep(duration_msec: number) {
  return new Promise(resolve => setTimeout(resolve, duration_msec));
}

class Timing {
  lastTimestamp = 0;

  async enforceInterval(duration_msec: number) {
    if (this.lastTimestamp == 0) {
      this.lastTimestamp = Date.now();  // Milliseconds since epoch.
      return;
    }

    // If we're not actually waiting (duration_msec = 0), then ensure we don't
    // call sleep more than 10x per second (i.e. with intervals shorter than 100
    // ms). The purpose is to be fast when we need to.
    const timestamp = Date.now();

    if (duration_msec == 0 && timestamp - this.lastTimestamp < 100) {
      return;
    }

    const sleepDuration = this.lastTimestamp + duration_msec - timestamp;
    await sleep(sleepDuration > 0 ? sleepDuration : 0);
    this.lastTimestamp = Date.now();
  }
}

enum FileType {
  UNSYNCED_BINARY_RDS,
  HEX_GROUPS,
  MPX_FLAC,
  MPX_WAV,
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
    return FileType.MPX_WAV;
  }

  if (
      header[0] == 0x66 &&   // f
      header[1] == 0x4C &&   // L
      header[2] == 0x61 &&   // a
      header[3] == 0x43) {   // C
    return FileType.MPX_FLAC;
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
