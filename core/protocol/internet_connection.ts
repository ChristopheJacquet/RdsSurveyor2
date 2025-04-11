import { InternetConnectionApp } from "./base";
import { Oda, RdsStringInUnicode, StationImpl } from "./rds_types";

export enum InternetLinkType {
  AUDIO = 0,
  RDS_NFM = 1,
  SLIDESHOW_IMAGE = 2,
  SLIDESHOW_SLIDE = 3,
  STATION_LOGO = 4,
  UNSPECIFIED,
}

function internetLinkTypeToString(t: InternetLinkType) {
  switch (t) {
    case InternetLinkType.AUDIO: return "Audio";
    case InternetLinkType.RDS_NFM: return "RDS NFM";
    case InternetLinkType.SLIDESHOW_IMAGE: return "Slideshow image";
    case InternetLinkType.SLIDESHOW_SLIDE: return "Slideshow slide";
    case InternetLinkType.STATION_LOGO: return "Station logo";
    default: return '?';
  }
}

function stringCodeToLinkType(code: string): InternetLinkType {
  switch (code) {
    case "00": return InternetLinkType.AUDIO;
    case "01": return InternetLinkType.RDS_NFM;
    case "02": return InternetLinkType.SLIDESHOW_IMAGE;
    case "03": return InternetLinkType.SLIDESHOW_SLIDE;
    case "04": return InternetLinkType.STATION_LOGO;
  }
  return InternetLinkType.UNSPECIFIED;
}

export function humanReadableUrl(url: string) {
  return internetLinkTypeToString(stringCodeToLinkType(url.substring(0, 2))) +
    ": " + url.substring(2);
}

export class InternetConnectionAppImpl implements Oda, InternetConnectionApp {
  private station: StationImpl;
  public enabled: boolean = false;
  url: RdsStringInUnicode = new RdsStringInUnicode(128);

  constructor(station: StationImpl) {
    this.station = station;
  }

  getName(): string {
    throw new Error('Internet Connection');
  }

  reset() {
    this.enabled = false;
  }
}
