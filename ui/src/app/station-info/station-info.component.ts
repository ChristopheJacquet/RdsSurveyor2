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

	rdsPtyLabels = new Array<string>(
		"None/Undefined",
		"News",
		"Current Affairs",
		"Information",
		"Sport",
		"Education",
		"Drama",
		"Culture",
		"Science",
		"Varied",
		"Pop Music",
		"Rock Music",
		"Easy Listening Music",
		"Light classical",
		"Serious classical",
		"Other Music",
		"Weather",
		"Finance",
		"Children's programmes",
		"Social Affairs",
		"Religion",
		"Phone In",
		"Travel",
		"Leisure",
		"Jazz Music",
		"Country Music",
		"National Music",
		"Oldies Music",
		"Folk Music",
		"Documentary",
		"Alarm Test",
		"Alarm");

	rbdsPtyLabels = new Array<string>(
		"No program type or undefined",
		"News",
		"Information",
		"Sport",
		"Talk",
		"Rock",
		"Classic Rock",
		"Adult Hits",
		"Soft Rock",
		"Top 40",
		"Country",
		"Oldies",
		"Soft",
		"Nostalgia",
		"Jazz",
		"Classical",
		"Rhythm and Blues",
		"Soft Rhythm and Blues",
		"Foreign Language",
		"Religious Music",
		"Religious Talk",
		"Personality",
		"Public",
		"College",
		"Spanish Talk",
		"Spanish Music",
		"Hip-Hop",
		"Unassigned",
		"Unassigned",
		"Weather",
		"Emergency Test",
		"Emergency");
}
