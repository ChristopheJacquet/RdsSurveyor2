import { AfterViewInit, Component, ElementRef, ViewChild } from '@angular/core';

@Component({
  selector: 'app-constellation-diagram',
  standalone: true,
  imports: [],
  templateUrl: './constellation-diagram.component.html',
  styleUrl: './constellation-diagram.component.scss'
})
export class ConstellationDiagramComponent  implements AfterViewInit {
  @ViewChild('constellationDiagram') public constellationDiagram!: ElementRef;

  constellationDiagramCx: CanvasRenderingContext2D | null = null;
  constellationDiagramWidth: number = 0;
  constellationDiagramHeight: number = 0;

  public ngAfterViewInit() {
    // Initialize constellation diagram.
    const diagramEl: HTMLCanvasElement = this.constellationDiagram.nativeElement;
    this.constellationDiagramCx = diagramEl.getContext('2d');
    this.constellationDiagramWidth = diagramEl.width;
    this.constellationDiagramHeight = diagramEl.height;
    return this.constellationDiagramCx;
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
}
