import { AfterViewInit, Component, ElementRef, Input, ViewChild } from '@angular/core';

@Component({
  selector: 'app-bler-graph',
  standalone: true,
  imports: [],
  templateUrl: './bler-graph.component.html',
  styleUrl: './bler-graph.component.scss'
})
export class BlerGraphComponent implements AfterViewInit {
  @ViewChild('blerGraph') public blerGraph!: ElementRef;

  blerGraphCx: CanvasRenderingContext2D | null = null;
  blerGraphWidth: number = 0;
  blerGraphHeight: number = 0;

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
}
