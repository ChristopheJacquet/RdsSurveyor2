import { Component, Input } from '@angular/core';
import { HexPipe } from '../hex.pipe';
import { StationImpl } from '../../../../core/protocol/rds_types';

@Component({
  selector: 'app-station-info',
  standalone: true,
  imports: [HexPipe],
  templateUrl: './station-info.component.html',
  styleUrl: './station-info.component.scss'
})
export class StationInfoComponent {
  @Input() station!: StationImpl;
}
