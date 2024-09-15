import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import {MatButtonToggleModule} from '@angular/material/button-toggle';
import {MatListModule} from '@angular/material/list'; 
import {MatTabsModule} from '@angular/material/tabs'; 
import { HexPipe } from '../hex.pipe';
import { StationImpl } from '../../../../core/protocol/rds_types';

@Component({
  selector: 'app-station-info',
  standalone: true,
  imports: [CommonModule, HexPipe, MatButtonToggleModule, MatListModule, MatTabsModule],
  templateUrl: './station-info.component.html',
  styleUrl: './station-info.component.scss'
})
export class StationInfoComponent {
  @Input() station!: StationImpl;
  group_ids = Array(16).fill(0).map((x,i)=>i);
	rdsVariant: RdsVariant = RdsVariant.RDS;

	setRdsVariant(event: any) {
    this.rdsVariant = event.value == "rds" ? RdsVariant.RDS : RdsVariant.RBDS;
	}

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
  
  getTrafficString(): string {
    const flags: string[] = [];
    if (this.station.tp) {
      flags.push("TP");
    }
    if (this.station.ta) {
      flags.push("TA");
    }
    return flags.join(" + ");
  }

	getPtyString(): string {
		if (this.station.pty == undefined) {
			return "";
		}

		// RDS and RBDS have diffent meanings for PTY values.
		return (this.rdsVariant == RdsVariant.RDS ? 
			this.rdsPtyLabels : this.rbdsPtyLabels)[this.station.pty]
			+ " (" + this.station.pty + ")";
	}

	isRbds() {
		return this.rdsVariant == RdsVariant.RBDS;
	}
}

export enum RdsVariant {
	RDS,
	RBDS
}
