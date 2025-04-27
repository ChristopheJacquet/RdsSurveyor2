import { RpApp } from './base';
import { RDS_CHARMAP, RdsString, StationImpl } from './rds_types';

export class RpAppImpl implements RpApp {
  private station: StationImpl;
  public enabled: boolean = false;
  public messages = Array<Message>();

  constructor(station: StationImpl) {
    this.station = station;
  }

  newBeepMessage(flag_ab: boolean): void {
    this.startNewMessageIfNeeded(flag_ab, () => new MessageBeep());
  }

  new10dMessage(flag_ab: boolean): void {
    this.startNewMessageIfNeeded(flag_ab, () => new Message10d());
  }

  new18dMessage(flag_ab: boolean): void {
    this.startNewMessageIfNeeded(flag_ab, () => new Message18d());
  }

  newAlphaMessage(flag_ab: boolean): void {
    this.startNewMessageIfNeeded(flag_ab, () => new MessageAlpha());
  }

  reportAddress(flag_ab: boolean, y1: number, y2: number, z1: number, z2: number, z3: number, z4: number): void {
    // No need to check flag_ab because the construction of the message is done
    // when parsing the same group.
    this.messages[0].address = `${y1}${y2}/${z1}${z2}${z3}${z4}`;
  }

  reportBeep(flag_ab: boolean): void {
    this.startNewMessageIfNeeded(flag_ab, () => new MessageBeep());
  }

  report10dPart(flag_ab: boolean, addr: number, d1: number, d2: number): void {
    this.startNewMessageIfNeeded(flag_ab, () => new Message10d());
    this.messages[0].setChar(addr*2, d1);
    this.messages[0].setChar(addr*2+1, d2);
  }

  report18dPart(flag_ab: boolean, addr: number, d1: number, d2: number): void {
    this.startNewMessageIfNeeded(flag_ab, () => new Message18d());
    this.messages[0].setChar(addr*2, d1);
    this.messages[0].setChar(addr*2+1, d2);
  }

  reportAlphaPart(flag_ab: boolean, addr: number, offset: number, c1: number, c2: number, last: boolean): void {
    this.startNewMessageIfNeeded(flag_ab, () => new MessageAlpha());
    let index;
    if (addr < 7) {
      index = (addr-1)*4+offset*2;   // addr is 1-based.
      // Never go back.
      while (index < this.messages[0].lastWrittenIndex) {
        index += 24;
      }
    } else {
      index = this.messages[0].lastWrittenIndex + 1;
    }
    this.messages[0].setChar(index, c1);
    this.messages[0].setChar(index+1, c2);
    if (last) {
      this.messages[0].setLength(index+2);
    }
  }

  getName(): string {
    throw new Error('Radio Paging');
  }

  private startNewMessageIfNeeded(flag_ab: boolean, createFunc: () => Message) {
    if (this.messages.length > 0 && flag_ab == this.messages[0].flag_ab) {
      return;
    }
    const newMessage = createFunc();
    newMessage.flag_ab = flag_ab;
    this.messages.unshift(newMessage);
    this.enabled = true;
  }

  reset() {
    this.enabled = false;
    this.messages =  [];
  }
}

abstract class Message {
  public address: string = "";
  public readonly type: string = "";
  public flag_ab: boolean = false;
  public lastWrittenIndex = 0;

  public abstract get message(): string;

  protected msg_: Array<number | undefined> = [];

  public setChar(pos: number, char: number) {
    this.msg_[pos] = char;
    this.lastWrittenIndex = pos;
  }

  public setLength(len: number) {
    this.msg_.length = len;
  }
}

abstract class MessageNumeric extends Message {
  public get message(): string {
    return this.msg_.map((d) => d != undefined ? NUMERIC_CHARMAP[d]  : UNKNWON_CHAR).join("");
  }
}

class MessageBeep extends Message {
  override type = "Beep";
  override msg_ = new Array<number | undefined>(0);

  public get message(): string {
    return "";
  }
}

class Message10d extends MessageNumeric {
  override type = "10-digit";
  override msg_ = new Array<number | undefined>(10);

  constructor() {
    super();
    this.msg_.fill(undefined);
  }
}

class Message18d extends MessageNumeric {
  override type = "18-digit";
  override msg_ = new Array<number | undefined>(18);

  constructor() {
    super();
    this.msg_.fill(undefined);
  }
}

class MessageAlpha extends Message {
  override type = "Alphanumeric";
  override msg_ = new Array<number | undefined>(80);

  public get message(): string {
    return this.msg_.map((d) => d != undefined && d>=0 && d <= 255 ? RDS_CHARMAP[d] : UNKNWON_CHAR).join("");
  }

  constructor() {
    super();
    this.msg_.fill(undefined);
  }
}

const UNKNWON_CHAR = "\uFFFD";

const NUMERIC_CHARMAP = [
  "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", " ", "!", "!", "!", "!", "!"
];
