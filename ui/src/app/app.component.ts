import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { InputPaneComponent } from './input-pane/input-pane.component';
import { StationInfoComponent } from './station-info/station-info.component';
import { LogMessage, parse_group, StationImpl } from '../../../core/protocol/rds_types';
import { ReceiverEvent, ReceiverEventKind } from "../../../core/protocol/station_change";

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, InputPaneComponent, StationInfoComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'rds-surveyor';

  station: StationImpl;

  receiveGroup(evt: ReceiverEvent) {
    switch (evt.kind) {
      case ReceiverEventKind.GroupEvent:
        const log = new LogMessage();
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
        parse_group(evt.stream, evt.group, log, this.station);
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
