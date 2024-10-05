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
  
  getTrafficString(station: StationImpl): string {
    const flags: string[] = [];
    if (station.tp) {
      flags.push("TP");
    }
    if (station.ta) {
      flags.push("TA");
    }
    return flags.join(" + ");
  }

	getPtyString(station: StationImpl): string {
		if (station.pty == undefined) {
			return "";
		}

		// RDS and RBDS have diffent meanings for PTY values.
		return (this.rdsVariant == RdsVariant.RDS ? 
			this.rdsPtyLabels : this.rbdsPtyLabels)[station.pty]
			+ " (" + station.pty + ")";
	}

	isRbds() {
		return this.rdsVariant == RdsVariant.RBDS;
	}

	getRThistory(): Array<RtEntry> {
		const res = Array<RtEntry>();
		const messages = this.station.rt.getPastMessages(true);
		for (let i=0; i<messages.length; i++) {
			res.push(
				new RtEntry(
					messages[i],
					this.station.rt_plus_app.enabled ?
						this.station.rt_plus_app.getHistoryForIndex(i, messages[i]) :
						null));
		}
		return res;
	}

	public formatGroupType(group_type: number) {
		return `${group_type >> 1}${(group_type & 1) == 0 ? 'A' : 'B'}`;
	}
	
	public getOdaName(aid: number) {
		return WELL_KNOWN_ODAS.get(aid) || 'Unknown';
	}
	
}

export enum RdsVariant {
	RDS,
	RBDS
}

class RtEntry {
	constructor(
		public rt: string,
		public rtPlus: string | null) {};
}

const WELL_KNOWN_ODAS = new Map<number, string>([
  [0x0093, "DAB cross-reference"],
	[0x0D45, "TMC/Alert-C testing"],
	[0x4400, "RDS Light"],
	[0x4AA1, "RASANT"],
	[0x4BD7, "RadioText Plus (RT+)"],
	[0x6552, "Enhanced RadioText (eRT"],
	[0xC3B0, "iTunes Tagging"],
	[0xCD46, "TMC/Alert-C"],
]);
