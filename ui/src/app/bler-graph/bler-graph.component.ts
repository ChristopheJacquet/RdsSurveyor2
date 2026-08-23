import { AfterViewInit, Component, ElementRef, Input, ViewChild } from '@angular/core';
import { Group } from '../../../../core/drivers/input';

enum BlockCategory {
  Clean,
  Corrected,
  Error,
  // No block was decoded (bitstream not synced) — excluded from the rate
  // getters below, since there is no block to judge as correct or not.
  Unsynced,
}

// 5 seconds' worth of blocks, at ~11.4 groups/sec (4 blocks/group).
const WINDOW_SIZE = 228;

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

  // Rolling window of the last WINDOW_SIZE blocks' categories, for the
  // error-rate / corrected-rate stats.
  private blockWindow = new Uint8Array(WINDOW_SIZE);
  private writeIndex = 0;
  private filled = 0;
  private categoryCounts = [0, 0, 0, 0];

  private pushBlock(category: BlockCategory) {
    if (this.filled == WINDOW_SIZE) {
      this.categoryCounts[this.blockWindow[this.writeIndex]]--;
    } else {
      this.filled++;
    }
    this.blockWindow[this.writeIndex] = category;
    this.categoryCounts[category]++;
    this.writeIndex = (this.writeIndex + 1) % WINDOW_SIZE;
  }

  // Number of actually-decoded blocks (i.e. excluding Unsynced) in the
  // current window — the denominator for the rate getters below.
  private get decodedBlockCount(): number {
    return this.filled - this.categoryCounts[BlockCategory.Unsynced];
  }

  // Whether any block was decoded in the current window, i.e. whether the
  // rate getters below are meaningful.
  get hasBlocks(): boolean {
    return this.decodedBlockCount > 0;
  }

  get errorRatePercent(): number {
    const total = this.decodedBlockCount;
    return total == 0 ? 0 : this.categoryCounts[BlockCategory.Error] / total * 100;
  }

  get correctedRatePercent(): number {
    const total = this.decodedBlockCount;
    return total == 0 ? 0 : this.categoryCounts[BlockCategory.Corrected] / total * 100;
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
  }

  updateBlerGraph(synced: boolean, group: Group | undefined) {
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
      if (!synced || group == undefined) {
        this.blerGraphCx.strokeStyle = "#aaa";
        this.pushBlock(BlockCategory.Unsynced);
      } else {
        const b = group.blocks[i];
        this.blerGraphCx.strokeStyle =
          b.errorCount == 0 ? "#8F8" : b.ok ? "#FC8" : "#F88";
        this.pushBlock(b.errorCount == 0 ? BlockCategory.Clean : b.ok ? BlockCategory.Corrected : BlockCategory.Error);
      }
      const y = (i+1)*this.blerGraphHeight/4;
      this.blerGraphCx.beginPath();
      this.blerGraphCx.moveTo(x, prevY);
      this.blerGraphCx.lineTo(x, y);
      this.blerGraphCx.stroke();
      prevY = y;
    }
  }
}
