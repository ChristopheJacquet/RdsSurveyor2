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
        log.add(evt.stream + ':[' + evt.hexDump() + '] ', false);
        parse_group(evt.stream, evt.blocks, evt.ok, log, this.station);
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
