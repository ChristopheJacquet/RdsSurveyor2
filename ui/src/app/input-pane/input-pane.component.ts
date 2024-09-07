import { Component, EventEmitter, Output } from '@angular/core';

@Component({
  selector: 'app-input-pane',
  standalone: true,
  imports: [],
  templateUrl: './input-pane.component.html',
  styleUrl: './input-pane.component.scss'
})
export class InputPaneComponent {
  @Output() groupReceived = new EventEmitter<GroupEvent>();
  isDragging = false;

  emitGroup(blocks: Uint16Array, ok: boolean[]) {
    const evt = new GroupEvent(blocks, ok);
    this.groupReceived.emit(evt);
  }

  processTextualGroups(s: string) {
    for (let l of s.split('\n')) {
      const blocks = l.trim().split(' ');
      if (blocks.length != 4) {
        console.log("Unrecognized line: ", l);
        return;
      }
      const bl: number[] = [];
      const ok: boolean[] = [];
      for (let i = 0; i<4; i++) {
        const val = parseInt(blocks[i], 16);
        bl.push(val);
        ok.push(!Number.isNaN(val));
      }
      this.emitGroup(Uint16Array.from(bl), ok);
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

  handleFileDrop(files: FileList) {
    const reader = new FileReader();
    reader.addEventListener(
      "load",
      () => {
        if (reader.result) {
          const contents = reader.result.toString();
          //console.log("contents", contents);
          this.processTextualGroups(contents);
        }
      },
      false);
    for (let f of Array.from(files)) {
      //console.log(f);
      reader.readAsText(f);
    }
  }

  sendDemoGroups() {
    this.processTextualGroups(
      `F201 0408 2037 2020
      F201 0409 383B 494E
      F201 040A 3D45 5445
      F201 040F 474E 5220`);
  }
}

export class GroupEvent {
  public blocks: Uint16Array;
  public ok: boolean[];

  constructor(blocks: Uint16Array, ok: boolean[]) {
    this.blocks = blocks;
    this.ok = ok;
  }
}
