import { AfterViewInit, Component, ElementRef, ViewChild, ChangeDetectionStrategy } from '@angular/core';

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

  dbMin: number = Infinity;
  dbMax: number = -Infinity;

  public ngAfterViewInit() {
    // Initialize spectrum diagram.
    const diagramEl: HTMLCanvasElement = this.spectrumDiagram.nativeElement;
    this.spectrumDiagramCx = diagramEl.getContext('2d');
    this.syncCanvasSize();
    return this.spectrumDiagramCx;
  }

  public reset() {
    this.dbMin = Infinity;
    this.dbMax = -Infinity;
  }

  // Adopts the canvas's current on-screen size (e.g. after its container was resized) as the
  // backing-store resolution, scaled for device pixel density so the drawing stays crisp. Only
  // takes effect here, i.e. the next time a redraw happens, rather than eagerly on resize.
  private syncCanvasSize() {
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
  }

  updateSpectrumDiagram(spectrum: Float32Array) {
    if (this.spectrumDiagramCx == null) {
      return;
    }

    this.syncCanvasSize();
    console.log(this.spectrumDiagramWidth, this.spectrumDiagramHeight);

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

    // Adjust vertical scale: compute min and max since reset.
    for (let sample of spectrum) {
      if (sample < this.dbMin) {
        this.dbMin = sample;
      }
      if (sample > this.dbMax) {
        this.dbMax = sample;
      }
    }
    const yScale = this.spectrumDiagramHeight / (this.dbMax - this.dbMin);

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
      let merged = 0;
      for (let bin = start; bin < end; bin++) {
        if (spectrum[bin] > merged) {
          merged = spectrum[bin];
        }
      }

      const x = p * xStep;
      const y = this.spectrumDiagramHeight - (merged - this.dbMin) * yScale;
      this.spectrumDiagramCx.lineTo(x, y);
    }
    this.spectrumDiagramCx.lineTo(this.spectrumDiagramWidth, this.spectrumDiagramHeight);
    this.spectrumDiagramCx.closePath();
    this.spectrumDiagramCx.fill();
  }
}
