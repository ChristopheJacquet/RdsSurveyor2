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
import {FormsModule} from '@angular/forms';
import {MatRadioModule} from '@angular/material/radio';


import { RdsPipeline, RdsReportEvent, RdsReportEventType, RdsSource, SeekDirection } from "../../../../core/drivers/input";
import { Si470x } from "../../../../core/drivers/si470x";
import { RtlSdr } from "../../../../core/drivers/rtlsdr";
import { FileSource } from "../../../../core/drivers/file";
import { BitStreamSynchronizer } from "../../../../core/signals/bitstream";
import { Demodulator } from "../../../../core/signals/mpx";
import { GroupEvent, ReceiverEvent, ReceiverEventKind, StationChangeDetector } from "../../../../core/protocol/station_change";
import { Pref } from '../prefs';
import { catchError } from 'rxjs';

@Component({
  selector: 'app-input-pane',
  standalone: true,
  imports: [CommonModule, DecimalPipe, MatButtonModule, MatButtonToggleModule, MatIconModule, MatTabsModule, MatRadioModule, FormsModule],
  templateUrl: './input-pane.component.html',
  styleUrl: './input-pane.component.scss'
})
export class InputPaneComponent implements AfterViewInit, RdsPipeline  {
  @ViewChild('blerGraph') public blerGraph!: ElementRef;
  @ViewChild('constellationDiagram') public constellationDiagram!: ElementRef;
  @Output() groupReceived = new EventEmitter<ReceiverEvent>();
  isDragging = false;

  stationChangeDetector = new StationChangeDetector();
  private currentSource?: RdsSource;
  radioSources = [new Si470x(this), new RtlSdr(this)];
  selectedRadioSource?: RdsSource;
  fileSource = new FileSource(this);
  frequency: number = -1;
  logDirHandle: FileSystemDirectoryHandle | null = null;
  logFileStream: FileSystemWritableFileStream | null = null;
  synchronizer: BitStreamSynchronizer;
  demodulator: Demodulator;

  blerGraphCx: CanvasRenderingContext2D | null = null;
  blerGraphWidth: number = 0;
  blerGraphHeight: number = 0;

  constellationDiagramCx: CanvasRenderingContext2D | null = null;
  constellationDiagramWidth: number = 0;
  constellationDiagramHeight: number = 0;

  prefPlaybackSpeed = new Pref<string>("pref.playback_speed", "fast");
  prefTunedFrequency = new Pref<number>("pref.tuned_frequency", 100000);

  private snackBar = inject(MatSnackBar);

  constructor(private httpClient: HttpClient, private route: ActivatedRoute) {
    this.synchronizer = new BitStreamSynchronizer(this);
    this.demodulator = new Demodulator(this.synchronizer);
  }

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
    this.fileSource.realtimePlayback = this.prefPlaybackSpeed.value == "realtime";

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
            this.fileSource.setBlob(response);
            this.setSource(this.fileSource);
            this.fileSource.start();
          }
        });
    });
  }

  private setSource(source: RdsSource) {
    this.currentSource = source;
    // Clear constellation diagram.
    this.updateConstellationDiagram([], []);
  }

  private unsetSource() {
    this.currentSource = undefined;
  }

  get sourceActive(): boolean {
    return this.currentSource != undefined;
  }

  async emitGroup(stream: number, blocks: Uint16Array, ok: boolean[]) {
    this.updateBlerGraph(true, ok);

    const events = this.stationChangeDetector.processGroup(stream, blocks, ok);
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

  async processMpxSamples(samples: Float32Array) {
    for (let i=0; i<samples.length; i++) {
      this.demodulator.addSample(samples[i]);
    }
    this.updateConstellationDiagram(this.demodulator.syncOutI, this.demodulator.syncOutQ);
  }

  async processBits(bytes: Uint8Array) {
    this.synchronizer.addBits(bytes);
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
      this.fileSource.setBlob(f);
      this.setSource(this.fileSource);
      this.fileSource.start();
    }
  }

  onFileSelect(event: any) {
    this.handleFileDrop(event.target.files);
  }

  setPlaybackSpeed(event: any) {
    this.fileSource.realtimePlayback = event.value == "realtime";
    this.prefPlaybackSpeed.setValue(event.value);
  }

  async startSelectedRadioSource() {
    console.log(this.selectedRadioSource);

    if (this.selectedRadioSource == undefined) {
      return;
    }
    const success = await this.selectedRadioSource.start();
    if (!success) {
      console.log("Cannot start source " + this.selectedRadioSource.name);
      return;
    }
    this.setSource(this.selectedRadioSource);
    await this.selectedRadioSource.tune(this.prefTunedFrequency.value);
  }

  async stopSource() {
    if (this.currentSource == undefined) {
      return;
    }
    await this.currentSource.stop();
    this.unsetSource();
  }

  async processRdsReportEvent(event: RdsReportEvent) {
    if (event.type == RdsReportEventType.GROUP 
      && event.ok != undefined && event.blocks != undefined) {
      this.emitGroup(event.stream || 0, event.blocks, event.ok);
    }
    if (event.type == RdsReportEventType.UNSYNCED_GROUP_DURATION) {
      this.updateBlerGraph(false, []);
    }
  }

  reportFrequency(frequencyKhz: number) {
    this.prefTunedFrequency.setValue(frequencyKhz);
    this.frequency = frequencyKhz;
  }

  reportSourceEnd(): void {
    this.unsetSource();
  }

  seekUp() {
    if (this.currentSource != undefined) {
      this.currentSource.seek(SeekDirection.UP);
    }
  }
  
  seekDown() {
    if (this.currentSource != undefined) {
      this.currentSource.seek(SeekDirection.DOWN);
    }
  }

  tuneBy(frequencyDiff: number) {
    if (this.currentSource != undefined) {
      let newFreq = this.frequency + frequencyDiff;
      if(newFreq > 108000) newFreq = 87500;
      if(newFreq < 87500) newFreq = 108000;
      this.currentSource.tune(newFreq);
      this.frequency = newFreq;
      this.prefTunedFrequency.setValue(newFreq);
    }
  }

  tuneUp() {
    this.tuneBy(50);
  }

  tuneDown() {
    this.tuneBy(-50);
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
