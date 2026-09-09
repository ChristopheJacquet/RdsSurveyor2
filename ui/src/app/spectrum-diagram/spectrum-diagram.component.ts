import { AfterViewInit, Component, ElementRef, ViewChild, ChangeDetectionStrategy } from '@angular/core';

// Fixed vertical scale, in dB, so a given signal level is always drawn at the same height
// instead of the scale rescaling to the current frame's minimum/maximum.
const SPECTRUM_DB_MIN = -60;
const SPECTRUM_DB_MAX = 90;

@Component({
    selector: 'app-spectrum-diagram',
    imports: [],
    templateUrl: './spectrum-diagram.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrl: './spectrum-diagram.component.scss'
})
export class SpectrumDiagramComponent implements AfterViewInit {
  @ViewChild('spectrumDiagram') public spectrumDiagram!: ElementRef;

  spectrumDiagramCx: CanvasRenderingContext2D | null = null;
  spectrumDiagramWidth: number = 0;
  spectrumDiagramHeight: number = 0;

  public ngAfterViewInit() {
    // Initialize spectrum diagram.
    const diagramEl: HTMLCanvasElement = this.spectrumDiagram.nativeElement;
    this.spectrumDiagramCx = diagramEl.getContext('2d');
    this.spectrumDiagramWidth = diagramEl.width;
    this.spectrumDiagramHeight = diagramEl.height;
    return this.spectrumDiagramCx;
  }

  updateSpectrumDiagram(spectrum: ArrayLike<number>) {
    if (this.spectrumDiagramCx == null) {
      return;
    }

    this.spectrumDiagramCx.clearRect(
      0, 0, this.spectrumDiagramWidth, this.spectrumDiagramHeight);

    if (spectrum.length == 0) {
      return;
    }

    const yScale = this.spectrumDiagramHeight / (SPECTRUM_DB_MAX - SPECTRUM_DB_MIN);

    // Smooth the trace, and cut down the amount drawn, by averaging consecutive bins down to
    // one point per pixel of canvas width, rather than plotting every FFT bin.
    const numPoints = Math.max(1, Math.round(this.spectrumDiagramWidth));
    const xStep = this.spectrumDiagramWidth / numPoints;
    const binsPerPoint = spectrum.length / numPoints;

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
      const start = Math.floor(p * binsPerPoint);
      const end = Math.max(start + 1, Math.floor((p + 1) * binsPerPoint));
      let sum = 0;
      for (let bin = start; bin < end; bin++) {
        sum += spectrum[bin];
      }
      const avg = sum / (end - start);

      const x = p * xStep;
      const clamped = Math.min(SPECTRUM_DB_MAX, Math.max(SPECTRUM_DB_MIN, avg));
      const y = this.spectrumDiagramHeight - (clamped - SPECTRUM_DB_MIN) * yScale;
      this.spectrumDiagramCx.lineTo(x, y);
    }
    this.spectrumDiagramCx.lineTo(this.spectrumDiagramWidth, this.spectrumDiagramHeight);
    this.spectrumDiagramCx.closePath();
    this.spectrumDiagramCx.fill();
  }
}
