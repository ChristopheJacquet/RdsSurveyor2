import { DecimalPipe } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { Component, EventEmitter, Output, QueryList, ViewChild, ViewChildren, inject, ChangeDetectionStrategy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {MatButtonModule} from '@angular/material/button';
import {MatButtonToggleModule} from '@angular/material/button-toggle';
import {MatIconModule} from '@angular/material/icon';
import {MatSnackBar} from '@angular/material/snack-bar';
import {FormsModule} from '@angular/forms';
import {MatExpansionModule, MatExpansionPanel} from '@angular/material/expansion';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatSelectModule} from '@angular/material/select';
import {MatRadioModule} from '@angular/material/radio';


import { DecoderLevel, Group, RdsPipeline, RdsReportEvent, RdsReportEventType, RdsSource, SeekDirection } from "../../../../core/drivers/input";
import { AudioInput } from "../../../../core/drivers/audio";
import { Si470x } from "../../../../core/drivers/si470x";
import { RtlSdr } from "../../../../core/drivers/rtlsdr";
import { FileSource } from "../../../../core/drivers/file";
import { BitStreamSynchronizer } from "../../../../core/signals/bitstream";
import { Demodulator, FREQ_STREAMS, SpectrumAnalyzer } from "../../../../core/signals/mpx";
import { GroupEvent, ReceiverEvent, ReceiverEventKind, StationChangeDetector } from "../../../../core/protocol/station_change";
import { Pref } from '../prefs';
import { catchError } from 'rxjs';
import { BlerGraphComponent } from "../bler-graph/bler-graph.component";
import { ConstellationDiagramComponent } from "../constellation-diagram/constellation-diagram.component";
import { SpectrumDiagramComponent } from "../spectrum-diagram/spectrum-diagram.component";

@Component({
    selector: 'app-input-pane',
    imports: [CommonModule, DecimalPipe, MatButtonModule, MatButtonToggleModule, MatIconModule, MatExpansionModule, MatFormFieldModule, MatSelectModule, MatRadioModule, FormsModule, BlerGraphComponent, ConstellationDiagramComponent, SpectrumDiagramComponent],
    templateUrl: './input-pane.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrl: './input-pane.component.scss'
})
export class InputPaneComponent implements RdsPipeline  {
  @ViewChildren('blerGraph') public blerGraph!: QueryList<BlerGraphComponent>;
  @ViewChild('constellationDiagram') public constellationDiagram!: ConstellationDiagramComponent;
  @ViewChild('spectrumDiagram') public spectrumDiagram!: SpectrumDiagramComponent;
  @Output() groupReceived = new EventEmitter<ReceiverEvent>();
  isDragging = false;

  // Exposed for the template, so it can compare against capabilities.decoderLevel.
  readonly DecoderLevel = DecoderLevel;

  stationChangeDetector = new StationChangeDetector();
  currentSource?: RdsSource;
  audioSource = new AudioInput(this);
  fileSource = new FileSource(this);
  sources = [this.fileSource, new Si470x(this), new RtlSdr(this), this.audioSource];
  selectedSource: RdsSource = this.sources[0];
  audioDevices: MediaDeviceInfo[] = [];
  private lastSourceWasFile = false;
  frequency: number = -1;
  signalStrength: number = 0;
  // For tuners directly providing RDS data, this indicator (for Stream 0)
  // replaces the demodulator's locked and the synchronizer's synced indicators.
  rdsSync: boolean = false;
  logDirHandle: FileSystemDirectoryHandle | null = null;
  logFileStream: FileSystemWritableFileStream | null = null;
  // PI of the currently tuned station.
  private currentPi: number | null = null;
  // Whether a log file has been started for the current logDirHandle.
  private logFileStarted = false;
  // Chains pending log writes so they execute in order, one at a time, off
  // to the side of the (synchronous) group-processing path. A failed write
  // is caught so it doesn't break the chain for subsequent writes.
  private logWriteChain: Promise<void> = Promise.resolve();
  // Lines waiting to be batched into the next write(), so we don't issue one
  // costly write() per group.
  private logBuffer: string[] = [];
  private static readonly LOG_FLUSH_LINES = 100;
  synchronizer = new Array<BitStreamSynchronizer>(FREQ_STREAMS.length);
  demodulator = new Array<Demodulator>(FREQ_STREAMS.length);
  spectrumAnalyzer = new SpectrumAnalyzer();
  private constellationRedrawScheduled = false;

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

    // Populate the audio device list if permission was already granted in a
    // previous session; otherwise the settings panel offers a button to ask.
    this.refreshAudioDevices();

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
    this.lastSourceWasFile = source === this.fileSource;
    // Clear constellation diagram.
    this.constellationDiagram.updateConstellationDiagram([], []);
    // Clear spectrum diagram.
    this.spectrumAnalyzer.reset();
    this.spectrumDiagram.updateSpectrumDiagram(new Float32Array());
  }

  private resetDemodulationChain() {
    for (let i=0; i<4; i++) {
      this.demodulator[i].reset();
      this.synchronizer[i].reset();
    }
    this.spectrumAnalyzer.reset();
    this.spectrumDiagram.reset();
  }

  private unsetSource() {
    this.currentSource = undefined;
    this.signalStrength = 0;
    this.rdsSync = false;
    this.resetDemodulationChain();
  }

  get sourceActive(): boolean {
    return this.currentSource != undefined;
  }

  get canReplay(): boolean {
    return this.lastSourceWasFile && !this.sourceActive;
  }

  emitGroup(stream: number, group: Group, maxErrors: number) {
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
          this.currentPi = event.pi;
          this.startNewLogFile(event.pi);
          break;

        case ReceiverEventKind.GroupEvent:
          // Covers the case where a log dir is picked after NewStationEvent was
          // received.
          if (!this.logFileStarted && this.currentPi != null) {
            this.startNewLogFile(this.currentPi);
          }
          // Drop groups until the new PI is known, to avoid misattributing them.
          if (this.logFileStarted) {
            this.logGroupEvent(event);
          }
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
    this.spectrumAnalyzer.addSamples(samples, length);
    this.scheduleConstellationRedraw();
  }

  // Coalesces bursts of processMpxSamples() calls (which can arrive much
  // faster than the display can usefully show) into at most one redraw per
  // animation frame.
  private scheduleConstellationRedraw() {
    if (this.constellationRedrawScheduled) {
      return;
    }
    this.constellationRedrawScheduled = true;
    requestAnimationFrame(() => {
      this.constellationRedrawScheduled = false;
      // TODO: allow selection of stream(s).
      this.constellationDiagram.updateConstellationDiagram(this.demodulator[0].syncOutI, this.demodulator[0].syncOutQ);
      this.spectrumDiagram.updateSpectrumDiagram(this.spectrumAnalyzer.spectrum);
    });
  }

  async processBit(bit: boolean) {
    this.synchronizer[0].addBit(bit);    // TODO: need to choose stream?
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

  replayFile() {
    if (!this.canReplay) {
      return;
    }
    this.setSource(this.fileSource);
    this.fileSource.start();
  }

  setPlaybackSpeed(event: any) {
    this.fileSource.realtimePlayback = event.value == "realtime";
    this.prefPlaybackSpeed.setValue(event.value);
  }

  setMaxErrors(event: any) {
    this.prefMaxErrors.setValue(event.value);
  }

  // Exactly one radio source panel must stay expanded at all times, so undo
  // an attempt to collapse the currently selected one.
  keepSelectedPanelOpen(panel: MatExpansionPanel, source: RdsSource) {
    if (this.selectedSource === source) {
      panel.open();
    }
  }

  // Whether we currently have a real device list to show, as opposed to an
  // unlabeled placeholder returned before input permission was granted.
  get hasAudioDeviceAccess(): boolean {
    return this.audioDevices.length > 0 && this.audioDevices.every((d) => d.label !== "");
  }

  // Devices usable in the audio source's currently selected mode.
  get usableAudioDevices(): MediaDeviceInfo[] {
    return this.audioSource.mode === "bitstream"
      ? this.audioDevices.filter((d) => this.isStereoCapable(d))
      : this.audioDevices;
  }

  // Whether a device is known to support the 2 channels a data/clock
  // bitstream needs. Browsers that don't expose per-device capabilities are
  // assumed to qualify, since we have no way to tell otherwise.
  private isStereoCapable(device: MediaDeviceInfo): boolean {
    if (typeof InputDeviceInfo === "undefined" || !(device instanceof InputDeviceInfo)) {
      return true;
    }
    const channelCount = device.getCapabilities().channelCount;
    return channelCount?.max == undefined || channelCount.max >= 2;
  }

  // Lists available audio input devices. Device labels (and, where the
  // browser supports it, the capabilities used by isStereoCapable()) are
  // only populated once input permission has been granted; call
  // requestAudioAccess() first if needed.
  private async listAudioDevices(): Promise<MediaDeviceInfo[]> {
    if (!("mediaDevices" in navigator)) {
      return [];
    }
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === "audioinput");
  }

  async refreshAudioDevices() {
    this.audioDevices = await this.listAudioDevices();
    this.ensureAudioDeviceSelected();
  }

  // Prompts the browser's input-permission dialog, so the device list above
  // starts returning real device labels and capabilities.
  async requestAudioAccess() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
    } catch (e) {
      console.log("audio: could not get input permission.", e);
    }
    await this.refreshAudioDevices();
  }

  // Re-run device selection when the mode changes, since it may make the
  // currently selected device unusable (e.g. a mono device while in
  // bitstream mode).
  onAudioModeChange() {
    this.ensureAudioDeviceSelected();
  }

  private ensureAudioDeviceSelected() {
    const usable = this.usableAudioDevices;
    if (!usable.some((d) => d.deviceId === this.audioSource.deviceId)) {
      this.audioSource.deviceId = usable[0]?.deviceId;
    }
  }

  async startSelectedRadioSource() {
    console.log(this.selectedSource);

    if (this.selectedSource == undefined || this.selectedSource === this.fileSource) {
      return;
    }
    const success = await this.selectedSource.start();
    if (!success) {
      console.log("Cannot start source " + this.selectedSource.name);
      return;
    }
    this.setSource(this.selectedSource);
    await this.selectedSource.tune(this.prefTunedFrequency.value);
  }

  async stopSource() {
    if (this.currentSource == undefined) {
      return;
    }
    await this.currentSource.stop();
    this.unsetSource();
    this.stopLoggingCurrentStation();
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
    this.stopLoggingCurrentStation();
  }

  seekUp() {
    if (this.currentSource != undefined) {
      this.currentSource.seek(SeekDirection.UP);
      this.stopLoggingCurrentStation();
    }
  }

  seekDown() {
    if (this.currentSource != undefined) {
      this.currentSource.seek(SeekDirection.DOWN);
      this.stopLoggingCurrentStation();
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
      this.stopLoggingCurrentStation();
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
    this.stopLoggingCurrentStation();
  }

  async selectLogDir() {
    try {
      if ("showDirectoryPicker" in self) {  // Prefer the File System Access API.
        this.logDirHandle = await window.showDirectoryPicker({
          mode: "readwrite"
        });
      } else if ("storage" in navigator) {  // Fall back to Origin Private File System (OPFS ).
        const isPersistent = await navigator.storage.persisted();
        if (!isPersistent) {
          // A dialog window may be shown here.
          await navigator.storage.persist();
        }
        this.logDirHandle = await navigator.storage.getDirectory();
      } else {
        this.logDirHandle = null;
      }
      console.log(this.logDirHandle);
    } catch (error) {
      this.logDirHandle = null;
      console.error(error);
      this.snackBar.open(
        "Unable to start group recording: cannot get a location for storing files.",
        "Dismiss");
    }
    this.logFileStarted = false;
  }

  async stopLogging() {
    // Stop accepting new writes, then wait for whatever's already queued
    // (including a possible file-rotation) to actually land on disk before
    // closing, so recording stops only once every group up to this point
    // has really been written out.
    this.logDirHandle = null;
    this.logFileStarted = false;
    this.flushLogBuffer();
    await this.logWriteChain;
    if (this.logFileStream != null) {
      await this.logFileStream.close();
      this.logFileStream = null;
    }
  }

  // Appends `op` to the log write queue, so pending writes run strictly in
  // order, one at a time, without blocking group processing on disk I/O.
  private enqueueLogOp(op: () => Promise<void>) {
    this.logWriteChain = this.logWriteChain.then(op)
      .catch(err => console.error('Recording write failed', err));
  }

  startNewLogFile(pi: number) {
    if (this.logDirHandle == null) {
      return;
    }
    this.logFileStarted = true;
    const dirHandle = this.logDirHandle;

    const date = new Date();
    const fileName = pi.toString(16).toUpperCase().padStart(4, '0')
      + ' ' + date.getFullYear().toString().padStart(4, '0')
      + '-' + (date.getMonth() + 1).toString().padStart(2, '0')
      + '-' + date.getDate().toString().padStart(2, '0')
      + ' ' + date.getHours().toString().padStart(2, '0')
      + '-' + date.getMinutes().toString().padStart(2, '0')
      + '-' + date.getSeconds().toString().padStart(2, '0')
      + '.hexrds'

    // Flush what's buffered to the previous file before rotating.
    this.flushLogBuffer();

    this.enqueueLogOp(async () => {
      if (this.logFileStream != null) {
        // Write out pending log data to the previous log file.
        await this.logFileStream.close();
      }
      const logFileHandle = await dirHandle.getFileHandle(fileName, { create: true });
      this.logFileStream = await logFileHandle.createWritable();
      await this.logFileStream.write(
        '% RDS recording by RDS Surveyor 2.\n' +
        '% format=corrected_hex_groups_with_error_count\n');
    });
  }

  logGroupEvent(evt: GroupEvent) {
    if (this.logDirHandle == null) {
      return;
    }

    const logLine = (evt.stream > 0 ? `#S${evt.stream} ` : "") + evt.group;
    this.logBuffer.push(logLine + "\n");
    if (this.logBuffer.length >= InputPaneComponent.LOG_FLUSH_LINES) {
      this.flushLogBuffer();
    }
  }

  // Batches buffered lines into a single write(), instead of issuing one
  // write() per group; called both periodically (once the buffer fills up)
  // and whenever the buffer must be fully drained (file rotation, stop).
  private flushLogBuffer() {
    if (this.logBuffer.length == 0) {
      return;
    }
    const chunk = this.logBuffer.join('');
    this.logBuffer = [];
    this.enqueueLogOp(async () => {
      if (this.logFileStream != null) {
        await this.logFileStream.write(chunk);
      }
    });
  }

  // On stop/tune/seek: flush the old file, then stop writing to it until a
  // new NewStationEvent confirms the next station's PI.
  private stopLoggingCurrentStation() {
    this.flushLogBuffer();
    this.logFileStarted = false;
    this.currentPi = null;
  }
}
