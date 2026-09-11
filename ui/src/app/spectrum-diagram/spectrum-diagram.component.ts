import { AfterViewInit, Component, ElementRef, ViewChild, ChangeDetectionStrategy } from '@angular/core';
import {
  FREQ_STREAM_0, FREQ_STREAM_1, FREQ_STREAM_2, FREQ_STREAM_3, SPECTRUM_MAX_FREQUENCY
} from '../../../../core/signals/mpx';

// Ticks are labeled with their frequency in kHz.
function labelOf(freqHz: number): string {
  return String(freqHz / 1000);
}

@Component({
    selector: 'app-spectrum-diagram',
    imports: [],
    templateUrl: './spectrum-diagram.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrl: './spectrum-diagram.component.scss'
})
export class SpectrumDiagramComponent implements AfterViewInit {
  // Number of past spectra whose min/max are kept, to smooth out the vertical scale over time.
  private static readonly SCALE_HISTORY_LENGTH = 20;

  // Frequency ticks shown on the horizontal axis: the stereo pilot and its second harmonic
  // (the boundary of the stereo subcarrier band), and the RDS/ARI subcarrier frequencies.
  private static readonly AXIS_TICKS: number[] = [
    19000, 38000, FREQ_STREAM_0, FREQ_STREAM_1, FREQ_STREAM_2, FREQ_STREAM_3,
  ];

  @ViewChild('spectrumDiagram') public spectrumDiagram!: ElementRef;
  @ViewChild('spectrumAxis') public spectrumAxis!: ElementRef;

  spectrumDiagramCx: CanvasRenderingContext2D | null = null;
  spectrumDiagramWidth: number = 0;
  spectrumDiagramHeight: number = 0;

  spectrumAxisCx: CanvasRenderingContext2D | null = null;
  spectrumAxisWidth: number = 0;
  spectrumAxisHeight: number = 0;

  // Ring buffers of the per-spectrum min/max (of the merged, downsampled values, see
  // updateSpectrumDiagram) over the last SCALE_HISTORY_LENGTH spectra.
  dbMinHistory: Float32Array = new Float32Array(SpectrumDiagramComponent.SCALE_HISTORY_LENGTH);
  dbMaxHistory: Float32Array = new Float32Array(SpectrumDiagramComponent.SCALE_HISTORY_LENGTH);
  historyIndex: number = 0;
  historyCount: number = 0;

  public ngAfterViewInit() {
    // Initialize spectrum diagram.
    const diagramEl: HTMLCanvasElement = this.spectrumDiagram.nativeElement;
    this.spectrumDiagramCx = diagramEl.getContext('2d');
    const axisEl: HTMLCanvasElement = this.spectrumAxis.nativeElement;
    this.spectrumAxisCx = axisEl.getContext('2d');
    this.syncCanvasSizes();
    this.drawAxis();
    return this.spectrumDiagramCx;
  }

  public reset() {
    this.historyIndex = 0;
    this.historyCount = 0;
  }

  // Adopts each canvas's current on-screen size (e.g. after its container was resized) as the
  // backing-store resolution, scaled for device pixel density so the drawing stays crisp. Only
  // takes effect here, i.e. the next time a redraw happens, rather than eagerly on resize.
  private syncCanvasSizes() {
    const diagramEl: HTMLCanvasElement = this.spectrumDiagram.nativeElement;
    const dpr = window.devicePixelRatio || 1;
    const displayWidth = Math.round(diagramEl.clientWidth * dpr);
    const displayHeight = Math.round(diagramEl.clientHeight * dpr);
    if (displayWidth > 0 && displayHeight > 0 &&
        (diagramEl.width !== displayWidth || diagramEl.height !== displayHeight)) {
      diagramEl.width = displayWidth;
      diagramEl.height = displayHeight;
    }
    this.spectrumDiagramWidth = diagramEl.width;
    this.spectrumDiagramHeight = diagramEl.height;

    const axisEl: HTMLCanvasElement = this.spectrumAxis.nativeElement;
    const axisDisplayWidth = Math.round(axisEl.clientWidth * dpr);
    const axisDisplayHeight = Math.round(axisEl.clientHeight * dpr);
    if (axisDisplayWidth > 0 && axisDisplayHeight > 0 &&
        (axisEl.width !== axisDisplayWidth || axisEl.height !== axisDisplayHeight)) {
      axisEl.width = axisDisplayWidth;
      axisEl.height = axisDisplayHeight;
    }
    this.spectrumAxisWidth = axisEl.width;
    this.spectrumAxisHeight = axisEl.height;
  }

  // Draws the horizontal frequency axis below the spectrum: a line with an arrowhead on the
  // right, and ticks/labels for the frequencies of interest, positioned at the same horizontal
  // scale as the spectrum plot above (0 Hz to SPECTRUM_MAX_FREQUENCY, left to right).
  private drawAxis() {
    const cx = this.spectrumAxisCx;
    if (cx == null || this.spectrumAxisWidth === 0 || this.spectrumAxisHeight === 0) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const width = this.spectrumAxisWidth;
    const lineY = 4 * dpr;
    const tickLength = 4 * dpr;
    const arrowLength = 5 * dpr;
    const arrowHalfWidth = 3 * dpr;

    cx.clearRect(0, 0, this.spectrumAxisWidth, this.spectrumAxisHeight);
    cx.strokeStyle = '#888';
    cx.fillStyle = '#888';
    cx.lineWidth = dpr;
    cx.font = `${11 * dpr}px sans-serif`;
    cx.textAlign = 'center';
    cx.textBaseline = 'top';

    // Axis line, with an arrowhead at the right end.
    cx.beginPath();
    cx.moveTo(0, lineY);
    cx.lineTo(width, lineY);
    cx.moveTo(width - arrowLength, lineY - arrowHalfWidth);
    cx.lineTo(width, lineY);
    cx.lineTo(width - arrowLength, lineY + arrowHalfWidth);
    cx.stroke();

    // Ticks and their frequency labels, written left to right. A label is only written if it
    // doesn't overlap the last one written, so labels never crowd each other on a narrow
    // diagram.
    const minLabelGap = 4 * dpr;
    let rightEdgeOfLastLabel = -Infinity;
    for (const freqHz of SpectrumDiagramComponent.AXIS_TICKS) {
      const x = (freqHz / SPECTRUM_MAX_FREQUENCY) * width;
      const label = labelOf(freqHz);
      const halfLabelWidth = cx.measureText(label).width / 2;
      if (x - halfLabelWidth < rightEdgeOfLastLabel + minLabelGap) {
        continue;
      }
      cx.beginPath();
      cx.moveTo(x, lineY);
      cx.lineTo(x, lineY + tickLength);
      cx.stroke();
      cx.fillText(label, x, lineY + tickLength + 2 * dpr);
      rightEdgeOfLastLabel = x + halfLabelWidth;
    }
  }

  updateSpectrumDiagram(spectrum: Float32Array) {
    if (this.spectrumDiagramCx == null) {
      return;
    }

    this.syncCanvasSizes();
    this.drawAxis();

    this.spectrumDiagramCx.clearRect(
      0, 0, this.spectrumDiagramWidth, this.spectrumDiagramHeight);

    if (spectrum.length == 0) {
      return;
    }

    // Smooth the trace, and cut down the amount drawn, by merging consecutive bins down to
    // one point per pixel of canvas width, rather than plotting every FFT bin.
    const numPoints = Math.max(1, Math.round(this.spectrumDiagramWidth));
    const xStep = this.spectrumDiagramWidth / numPoints;
    const binsPerPoint = spectrum.length / numPoints;

    const merged = new Float32Array(numPoints);
    let mergedMin = Infinity;
    let mergedMax = -Infinity;
    for (let p = 0; p < numPoints; p++) {
      const start = Math.floor(p * binsPerPoint);
      const end = Math.max(start + 1, Math.floor((p + 1) * binsPerPoint));
      let mergedPoint = 0;
      for (let bin = start; bin < end; bin++) {
        if (spectrum[bin] > mergedPoint) {
          mergedPoint = spectrum[bin];
        }
      }
      merged[p] = mergedPoint;
      if (mergedPoint < mergedMin) {
        mergedMin = mergedPoint;
      }
      if (mergedPoint > mergedMax) {
        mergedMax = mergedPoint;
      }
    }

    // Adjust vertical scale: track the min and max of the merged values (not the raw bins)
    // over the last SCALE_HISTORY_LENGTH spectra, in a ring buffer, so the scale reacts to
    // recent history.
    this.dbMinHistory[this.historyIndex] = mergedMin;
    this.dbMaxHistory[this.historyIndex] = mergedMax;
    this.historyIndex = (this.historyIndex + 1) % SpectrumDiagramComponent.SCALE_HISTORY_LENGTH;
    this.historyCount = Math.min(
      this.historyCount + 1, SpectrumDiagramComponent.SCALE_HISTORY_LENGTH);

    let dbMin = Infinity;
    let dbMax = -Infinity;
    for (let i = 0; i < this.historyCount; i++) {
      if (this.dbMinHistory[i] < dbMin) {
        dbMin = this.dbMinHistory[i];
      }
      if (this.dbMaxHistory[i] > dbMax) {
        dbMax = this.dbMaxHistory[i];
      }
    }
    const yScale = this.spectrumDiagramHeight / (dbMax - dbMin);

    // Fill the area between the baseline (the scale's minimum) and the spectrum, rather
    // than just stroking a line, so a noisy trace reads as a solid shape and not as a band
    // between separate min/max lines.
    const gradient = this.spectrumDiagramCx.createLinearGradient(0, this.spectrumDiagramHeight, 0, 0);
    gradient.addColorStop(0, "#004");
    gradient.addColorStop(1, "#00F");
    this.spectrumDiagramCx.fillStyle = gradient;
    this.spectrumDiagramCx.beginPath();
    this.spectrumDiagramCx.moveTo(0, this.spectrumDiagramHeight);
    for (let p = 0; p < numPoints; p++) {
      const x = p * xStep;
      const y = this.spectrumDiagramHeight - (merged[p] - dbMin) * yScale;
      this.spectrumDiagramCx.lineTo(x, y);
    }
    this.spectrumDiagramCx.lineTo(this.spectrumDiagramWidth, this.spectrumDiagramHeight);
    this.spectrumDiagramCx.closePath();
    this.spectrumDiagramCx.fill();
  }
}
