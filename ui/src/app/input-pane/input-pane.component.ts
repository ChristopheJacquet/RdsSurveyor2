import { DecimalPipe } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { Component, EventEmitter, Output, QueryList, ViewChild, ViewChildren, inject, ChangeDetectionStrategy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {MatButtonModule} from '@angular/material/button';
import {MatButtonToggleModule} from '@angular/material/button-toggle';
import {MatIconModule} from '@angular/material/icon';
import {MatSnackBar} from '@angular/material/snack-bar';
import {MatTabsModule} from '@angular/material/tabs';
import {FormsModule} from '@angular/forms';
import {MatRadioModule} from '@angular/material/radio';


import { Group, RdsPipeline, RdsReportEvent, RdsReportEventType, RdsSource, SeekDirection } from "../../../../core/drivers/input";
import { Si470x } from "../../../../core/drivers/si470x";
import { RtlSdr } from "../../../../core/drivers/rtlsdr";
import { FileSource } from "../../../../core/drivers/file";
import { BitStreamSynchronizer } from "../../../../core/signals/bitstream";
import { Demodulator, FREQ_STREAMS } from "../../../../core/signals/mpx";
import { GroupEvent, ReceiverEvent, ReceiverEventKind, StationChangeDetector } from "../../../../core/protocol/station_change";
import { Pref } from '../prefs';
import { catchError } from 'rxjs';
import { BlerGraphComponent } from "../bler-graph/bler-graph.component";
import { ConstellationDiagramComponent } from "../constellation-diagram/constellation-diagram.component";

@Component({
    selector: 'app-input-pane',
    imports: [CommonModule, DecimalPipe, MatButtonModule, MatButtonToggleModule, MatIconModule, MatTabsModule, MatRadioModule, FormsModule, BlerGraphComponent, ConstellationDiagramComponent],
    templateUrl: './input-pane.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrl: './input-pane.component.scss'
})
export class InputPaneComponent implements RdsPipeline  {
  @ViewChildren('blerGraph') public blerGraph!: QueryList<BlerGraphComponent>;
  @ViewChild('constellationDiagram') public constellationDiagram!: ConstellationDiagramComponent;
  @Output() groupReceived = new EventEmitter<ReceiverEvent>();
  isDragging = false;

  stationChangeDetector = new StationChangeDetector();
  private currentSource?: RdsSource;
  radioSources = [new Si470x(this), new RtlSdr(this)];
  selectedRadioSource?: RdsSource;
  fileSource = new FileSource(this);
  frequency: number = -1;
  signalStrength: number = 0;
  // For tuners directly providing RDS data, this indicator (for Stream 0)
  // replaces the demodulator's locked and the synchronizer's synced indicators.
  rdsSync: boolean = false;
  logDirHandle: FileSystemDirectoryHandle | null = null;
  logFileStream: FileSystemWritableFileStream | null = null;
  synchronizer = new Array<BitStreamSynchronizer>(FREQ_STREAMS.length);
  demodulator = new Array<Demodulator>(FREQ_STREAMS.length);

  prefPlaybackSpeed = new Pref<string>("pref.playback_speed", "fast");
  prefTunedFrequency = new Pref<number>("pref.tuned_frequency", 100000);
  prefMaxErrors = new Pref<number>("pref.max_errors", 0);

  private snackBar = inject(MatSnackBar);

  constructor(private httpClient: HttpClient, private route: ActivatedRoute) {
    for (let i=0; i<FREQ_STREAMS.length; i++) {
      this.synchronizer[i] = new BitStreamSynchronizer(i, this);
      this.demodulator[i] = new Demodulator(FREQ_STREAMS[i], this.synchronizer[i]);
    }
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

    this.prefMaxErrors.init();

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
    this.constellationDiagram.updateConstellationDiagram([], []);
  }

  private unsetSource() {
    this.currentSource = undefined;
    this.signalStrength = 0;
    this.rdsSync = false;
  }

  get sourceActive(): boolean {
    return this.currentSource != undefined;
  }

  async emitGroup(stream: number, group: Group, maxErrors: number) {
    // Apply the error tolerance (narrowing group.blocks[i].ok) before
    // updating the BLER graph, so groups with more than maxErrors are rendered
    // as uncorrectable.
    const events = this.stationChangeDetector.processGroup(stream, group, maxErrors);
    this.blerGraph.get(stream)?.updateBlerGraph(true, group);
    for (let event of events) {
      switch (event.kind) {
        case ReceiverEventKind.NewStationEvent:
          for (let s = 0; s < 4; s++) {
            this.blerGraph.get(s)?.reset();
          }
          await this.startNewLogFile(event.pi);
          break;
        
        case ReceiverEventKind.GroupEvent:
          await this.logGroupEvent(event);
          break;
      }
      this.groupReceived.emit(event);
    }
  }

  async processMpxSamples(samples: Float32Array, length?: number) {
    if (length == undefined) {
      length = samples.length;
    }
    for (let demIndex = 0; demIndex<FREQ_STREAMS.length; demIndex++) {
      const dem = this.demodulator[demIndex];
      for (let i=0; i<length; i++) {
        dem.addSample(samples[i]);
        
      }
    }
    // TODO: allow selection of stream(s).
    this.constellationDiagram.updateConstellationDiagram(this.demodulator[0].syncOutI, this.demodulator[0].syncOutQ);
  }

  async processBits(bytes: Uint8Array) {
    this.synchronizer[0].addBits(bytes);    // TODO: need to choose stream?
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

  setMaxErrors(event: any) {
    this.prefMaxErrors.setValue(event.value);
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
    if (event.type == RdsReportEventType.GROUP && event.group != undefined) {
      this.emitGroup(event.stream || 0, event.group, this.prefMaxErrors.value);
    }
    if (event.type == RdsReportEventType.UNSYNCED_GROUP_DURATION) {
      if (event.stream == undefined) {
        console.log(`No stream in ${event}`);
        return;
      }
      this.blerGraph.get(event.stream)?.updateBlerGraph(false, undefined);
    }
  }

  reportReceiverStatus(frequencyKhz: number, signalStrength: number, rdsSync: boolean) {
    this.prefTunedFrequency.setValue(frequencyKhz);
    this.frequency = frequencyKhz;
    this.signalStrength = Math.min(Math.max(signalStrength * 100, 0), 100);
    this.rdsSync = rdsSync;
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

  setFrequency() {
    const freqStr = window.prompt("New frequency:");
    if (freqStr == null) {
      console.log("No frequency entered.");
      return;
    }
    const freq = Number.parseFloat(freqStr) * 1000;
    if (Number.isNaN(freq)) {
      console.log(`Entered frequency ${freqStr} could not be parsed.`);
      return;
    }
    if (freq < 87500 || freq >= 108000) {
      console.log(`Entered frequency ${freq} not in FM radio band.`);
      return;
    }
    this.currentSource?.tune(freq);
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

    const logLine = (evt.stream > 0 ? `#S${evt.stream} ` : "") + evt.group;
    await this.logFileStream.write(logLine + "\n");
  }
}
