import { AfterViewInit, Component, ElementRef, Input, OnDestroy, ViewChild, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import {FormsModule} from '@angular/forms';
import {MatButtonToggleModule} from '@angular/material/button-toggle';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatListModule} from '@angular/material/list';
import {MatSelectModule} from '@angular/material/select';
import {MatTabsModule} from '@angular/material/tabs';
import {MatTooltipModule} from '@angular/material/tooltip';
import {MatDialog, MatDialogModule} from '@angular/material/dialog';
import { HexPipe } from '../hex.pipe';
import { Pref } from '../prefs';
import { LogMessage, StationImpl } from '../../../../core/protocol/rds_types';
import { AboutComponent } from '../about/about.component';
import { humanReadableUrl } from '../../../../core/protocol/internet_connection';

@Component({
    selector: 'app-station-info',
    imports: [CommonModule, HexPipe, FormsModule, MatButtonToggleModule, MatDialogModule, MatFormFieldModule, MatIconModule, MatListModule, MatSelectModule, MatTabsModule, MatTooltipModule],
    templateUrl: './station-info.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrl: './station-info.component.scss'
})
export class StationInfoComponent implements AfterViewInit, OnDestroy {
  @Input() station!: StationImpl;
  group_ids = Array(16).fill(0).map((x,i)=>i);
  all_group_types = Array(32).fill(0).map((x,i)=>i);
  all_channels = Array(64).fill(0).map((x,i)=>i);
  all_streams = Array(4).fill(0).map((x,i)=>i);
	rdsVariant: RdsVariant = RdsVariant.RDS;
	prefRdsVariant = new Pref<string>("pref.rds_variant", "rds");
	prefStatsUi = new Pref<string>("pref.stats_ui", "used_groups_channels");
	readonly aboutDialog = inject(MatDialog);

	@ViewChild('groupLog') groupLogEl?: ElementRef<HTMLDivElement>;
	stickToBottom = true;
	private groupLogObserver?: MutationObserver;

	// Group log filters. Empty string means "no filter".
	logGroupChannelFilter = '';
	logStreamFilter = '';

	ngOnInit() {
		this.prefRdsVariant.init();
		this.rdsVariant = this.prefRdsVariant.value == "rds" ? RdsVariant.RDS : RdsVariant.RBDS;
		this.prefStatsUi.init();
	}

	ngAfterViewInit() {
		const el = this.groupLogEl?.nativeElement;
		if (!el) return;
		this.groupLogObserver = new MutationObserver(() => {
			if (this.stickToBottom) {
				// mat-tab-group scrolls the active tab via its own internal
				// .mat-mdc-tab-body-content element, not our .bottom-tabs wrapper.
				const scrollParent = el.closest<HTMLElement>('.mat-mdc-tab-body-content');
				if (scrollParent) {
					scrollParent.scrollTop = scrollParent.scrollHeight;
				}
			}
		});
		this.groupLogObserver.observe(el, { childList: true });
	}

	ngOnDestroy() {
		this.groupLogObserver?.disconnect();
	}

	setRdsVariant(event: any) {
    this.rdsVariant = event.value == "rds" ? RdsVariant.RDS : RdsVariant.RBDS;
		this.prefRdsVariant.setValue(event.value);
	}

	setStatsUi(event: any) {
		this.prefStatsUi.setValue(event.value);
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
		for (let m of messages) {
			res.push(
				new RtEntry(
					m.id,
					m.message,
					this.station.rt_plus_app.enabled ?
						this.station.rt_plus_app.getHistoryEntry(m) :
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

	public getGroupOdaName(type: number): string {
		const aid = this.station.transmitted_odas.get(type);
		return aid != undefined ? this.getOdaName(aid) : '';
	}

	public getChannelOdaName(channel: number): string {
		const aid = this.station.transmitted_channel_odas.get(channel);
		return aid != undefined ? this.getOdaName(aid) : '';
	}

	filteredLog(): LogMessage[] {
		if (this.logGroupChannelFilter === '' && this.logStreamFilter === '') {
			return this.station.log;
		}
		return this.station.log.filter(m => {
			if (this.logStreamFilter !== '' && String(m.stream) !== this.logStreamFilter) {
				return false;
			}
			if (this.logGroupChannelFilter !== '') {
				const [kind, value] = this.logGroupChannelFilter.split('-');
				if (kind === 'type' && String(m.groupType) !== value) {
					return false;
				}
				if (kind === 'channel' && String(m.channel) !== value) {
					return false;
				}
			}
			return true;
		});
	}

	showAbout() {
		const dialog = this.aboutDialog.open(AboutComponent);
		return false;
	}

	humanReadableUrl(url: string) {
		return humanReadableUrl(url);
	}
}

export enum RdsVariant {
	RDS,
	RBDS
}

class RtEntry {
	constructor(
		public id: number,
		public rt: string,
		public rtPlus: Array<string> | null) {};
}

const WELL_KNOWN_ODAS = new Map<number, string>([
  [0x0093, "DAB cross-reference"],
	[0x0D45, "TMC/Alert-C testing"],
	[0x4400, "RDS Light"],
	[0x4AA1, "RASANT"],
	[0x4BD7, "RadioText Plus (RT+)"],
	[0x4BD8, "RadioText Plus (RT+) for eRT"],
	[0x6552, "Enhanced RadioText (eRT)"],
	[0xABCE, "Fleximax"],
	[0xC3B0, "iTunes Tagging"],
	[0xCD46, "TMC/Alert-C"],
	[0xFF70, "Internet connection"],
	[0xFF7F, "RFT: Station logo"],
	[0xFF80, "RFT: Slideshow"],
	[0xFF81, "RFT: Journaline"],
]);
