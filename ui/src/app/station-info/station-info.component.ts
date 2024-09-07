import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HexPipe } from '../hex.pipe';
import { StationImpl } from '../../../../core/protocol/rds_types';

@Component({
  selector: 'app-station-info',
  standalone: true,
  imports: [CommonModule, HexPipe],
  templateUrl: './station-info.component.html',
  styleUrl: './station-info.component.scss'
})
export class StationInfoComponent {
  @Input() station!: StationImpl;
  group_ids = Array(16).fill(0).map((x,i)=>i);
}
