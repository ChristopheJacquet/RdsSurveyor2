import { RtPlusApp } from './base';
import { Oda, RdsStringHistoryEntry, StationImpl } from './rds_types';

const classNames: Array<string> = [
  "DUMMY_CLASS",
  "ITEM.TITLE",
  "ITEM.ALBUM",
  "ITEM.TRACKNUMBER",
  "ITEM.ARTIST",
  "ITEM.COMPOSITION",
  "ITEM.MOVEMENT",
  "ITEM.CONDUCTOR",
  "ITEM.COMPOSER",
  "ITEM.BAND",
  "ITEM.COMMENT",
  "ITEM.GENRE",
  "INFO.NEWS",
  "INFO.NEWS.LOCAL",
  "INFO.STOCKMARKET",
  "INFO.SPORT",
  "INFO.LOTTERY",
  "INFO.HOROSCOPE",
  "INFO.DAILY_DIVERSION",
  "INFO.HEALTH",
  "INFO.EVENT",
  "INFO.SCENE",
  "INFO.CINEMA",
  "INFO.TV",
  "INFO.DATE_TIME",
  "INFO.WEATHER",
  "INFO.TRAFFIC",
  "INFO.ALARM",
  "INFO.ADVERTISEMENT",
  "INFO.URL",
  "INFO.OTHER",
  "STATIONNAME.SHORT",
  "STATIONNAME.LONG",
  "PROGRAMME.NOW",
  "PROGRAMME.NEXT",
  "PROGRAMME.PART",
  "PROGRAMME.HOST",
  "PROGRAMME.EDITORIAL_STAFF",
  "PROGRAMME.FREQUENCY",
  "PROGRAMME.HOMEPAGE",
  "PROGRAMME.SUBCHANNEL",
  "PHONE.HOTLINE",
  "PHONE.STUDIO",
  "PHONE.OTHER",
  "SMS.STUDIO",
  "SMS.OTHER",
  "EMAIL.HOTLINE",
  "EMAIL.STUDIO",
  "EMAIL.OTHER",
  "MMS.OTHER",
  "CHAT",
  "CHAT.CENTRE",
  "VOTE.QUESTION",
  "VOTE.CENTRE",
  "RFU-54",
  "RFU-55",
  "PRIVATE-56",
  "PRIVATE-57",
  "PRIVATE-58",
  "PLACE",
  "APPOINTMENT",
  "IDENTIFIER",
  "PURCHASE",
  "GET_DATA"
];

export class RtPlusAppImpl implements Oda, RtPlusApp {
  private station: StationImpl;
  private history = new Array<RTPlusItem>();
  public enabled: boolean = false;

  constructor(station: StationImpl) {
    this.station = station;
  }

  getName(): string {
    return "Radio Text Plus";
  }

  setTag(content_type: number, start: number, length: number): void {
    // TODO: Instead of enabling the app here, it should get enabled when a 3A
    // group is first encountered.
    this.enabled = true;

    if (content_type == 0) {
      return;
    }

    const rt = this.station.rt.toString();
    let text: string | null = null;
    if (rt != null) {
      if (start < rt.length) {
        // Beware, len is the _additional_ length!
        // We use Math.min(..., rt.length) to handle the case when the currently
        // received RT string is too short.
        const endIndex = Math.min(start + length + 1, rt.length);
        text = rt.substring(start, endIndex);
      }
    }
    // console.log(content_type + "/" + classNames[content_type] + "@" + start + ":" + length);
    // if (text != null) {
    //   console.log(" = \"" + text + "\"");
    // }

    if (length > 0) {
      this.addToHistory(this.station.rt.getCurrentId(), content_type, start, length);
    }
  }

	addToHistory(textId: number, type: number, start: number, length: number) {
		// Do not add anything if this type exists already for this index.
    for (let i of this.history) {
      if (i.textId == textId && i.type == type) {
        return;
      }
    }
		
		// Else add a new history entry.
		this.history.push(new RTPlusItem(textId, type, start, length));
	}

	getHistoryEntry(rtEntry: RdsStringHistoryEntry): Array<string> {
		let res = new Array<string>();

    for(let i of this.history) {
      if(i.textId == rtEntry.id) {
        // Handle the case when the currently received RT string is too short.
        const endIndex = Math.min(i.start + i.length + 1, rtEntry.message.length);

        res.push(`${classNames[i.type]} = "${rtEntry.message.substring(i.start, endIndex)}" `);
      }
    }
		
		return res;
	}

  reset() {
    this.history = [];
    this.enabled = false;
  }
}

class RTPlusItem {
  constructor(
    public textId: number,
    public type: number,
    public start: number,
    public length: number) {};
}
