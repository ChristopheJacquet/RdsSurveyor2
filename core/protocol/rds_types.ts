import { RtPlusApp, Station } from "./base";
import { DabCrossRefAppImpl } from "./dab_cross_ref";
import { RtPlusAppImpl } from "./radio_text_plus";
import { callsign } from "./rbds_callsigns";

export class StationImpl implements Station {
  pi?: number;
  pty?: number;
  ptyn: RdsString = new RdsStringInRdsEncoding(8);
  tp?: boolean;
  ps: RdsString = new RdsStringInRdsEncoding(8);
  lps: RdsString = new RdsStringInUtf8(32);
  rt: RdsString = new RdsStringInRdsEncoding(64);
  rt_flag?: number;
	music?: boolean;
	di_dynamic_pty?: boolean;
	di_compressed?: boolean;
	di_artificial_head?: boolean;
	di_stereo?: boolean;
  afLists = new Map<number, AFList>();
  currentAfList: AFList | null = null;
  mappedAFs = new Map<number, Set<number>>();
  odas: Map<number, string> = new Map<number, string>([
    [0x0093, "group_dabxref"],
    [0x4BD7, "group_rtplus"],
  ]);
	transmitted_odas: Map<number, number> = new Map<number, number>();
  oda_3A_mapping: Map<number, string> = new Map<number, string>();
  app_mapping: Map<number, string> = new Map<number, string>();
  datetime: string = "";
  group_stats: number[] = new Array<number>(32);
	linkage_actuator?: boolean;
	pin_day?: number;
	pin_hour?: number;
	pin_minute?: number;
  ecc?: number;
  language_code?: number;
  other_networks = new Map<number, StationImpl>();

  // ODAs.
  rt_plus_app: RtPlusAppImpl = new RtPlusAppImpl(this);
  dab_cross_ref_app: DabCrossRefAppImpl = new DabCrossRefAppImpl();

  private ta_?: boolean;
  public trafficEvents = new Array<TrafficEvent>();

  private date: Date | null = null;

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
      this.date = new Date(year, month-1, day, hour, minute);
      //console.log("CT " + datetime);
    } else {
      // Ignore earlier dates.
      //console.log("CT invalid");
    }
  }

  getPS(): string {
    return this.ps.getLatestCompleteOrPartialText();
  }

  getStationName(): string {
    return this.ps.getMostFrequentOrPartialText();
  }

  getCallsign(): string {
    if (this.pi == undefined) {
      return "????";
    }

    const cs = callsign(this.pi);
    return cs == null ? "????" : cs;
  }

  /**
   * This method tries to reconstruct a message transmitted using (non-
   * standard) "dynamic PS".
   * 
   * <p>I have observed two main ways of transmitting "dynamic PS":</p>
   * <ul>
   *   <li>transmit successively full words, for instance: "YOU ARE ",
   *   "TUNED TO", "RADIO 99",</li>
   *   <li>scroll a message one letter at a time, for instance: "YOU ARE ",
   *   "OU ARE T", "U ARE TU", " ARE TUN", "ARE TUNE", "RE TUNED", 
   *   "E TUNED ", " TUNED T", "TUNED TO", "UNED TO ", "NED TO R", etc.</li>
   * </ul>
   * 
   * <p>
   * This methods identifies the type of transmission used, and tries to 
   * reconstruct the original message.
   * </p>
   * 
   * <p>
   * Note that the method should work even if the two types are mixed in a
   * given transmission. Note also that the method will work correctly only
   * if reception is good. If there are many missing blocks, it will not
   * make sense of the message. This is not a limitation of the method
   * itself, rather, it is caused by of the abusive use of PS to transmit
   * complex text, what PS is not designed for. 
   * </p>
   *  
   * @return the reconstructed message, limited to 80 characters in length
   */
  getDynamicPSmessage(): string {
    const msg = this.ps.getPastMessages(true);
    
    // Trivial case when there is no message.
    if (msg.length == 0) return "";
    
    let res = "";
    let prev: string|null = null;
    for (let i=0; i<msg.length && res.length < 80; i++) {
      const current = msg[i];
      let done = false;
      if (prev != null && prev.length == 8 && current.length == 8) {
        // if the 7 rightmost characters of the current PS correspond
        // to the 7 leftmost characters of the "previous" PS (going 
        // backward in time), then the PS is scrolling one character
        // at a time, so we just add *the* leftmost character at the
        // start
        if (prev.substring(0, 6) == current.substring(1, 7)) {
          res = current.charAt(0) + res;
          done = true;
        } else if (prev.substring(0, 5) == current.substring(2, 7)) {
          res = current.substring(0, 2) + res;
          done = true;
        }
      } 
      
      if(! done) {
        // otherwise, the PS is not scrolling, it's just displaying a
        // succession of 8-character words/sentences
        res = current.trim() + " " + res;
      }
      prev = current;
    }
    return res;
  }

  getLPS(): string {
    return this.lps.getLatestCompleteOrPartialText();
  }

  getRT(): string {
    return this.rt.getLatestCompleteOrPartialText();
  }

  getPTYN(): string {
    return this.ptyn.getLatestCompleteOrPartialText();
  }

  addToGroupStats(type: number): void {
    this.group_stats[type]++;
  }

  tickGroupDuration() {
    if (this.date != null) {
      this.date.setTime(this.date.getTime() + 1000/(1187.5/104));
    }
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
    this.ta_ = undefined;
    this.trafficEvents = [];
    this .ps.reset();
    this.lps.reset();
    this.rt.reset();
    this.music = undefined;
    this.di_dynamic_pty = undefined;
    this.di_compressed = undefined;
    this.di_artificial_head = undefined;
    this.di_stereo = undefined;
    this.afLists = new Map<number, AFList>();
    this.currentAfList = null;
    this.linkage_actuator = undefined;
    this.pin_day = undefined;
    this.pin_hour = undefined;
    this.pin_minute = undefined;
    this.ecc = undefined;
    this.language_code = undefined;
    this.transmitted_odas.clear();
    this.other_networks.clear();

    this.app_mapping = new Map<number, string>([
      [GROUP_0A, "group_0A"],
      [GROUP_0B, "group_0B_0_common"],
      [GROUP_1A, "group_1A"],
      [GROUP_1B, "group_1B_1_common"],
      [GROUP_2A, "group_2A"],
      [GROUP_2B, "group_2B"],
      [GROUP_3A, "group_3A"],
      [GROUP_4A, "group_4A"],
      [GROUP_10A, "group_10A"],
      [GROUP_14A, "group_14A"],
      [GROUP_14B, "group_14B"],
      [GROUP_15A, "group_15A"]]);
    this.datetime = "";
    this.group_stats.fill(0);

    // Reset ODAs.
    this.rt_plus_app.reset();
    this.dab_cross_ref_app.reset();
  }

	public addAfPair(a: number, b: number) {
		if (isAfListLengthIndicator(a)) {
			if (b >= 0 && b <= 205) {
				const afList = this.afLists.get(b);
				if (afList == undefined) {
					this.currentAfList = new AFList(b);
					this.afLists.set(b, this.currentAfList);
				} else {
          this.currentAfList = afList;
        }
			}
		} else {
			if(a >= 0 && a <= 205 && b >= 0 && b <= 205) {
        if (this.currentAfList == null || !this.currentAfList.addPair(a, b)) {
					// This means that the method addPair has determined that
					// the new AF pair cannot belong to the existing list.
					// So create a new list.
					this.currentAfList = new AFList(-1);
					this.currentAfList.addPair(a, b);
				}
			}
		}
	}

  /**
   * @brief Adds a mapped frequency.
   * 
   * @param channel The tuned (current) frequency, represented as a channel number
   * @param mappedChannel The mapped (other) frequency, represented as a channel number
   * 
   * @return A textual representation of the mapping
   */
  public addMappedAF(channel: number, mappedChannel: number) {
    const freq = channelToFrequency(channel);
    const mappedFreq = channelToFrequency(mappedChannel);
    
    // Get the set of AFs mapped to the frequency "freq".
    let listOfMappedFreqs = this.mappedAFs.get(freq);

    // If no such set, create it.
    if(listOfMappedFreqs == undefined) {
      listOfMappedFreqs = new Set<number>();
      this.mappedAFs.set(freq, listOfMappedFreqs);
    }
    
    // Add the new mapped frequency.
    listOfMappedFreqs.add(mappedFreq);
  }

  public set ta(ta: boolean) {
    if (this.ta_ != undefined && this.ta_ != ta) {
      this.trafficEvents.push(new TrafficAnnouncement(
        this.date != null ? new Date(this.date) : null,
        ta ? TrafficEventType.START : TrafficEventType.END));
    }
    this.ta_ = ta;
  }

  public get ta(): boolean {
    return this.ta_ || false;
  }

  public getISOCountryCode(): string {
    if (this.pi == undefined || this.ecc == undefined) {
      return '';
    }

    const piCC = (this.pi & 0xF000) >> 12;

    switch (this.ecc) {
      case 0xE0: return ECC_E0[piCC];
      case 0xE1: return ECC_E1[piCC];
      case 0xE2: return ECC_E2[piCC];
      case 0xE3: return ECC_E3[piCC];
      case 0xE4: return ECC_E4[piCC];
      case 0xD0: return ECC_D0[piCC];
      case 0xD1: return ECC_D1[piCC];
      case 0xD2: return ECC_D2[piCC];
      case 0xD3: return ECC_D3[piCC];
      case 0xA0: return ECC_A0[piCC];
      case 0xA1: return ECC_A1[piCC];
      case 0xA2: return ECC_A2[piCC];
      case 0xA3: return ECC_A3[piCC];
      case 0xA4: return ECC_A4[piCC];
      case 0xA5: return ECC_A5[piCC];
      case 0xA6: return ECC_A6[piCC];
      case 0xF0: return ECC_F0[piCC];
      case 0xF1: return ECC_F1[piCC];
      case 0xF2: return ECC_F2[piCC];
      case 0xF3: return ECC_F3[piCC];
      case 0xF4: return ECC_F4[piCC];
      default: return 'Invalid';
    }
  }
  
  public getCountryName(): string {
    const isoCC = this.getISOCountryCode();

    if (isoCC == '') {
      return '';
    }

    try {
      const regionNamesInEnglish = new Intl.DisplayNames(['en'], { type: 'region' });
      return regionNamesInEnglish.of(isoCC) || isoCC;
    } catch {
      return isoCC;
    }
  }

  public getLanguage(): string {
    if (this.language_code == undefined) {
      return '';
    }

    const code = this.language_code & 0x7F;
    if (code < 0 || code > 127) {
      return 'Invalid';
    }

    return LANGUAGE_CODES[code][0];
  }

  reportOtherNetworkSwitch(pi: number, ta: boolean): void {
    const on = this.other_networks.get(pi);
    if (on == undefined) {
      return;
    }
    const event = new OtherNetworkSwitch(
      this.date != null ? new Date(this.date) : null,
      ta ? TrafficEventType.START : TrafficEventType.END,
      on
    )

    // Deduplicate series of similar events.
    if (this.trafficEvents.length > 0) {
      const prevEvent = this.trafficEvents[this.trafficEvents.length-1];
      if (prevEvent instanceof OtherNetworkSwitch && 
        prevEvent.otherNetwork == on && prevEvent.eventType == event.eventType) {
          return;
        }
    }

    this.trafficEvents.push(event);
  }

}

function padNumber(num: number, width: number) {
  return num.toString().padStart(width, "0");
}

export abstract class RdsString {
  currentText: Uint8Array;
  currentFlags: number = 0;
  messages = new Array<string>();
  latest: number = -1;
  empty: boolean = true;
  currentTicks: number = 0;
  tickHistory = new Map<string, number>();
  currentIndex: number = 0;

  constructor(size: number) {
    this.currentText = new Uint8Array(size);
    this.reset();
  }
  
  public setByte(position: number, c: number): void {
    if (c != 0 && this.currentText[position] != 0 && c != this.currentText[position]) {
      // This is a new text: save the previous message...
      if (!this.empty) {
        const message = this.toString();
        this.messages.unshift(message);  // Newest messages on top.
        this.currentIndex++;
                  
        const prev = this.tickHistory.get(message);
        this.tickHistory.set(message, this.currentTicks + (prev == null ? 0 : prev));

        // ... And reset the message buffer.
        this.currentText.fill(0);
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
    this.messages = [];
    this.tickHistory.clear();
  }
  
  public abstract toString(): string;

  public getFlags(): number {
    return this.latest;
  }
  
  public getPastMessages(includingCurrent: boolean): Array<string> {
    if (!includingCurrent || this.empty) {
      return this.messages;
    }

    const l = [this.toString(), ...this.messages];
    return l;
  }

  private setByteInArray(text: Uint8Array, position: number, c: number): void {
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

function isAfListLengthIndicator(af: number): boolean {
  return af >= 224 && af <= 249;
}

/**
 * @brief Converts an RDS channel code to a frequency.
 * 
 * @param channel The RDS channel (an integer in the 0–205 range, 205 being the filler code)
 * @return The frequency in multiples of 100 kHz, or -1 for the filler code, or 0 if an invalid
 * code was supplied
 */
function channelToFrequency(channel: number): number {
  if (channel >= 0 && channel <= 204) return 875 + channel;
  else if (channel == 205) return -1;     // -1 = filler code.
  else return 0;
}

class AFList {
	public transmitterFrequency: number;
  public afs = new Set<number>();
	public method = '?';
	
	constructor(transmitterFrequency: number) {
		this.transmitterFrequency = channelToFrequency(transmitterFrequency);
	}
	
	public addPair(a: number, b: number): boolean {
		const fA = channelToFrequency(a);
		const fB = channelToFrequency(b);
		const typeIfB = fA < fB ? "same" : "variant"; 
		if (fA == this.transmitterFrequency && fA > 0) {  // method B.
			this.method = 'B';
			if (fB > 0) this.afs.add(fB);
			return true;
		} else if (fB == this.transmitterFrequency && fB > 0) {  // method B.
			this.method = 'B';
			if (fA > 0) this.afs.add(fA);
			return true;
		} else if (fA > 0 || fB > 0){  // method A.
			if (this.transmitterFrequency != 0) {
				if (this.method == 'B') {
					// If the two frequencies are transmitted
					// if a transmitter frequency has previously been provided
					// if none of them corresponds to the transmitter frequency
					// and if method B had been identified...
					// then the only possible explanation is that a new B-list has
					// begun. So we return false, so that the caller creates a new AFList.
					return false;
				} // else
				this. method = 'A';
			}
			if (fA > 0) {
				this.afs.add(fA);
			}
			if (fB > 0) {
				this.afs.add(fB);
			}
			return true;
		} else return true;
	}
}

export class RdsStringInRdsEncoding extends RdsString {
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
}

export class RdsStringInUtf8 extends RdsString {
  public toString(): string {
    let a = this.currentText;
    // If there is a 0 byte, it marks the end of the string, so we need to cut
    // it there.
    const l = a.indexOf(0);
    if (l >= 0) {
      a = a.slice(0, l);
    }

    const utf8decoder = new TextDecoder("utf-8");
    return utf8decoder.decode(a);
  }
}

export interface Oda {
  getName(): string;
  enabled: boolean;
  reset(): void;
}

enum TrafficEventType {
  START,
  END,
}

export abstract class TrafficEvent {
  date: Date | null;
  eventType: TrafficEventType;

  constructor(date: Date | null, eventType: TrafficEventType) {
    this.date = date;
    this.eventType = eventType;
  }

  public toString() {
    return (this.date != null ? 
      `${padNumber(this.date.getHours(), 2)}:${padNumber(this.date.getMinutes(), 2)}:`
      + `${padNumber(this.date.getSeconds(), 2)}: ` : "")
      + this.formatEvent();
  }

  protected abstract formatEvent(): string;
}

class TrafficAnnouncement extends TrafficEvent {
  constructor(date: Date | null, eventType: TrafficEventType) {
    super(date, eventType);
  }

  protected formatEvent(): string {
      return (this.eventType == TrafficEventType.START ? "Start" : "End")
        + " of traffic announcement.";
  }
}

class OtherNetworkSwitch extends TrafficEvent {
  otherNetwork: StationImpl;

  constructor(date: Date | null, eventType: TrafficEventType, otherNetwork: StationImpl) {
    super(date, eventType);
    this.otherNetwork = otherNetwork;
  }

  protected formatEvent(): string {
      const msg = this.eventType == TrafficEventType.START ?
        "Switch now to Other Network" : "Switch back from Other Network";
      
      const pi = this.otherNetwork.pi == undefined ?
        '----' : this.otherNetwork.pi.toString(16).toUpperCase().padStart(4, '0');


      return `${msg}: PI=${pi} (${this.otherNetwork.getPS()}).`;
  }
}

// Group type constants.
const GROUP_0A = 0b00000;
const GROUP_0B = 0b00001;
const GROUP_1A = 0b00010;
const GROUP_1B = 0b00011;
const GROUP_2A = 0b00100;
const GROUP_2B = 0b00101;
const GROUP_3A = 0b00110;
const GROUP_3B = 0b00111;
const GROUP_4A = 0b01000;
const GROUP_4B = 0b01001;
const GROUP_5A = 0b01010;
const GROUP_5B = 0b01011;
const GROUP_6A = 0b01100;
const GROUP_6B = 0b01101;
const GROUP_7A = 0b01110;
const GROUP_7B = 0b01111;
const GROUP_8A = 0b10000;
const GROUP_8B = 0b10001;
const GROUP_9A = 0b10010;
const GROUP_9B = 0b10011;
const GROUP_10A = 0b10100;
const GROUP_10B = 0b10101;
const GROUP_11A = 0b10110;
const GROUP_11B = 0b10111;
const GROUP_12A = 0b11000;
const GROUP_12B = 0b11001;
const GROUP_13A = 0b11010;
const GROUP_13B = 0b11011;
const GROUP_14A = 0b11100;
const GROUP_14B = 0b11101;
const GROUP_15A = 0b11110;
const GROUP_15B = 0b11111;

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

const ECC_E0 = ["  ", "DE", "DZ", "AD", "IL", "IT", "BE", "RU", "PS", "AL", "AT", "HU", "MT", "DE", "  ", "EG"];
const ECC_E1 = ["  ", "GR", "CY", "SM", "CH", "JO", "FI", "LU", "BG", "DK", "GI", "IQ", "GB", "LY", "RO", "FR"];
const ECC_E2 = ["  ", "MA", "CZ", "PL", "VA", "SK", "SY", "TN", "  ", "LI", "IS", "MC", "LT", "RS/YU", "ES", "NO"];
const ECC_E3 = ["  ", "ME", "IE", "TR", "MK", "TJ", "  ", "  ", "NL", "LV", "LB", "AZ", "HR", "KZ", "SE", "BY"];
const ECC_E4 = ["  ", "MD", "EE", "KG", "  ", "  ", "UA", "KS", "PT", "SI", "AM", "UZ", "GE", "  ", "TM", "BA"];
const ECC_D0 = ["  ", "CM", "DZ/CF", "DJ", "MG", "ML", "AO", "GQ", "GA", "  ", "ZA", "BF", "CG", "TG", "BJ", "MW"];
const ECC_D1 = ["  ", "NA", "LR", "GH", "MR", "CV/ST", "  ", "SN", "GM", "BI", "??", "BW", "KM", "TZ", "ET", "NG"];
const ECC_D2 = ["  ", "SL", "ZW", "MZ", "UG", "SZ", "GN", "SO", "NE", "TD", "GW", "CD", "CI", "  ", "ZM", "ER"];
const ECC_D3 = ["  ", "  ", "  ", "EH", "??", "RW", "LS", "  ", "SC", "  ", "MU", "  ", "SD", "  ", "  ", "  "];
const ECC_A0 = ["  ", "US", "US", "US", "US", "US", "US", "US", "US", "US", "US", "US", "  ", "US", "US", "  "];
const ECC_A1 = ["  ", "  ", "  ", "  ", "  ", "  ", "  ", "  ", "  ", "  ", "  ", "CA", "CA", "CA", "CA", "GL"];
const ECC_A2 = ["  ", "AI", "AG", "EC", "  ", "BB", "BZ", "KY", "CR", "CU", "AR", "BR", "BM", "AN", "GP", "BS"];
const ECC_A3 = ["  ", "BO", "CO", "JM", "MQ", "GF", "PY", "NI", "  ", "PA", "DM", "DO", "CL", "GD", "  ", "GY"];
const ECC_A4 = ["  ", "GT", "HN", "AW", "  ", "MS", "TT", "PE", "SR", "UY", "KN", "LC", "SV", "HT", "VE", "  "];
const ECC_A5 = ["  ", "  ", "  ", "  ", "  ", "  ", "  ", "  ", "  ", "  ", "  ", "MX", "VC", "MX", "MX", "MX/VG"];
const ECC_A6 = ["  ", "  ", "  ", "  ", "  ", "  ", "  ", "  ", "  ", "  ", "  ", "  ", "  ", "  ", "  ", "PM"];
const ECC_F0 = ["  ", "AU", "AU", "AU", "AU", "AU", "AU", "AU", "AU", "SA", "AF", "MM", "CN", "KP", "BH", "MY"];
const ECC_F1 = ["  ", "KI", "BT", "BD", "PK", "FJ", "OM", "NR", "IR", "NZ", "SB", "BN", "LK", "TW", "KR", "HK"];
const ECC_F2 = ["  ", "KW", "QA", "KH", "WS", "IN", "MO", "VN", "PH", "JP", "SG", "MV", "ID", "AE", "NP", "VU"];
const ECC_F3 = ["  ", "LA", "TH", "TO", "  ", "  ", "  ", "  ", "  ", "PG", "  ", "YE", "  ", "  ", "FM", "MN"];
const ECC_F4 = ["  ", "  ", "  ", "  ", "  ", "  ", "  ", "  ", "  ", "  ", "  ", "  ", "  ", "  ", "  ", "  "];

const LANGUAGE_CODES: Array<Array<string>> = [
  ["Unknown", "??"], // 0
  ["Albanian", "sq"],
  ["Breton", "br"],
  ["Catalan", "ca"],
  ["Croatian", "hr"],
  ["Welsh", "cy"],
  ["Czech", "cs"],
  ["Danish", "da"],
  ["German", "de"],
  ["English", "en"],
  ["Spanish", "es"], // 10
  ["Esperanto", "eo"],
  ["Estonian", "et"],
  ["Basque", "eu"],
  ["Faroese", "fo"],
  ["French", "fr"],
  ["Frisian","fy"],
  ["Irish", "ga"],
  ["Gaelic", "gd"],
  ["Galician", "gl"],
  ["Icelandic", "is"], // 20
  ["Italian", "it"],
  ["Lappish", "-lappish-"],
  ["Latin", "la"],
  ["Latvian", "lv"],
  ["Luxembourgian", "lb"],
  ["Lithuanian", "lt"],
  ["Hungarian", "hu"],
  ["Maltese", "mt"],
  ["Dutch", "nl"],
  ["Norwegian", "nn"], // 30
  ["Occitan", "oc"],
  ["Polish", "pl"],
  ["Portuguese", "pt"],
  ["Romanian", "ro"],
  ["Romansh", "rm"],
  ["Serbian", "sr"],
  ["Slovak", "sk"],
  ["Slovene", "sl"],
  ["Finnish", "fi"],
  ["Swedish", "sv"], // 40
  ["Turkish", "tr"],
  ["Flemish", "-flemish-"],
  ["Walloon", "wa"],
  ["<2C>", "2C"],
  ["<2D>", "2D"],
  ["<2E>", "2E"],
  ["<2F>", "2F"],
  ["<30>", "30"],
  ["<31>", "31"],
  ["<32>", "32"], // 50
  ["<33>", "33"],
  ["<34>", "34"],
  ["<35>", "35"],
  ["<36>", "36"],
  ["<37>", "37"],
  ["<38>", "38"],
  ["<39>", "39"],
  ["<3A>", "3A"],
  ["<3B>", "3B"],
  ["<3C>", "3C"], // 60
  ["<3D>", "3D"],
  ["<3E>", "3E"],
  ["<3F>", "3F"],
  ["Void", "-void-"],
  ["<41>", "41"],
  ["<42>", "42"],
  ["<43>", "43"],
  ["<44>", "44"],
  ["Zulu", "zu"], 
  ["Vietnamese", "vi"], // 70
  ["Uzbek", "uz"],
  ["Urdu", "ur"],
  ["Ukrainian", "uk"],
  ["Thai", "th"],
  ["Telugu", "te"],
  ["Tatar", "tt"],
  ["Tamil", "ta"],
  ["Tadzhik", "tg"],
  ["Swahili", "sw"],
  ["Sranan Tongo", "-sranan-tongo-"], // 80
  ["Somali", "so"],
  ["Sinhalese", "si"],
  ["Shona", "sn"],
  ["Serbo-Croat", "sh"],
  ["Ruthenian", "-ruthenian-"],
  ["Russian", "ru"],
  ["Quechua", "qu"],
  ["Pushtu", "ps"],
  ["Punjabi", "pa"],
  ["Persian", "fa"], // 90
  ["Papamiento", "-papamiento-"],
  ["Oriya", "or"],
  ["Nepali", "ne"],
  ["Ndebele", "nr"],
  ["Marathi", "mr"],
  ["Moldavian", "mo"],
  ["Malaysian", "ms"],
  ["Malagasay", "mg"],
  ["Macedonian", "mk"],
  ["Laotian", "lo"], // 100
  ["Korean", "ko"],
  ["Khmer", "km"],
  ["Kazakh", "kk"],
  ["Kannada", "kn"],
  ["Japanese", "ja"],
  ["Indonesian", "id"],
  ["Hindi", "hi"],
  ["Hebrew", "he"],
  ["Hausa", "ha"],
  ["Gurani", "gn"], // 110
  ["Gujurati", "gu"],
  ["Greek", "el"],
  ["Georgian", "ka"],
  ["Fulani", "ff"],
  ["Dari", "fa"],
  ["Churash", "cv"],
  ["Chinese", "zh"],
  ["Burmese", "my"],
  ["Bulgarian", "bg"],
  ["Bengali", "bn"], // 120
  ["Belorussian", "be"],
  ["Bambora", "bm"],
  ["Azerbijani", "az"],
  ["Assamese", "as"],
  ["Armenian", "hy"],
  ["Arabic", "ar"],
  ["Amharic", "am"] // 127
];
