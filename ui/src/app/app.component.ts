import { Component, ChangeDetectionStrategy, HostListener } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { InputPaneComponent } from './input-pane/input-pane.component';
import { StationInfoComponent } from './station-info/station-info.component';
import { LogMessage, parse_group, StationImpl } from '../../../core/protocol/rds_types';
import { ReceiverEvent, ReceiverEventKind } from "../../../core/protocol/station_change";

@Component({
    selector: 'app-root',
    imports: [RouterOutlet, InputPaneComponent, StationInfoComponent],
    templateUrl: './app.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'rds-surveyor';

  station: StationImpl;

  // Width the user has dragged the input pane to, in pixels; undefined until
  // the divider is dragged, so the pane keeps its CSS-defined default width.
  inputPaneWidth?: number;

  private draggingDivider = false;
  private dragStartX = 0;
  private dragStartWidth = 0;

  onDividerMouseDown(event: MouseEvent) {
    event.preventDefault();
    const inputPane = (event.target as HTMLElement).previousElementSibling as HTMLElement;
    this.draggingDivider = true;
    this.dragStartX = event.clientX;
    this.dragStartWidth = inputPane.getBoundingClientRect().width;
    // Suppress text selection elsewhere on the page while dragging.
    document.body.style.userSelect = 'none';
  }

  @HostListener('document:mousemove', ['$event'])
  onDocumentMouseMove(event: MouseEvent) {
    if (this.draggingDivider) {
      this.inputPaneWidth = this.dragStartWidth + (event.clientX - this.dragStartX);
    }
  }

  @HostListener('document:mouseup')
  onDocumentMouseUp() {
    this.draggingDivider = false;
    document.body.style.userSelect = '';
  }

  receiveGroup(evt: ReceiverEvent) {
    switch (evt.kind) {
      case ReceiverEventKind.GroupEvent:
        const log = new LogMessage();
        log.stream = evt.stream;
        log.add(evt.stream + ':[', false);
        const blocks = evt.hexDumpParts();
        blocks.forEach((b, i) => {
          log.add(
            b.text,
            false,
            b.correctedErrors > 0 ? 'corrected' : undefined,
            b.correctedErrors > 0 ? `${b.correctedErrors} error${b.correctedErrors > 1 ? 's' : ''} corrected` : undefined);
          if (i < blocks.length - 1) log.add(' ', false);
        });
        log.add('] ', false);
        this.station.currentLogMessage = log;
        parse_group(evt.stream, evt.group, log, this.station);
        this.station.currentLogMessage = null;
        this.station.addLogMessage(log);
        this.station.tickGroupDuration();
        break;
      case ReceiverEventKind.NewStationEvent:
        this.station.reset();
        break;
    }
  }

  constructor() {
    this.station = new StationImpl();
  }
}
