import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { GroupEvent, NewStationEvent, InputPaneComponent } from './input-pane/input-pane.component';
import { StationInfoComponent } from './station-info/station-info.component';
import { parse_group } from '../../../core/protocol/base';
import { LogMessage, StationImpl } from '../../../core/protocol/rds_types';

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

  receiveGroup(evt: GroupEvent | NewStationEvent) {
    const log = new LogMessage();
    if (evt instanceof GroupEvent) {
      parse_group(evt.blocks, evt.ok, log, this.station);
      console.log(log.toString());
      this.station.tickGroupDuration();
    } else if (evt instanceof NewStationEvent) {
      this.station.reset();
    }
  }

  constructor() {
    this.station = new StationImpl();
  }
}
