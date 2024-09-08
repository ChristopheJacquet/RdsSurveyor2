import { Station } from "./base";

export class StationImpl implements Station {
  pi?: number;
  pty?: number;
  ptyn: RdsString = new RdsString(8);
  tp?: boolean;
  ta?: boolean;
  ps: RdsString = new RdsString(8);
  lps: RdsString = new RdsString(16);
  rt: RdsString = new RdsString(64);
  odas: Map<number, number> = new Map<number, number>();
  app_mapping: Map<number, string> = new Map<number, string>();
  datetime: string = "";
  group_stats: number[] = new Array<number>(32);

  setClockTime(mjd: number, hour: number, minute: number, tz_sign: boolean, tz_offset: number) {
    if(mjd >= 15079) {
      // The formulas below are valid from 1 March 1900 (MJD 15079).
      const yp = Math.floor((mjd - 15078.2)/365.25);
      const mp = Math.floor( ( mjd - 14956.1 - Math.floor(yp * 365.25) ) / 30.6001 );
      const day = mjd - 14956 - Math.floor( yp * 365.25 ) - Math.floor( mp * 30.6001 );
      const k = (mp == 14 || mp == 15) ? 1 : 0;
      const year = 1900 + yp + k;
      const month = mp - 1 - k * 12;

      this.datetime = 
        `${padNumber(hour, 2)}:${padNumber(minute, 2)}` +
        (tz_sign ? '-' : '+') + `${tz_offset*30}min ` +
        `${padNumber(year, 4)}-${padNumber(month, 2)}-${padNumber(day, 2)}`;
      //console.log("CT " + datetime);
    } else {
      // Ignore earlier dates.
      //console.log("CT invalid");
    }
  }

  getPS(): string {
    return this.ps.getLatestCompleteOrPartialText();
  }

  getRT(): string {
    return this.rt.getLatestCompleteOrPartialText();
  }

  addToGroupStats(type: number): void {
    this.group_stats[type]++;
  }

  constructor() {
    this.reset();
  }

  /**
   * Reset station data. Used when tuning a different station.
   */
  reset() {
    this.pi = -1;
    this.pty = undefined;
    this.ptyn.reset();
    this.tp = undefined;
    this.ta = undefined;
    this .ps.reset();
    this.lps.reset();
    this.rt.reset();
    this.odas.clear();
    this.app_mapping = new Map<number, string>([
      [0b00000, "group_0A"],
      [0b00001, "group_0B"],
      [0b00100, "group_2A"],
      [0b00101, "group_2B"],
      [0b01000, "group_4A"]]);
    this.datetime = "";
    this.group_stats.fill(0);
  }
}

function padNumber(num: number, width: number) {
  return num.toString().padStart(width, "0");
}

export class RdsString {
	currentText: number[];
	currentFlags: number = 0;
	messages = new Array<string>();
	latest: number = -1;
	empty: boolean = true;
	currentTicks: number = 0;
	tickHistory = new Map<string, number>();
	currentIndex: number = 0;

	constructor(size: number) {
		this.currentText = new Array<number>(size);
		this.reset();
	}
	
	public setByte(position: number, c: number): void {
		if (c != 0 && this.currentText[position] != 0 && c != this.currentText[position]) {
			// This is a new text: save the previous message...
			if (!this.empty) {
				const message = this.toString();
				this.messages.push(message);
				this.currentIndex++;
									
				const prev = this.tickHistory.get(message);
				this.tickHistory.set(message, this.currentTicks + (prev == null ? 0 : prev));

				// ... And reset the message buffer.
				this.reset();
			}
		}
		
		this.setByteInArray(this.currentText, position, c);
	}
	
	public setFlag(abFlag: number): void {
		this.currentFlags |= (1 << abFlag);   // Set a bit corresponding to the current flag.
		this.latest = abFlag;		
	}
	
	public reset(): void {
		this.currentText.fill(0);
		this.empty = true;
		this.currentTicks = 0;
	}
	

	public toString(): string {
		if(this.empty) return "";
		
		let res = "";
		
		for (let c of this.currentText) {
			if (c == 0x0D) break;
			if (c == 0) res += " ";
			else res += RDS_CHARMAP[c];
		}
		
		return res;
	}

	public getFlags(): number {
		return this.latest;
	}
	
	public getPastMessages(includingCurrent: boolean): Array<string> {
		if (!includingCurrent || this.empty) {
			return this.messages;
		}

		const l = [...this.messages];
		l.push(this.toString());
		return l;
	}

	private setByteInArray(text: number[], position: number, c: number): void {
		if (c != 0) {
			text[position] = c;
		}
		this.currentTicks++;
		this.empty = false;
	}

	public isComplete(): boolean {
		for (let c of this.currentText) {
			if(c == 0) return false;
		}
		return true;
	}
	
	public getMostFrequentText(): string {
		let mft = this.isComplete() ? this.toString() : "";
		let mftOcc = 0;
		
		this.tickHistory.forEach((value: number, key: string) => {
			if(value > mftOcc) {
				mftOcc = value;
				mft = key;
			}
		});
		
		return mft;
	}
	
	/**
	 * If the "most frequent" text is defined, return it. Otherwise, return
	 * the partial text being received.
	 * 
	 * @return the most frequent text if defined, the current text otherwise
	 */
	public getMostFrequentOrPartialText(): string {
		let text = this.getMostFrequentText();
		if(text.length == 0) text = this.toString();
		if(text == null) text = "";
		return text;
	}
	
	public getLatestCompleteOrPartialText(): string {
		if (this.isComplete()) {
			return this.toString();
		} else if (this.messages.length > 0) {
			return this.messages[this.messages.length-1];
		} else {
			const t = this.toString();
			if (t != null) return t; else return "";
		}

	}
	
	public getCurrentIndex(): number {
		return this.currentIndex;
	}
}

const CTRLCHAR = '\u2423';
	
const RDS_CHARMAP = new Array<string>(
  CTRLCHAR, CTRLCHAR, CTRLCHAR, CTRLCHAR, CTRLCHAR, CTRLCHAR, CTRLCHAR, CTRLCHAR,
  CTRLCHAR, CTRLCHAR, '\u240A', '\u240B', CTRLCHAR, '\u21B5', CTRLCHAR, CTRLCHAR,
  CTRLCHAR, CTRLCHAR, CTRLCHAR, CTRLCHAR, CTRLCHAR, CTRLCHAR, CTRLCHAR, CTRLCHAR,
  CTRLCHAR, CTRLCHAR, CTRLCHAR, CTRLCHAR, CTRLCHAR, CTRLCHAR, CTRLCHAR, '\u241F',
  '\u0020',	'\u0021', '\u0022',	'\u0023', '\u00A4',	'\u0025', '\u0026',	'\'',
  '\u0028',	'\u0029', '\u002A',	'\u002B', '\u002C',	'\u002D', '\u002E',	'\u002F',
  '\u0030',	'\u0031', '\u0032',	'\u0033', '\u0034',	'\u0035', '\u0036',	'\u0037',
  '\u0038',	'\u0039', '\u003A',	'\u003B', '\u003C',	'\u003D', '\u003E',	'\u003F',
  '\u0040',	'\u0041', '\u0042',	'\u0043', '\u0044',	'\u0045', '\u0046',	'\u0047',
  '\u0048',	'\u0049', '\u004A',	'\u004B', '\u004C',	'\u004D', '\u004E',	'\u004F',
  '\u0050',	'\u0051', '\u0052',	'\u0053', '\u0054',	'\u0055', '\u0056',	'\u0057',
  '\u0058',	'\u0059', '\u005A',	'\u005B', '\\',     '\u005D', '\u2015',	'\u005F',
  '\u2551',	'\u0061', '\u0062',	'\u0063', '\u0064',	'\u0065', '\u0066',	'\u0067',
  '\u0068',	'\u0069', '\u006A',	'\u006B', '\u006C',	'\u006D', '\u006E',	'\u006F',
  '\u0070',	'\u0071', '\u0072',	'\u0073', '\u0074',	'\u0075', '\u0076',	'\u0077',
  '\u0078',	'\u0079', '\u007A',	'\u007B', '\u007C',	'\u007D', '\u00AF',	'\u007F',
  '\u00E1',	'\u00E0', '\u00E9',	'\u00E8', '\u00ED',	'\u00EC', '\u00F3',	'\u00F2',
  '\u00FA',	'\u00F9', '\u00D1',	'\u00C7', '\u015E',	'\u00DF', '\u00A1',	'\u0132',
  '\u00E2',	'\u00E4', '\u00EA',	'\u00EB', '\u00EE',	'\u00EF', '\u00F4',	'\u00F6',
  '\u00FB',	'\u00FC', '\u00F1',	'\u00E7', '\u015F',	'\u011F', '\u0131',	'\u0133',
  '\u00AA',	'\u03B1', '\u00A9',	'\u2030', '\u011E',	'\u011B', '\u0148',	'\u0151',
  '\u03C0',	'\u20AC', '\u00A3',	'\u0024', '\u2190',	'\u2191', '\u2192',	'\u2193',
  '\u00BA', '\u00B9', '\u00B2',	'\u00B3', '\u00B1',	'\u0130', '\u0144',	'\u0171',
  '\u00B5',	'\u00BF', '\u00F7', '\u00B0', '\u00BC',	'\u00BD', '\u00BE',	'\u00A7',
  '\u00C1',	'\u00C0', '\u00C9',	'\u00C8', '\u00CD',	'\u00CC', '\u00D3',	'\u00D2',
  '\u00DA',	'\u00D9', '\u0158',	'\u010C', '\u0160',	'\u017D', '\u0110',	'\u013F',
  '\u00C2',	'\u00C4', '\u00CA',	'\u00CB', '\u00CE',	'\u00CF', '\u00D4',	'\u00D6',
  '\u00DB',	'\u00DC', '\u0159',	'\u010D', '\u0161',	'\u017E', '\u0111',	'\u0140',
  '\u00C3',	'\u00C5', '\u00C6', '\u0152', '\u0177',	'\u00DD', '\u00D5',	'\u00D8',
  '\u00DE',	'\u014A', '\u0154',	'\u0106', '\u015A',	'\u0179', '\u0166',	'\u00F0',
  '\u00E3',	'\u00E5', '\u00E6',	'\u0153', '\u0175',	'\u00FD', '\u00F5',	'\u00F8',
  '\u00FE',	'\u014B', '\u0155',	'\u0107', '\u015B',	'\u017A', '\u0167',	CTRLCHAR,
);
