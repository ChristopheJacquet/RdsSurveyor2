import { AfterViewInit, Component, ElementRef, Input, OnDestroy, ViewChild, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import {FormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatButtonToggleModule} from '@angular/material/button-toggle';
import {MatCheckboxModule} from '@angular/material/checkbox';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatListModule} from '@angular/material/list';
import {MatSelectModule} from '@angular/material/select';
import {MatTabsModule} from '@angular/material/tabs';
import {MatTooltipModule} from '@angular/material/tooltip';
import {MatDialog, MatDialogModule} from '@angular/material/dialog';
import { HexPipe } from '../hex.pipe';
import { prefs } from '../prefs';
import { LogMessage, RdsStringHistoryEntry, RdsVariant, StationImpl, showInvisibleChars } from '../../../../core/protocol/rds_types';
import { AboutComponent } from '../about/about.component';
import { PrefsDialogComponent } from '../prefs-dialog/prefs-dialog.component';
import { humanReadableUrl } from '../../../../core/protocol/internet_connection';
import { FindingType } from '../../../../core/protocol/diagnostics';
import { PngAnalysis, PngChunkStatus } from '../../../../core/protocol/rft';

@Component({
    selector: 'app-station-info',
    imports: [CommonModule, HexPipe, FormsModule, MatButtonModule, MatButtonToggleModule, MatCheckboxModule, MatDialogModule, MatFormFieldModule, MatIconModule, MatListModule, MatSelectModule, MatTabsModule, MatTooltipModule],
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
	readonly prefs = prefs;
	readonly dialog = inject(MatDialog);

	@ViewChild('groupLog') groupLogEl?: ElementRef<HTMLDivElement>;
	stickToBottom = true;
	showRtInvisibleChars = false;
	private groupLogObserver?: MutationObserver;

	// Group log filters. Empty string means "no filter".
	logGroupChannelFilter = '';
	logStreamFilter = '';

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

	get rdsVariant() {
		return prefs.rdsVariant.value == "rds" ? RdsVariant.RDS : RdsVariant.RBDS;
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
					this.formatRtMessage(m),
					this.formatRtTransmission(m),
					this.station.rt_plus_app.enabled ?
						this.station.rt_plus_app.getHistoryEntry(m) :
						null));
		}
		return res;
	}

	private formatRtMessage(m: RdsStringHistoryEntry): string {
		return this.showRtInvisibleChars ? showInvisibleChars(m) : m.message;
	}

	private formatRtTransmission(m: RdsStringHistoryEntry): string {
		const parts = [];
		if (m.groupType != undefined) {
			parts.push(this.formatGroupType(m.groupType));
		}
		if (m.abFlag != undefined) {
			parts.push(`flag ${m.abFlag ? 'A' : 'B'}`);
		}
		return parts.join(', ');
	}

	public formatGroupType(group_type: number) {
		return `${group_type >> 1}${(group_type & 1) == 0 ? 'A' : 'B'}`;
	}
	
	public formatGroups(groups: number[]) {
		return groups.map(g => this.formatGroupType(g)).join(', ');
	}

	// Material icon name (also used as CSS class) and label per finding type.
	readonly findingTypes = {
		[FindingType.ERROR]: { icon: 'error', label: 'Error' },
		[FindingType.WARNING]: { icon: 'warning', label: 'Warning' },
		[FindingType.ADVICE]: { icon: 'lightbulb', label: 'Advice' },
	};

	// CSS class and label per PNG chunk status.
	readonly pngChunkStatuses = {
		[PngChunkStatus.INCOMPLETE]: { cls: 'png-chunk-incomplete', label: 'Incomplete' },
		[PngChunkStatus.CRC_OK]: { cls: 'png-chunk-ok', label: 'CRC OK' },
		[PngChunkStatus.CRC_ERROR]: { cls: 'png-chunk-error', label: 'CRC error' },
	};

	public getPngColorType(colorType: number): string {
		switch (colorType) {
			case 0: return 'Grayscale';
			case 2: return 'Truecolor';
			case 3: return 'Indexed (palette)';
			case 4: return 'Grayscale + alpha';
			case 6: return 'Truecolor + alpha';
			default: return `Invalid (${colorType})`;
		}
	}

	public getPngStatus(png: PngAnalysis): { cls: string, label: string } {
		if (png.errors.length > 0) {
			return { cls: 'png-status-error', label: 'Errors found' };
		} else if (png.ok) {
			return { cls: 'png-status-ok', label: 'Good' };
		} else {
			return { cls: 'png-status-incomplete', label: 'Incomplete' };
		}
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

	resetStation() {
		this.station.reset();
	}

	showAbout() {
		this.dialog.open(AboutComponent);
		return false;
	}

	showPrefs() {
		this.dialog.open(PrefsDialogComponent);
		return false;
	}

	humanReadableUrl(url: string) {
		return humanReadableUrl(url);
	}
}

class RtEntry {
	constructor(
		public id: number,
		public rt: string,
		public transmission: string,
		public rtPlus: Array<string> | null) {};
}

const WELL_KNOWN_ODAS = new Map<number, string>([
  [0x0093, "DAB cross-reference"],
	[0x0D45, "TMC/Alert-C testing"],
	[0x4400, "RDS Light"],
	[0x4AA1, "RASANT"],
	[0x4B02, "TMC/Alert-C with Alert-Plus"],  // Obsolete, reserved.
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
