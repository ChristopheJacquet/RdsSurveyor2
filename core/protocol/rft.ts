const MAX_SIZE = 163_840;
const MAX_CHUNKS = 512;
const GROUP_SIZE = 5;    // 5 bytes per group.

enum ByteState {
  ABSENT,
  PRESENT,
  CRC_OK,
  CRC_NOK,
}

enum CrcState {
  ABSENT,
  PRESENT,
}

export class RftPipe {
  data = new Uint8Array(MAX_SIZE);
  dataState = new Array<ByteState>(MAX_SIZE);
  crc = new Uint16Array(MAX_CHUNKS);
  crcState = new Array<CrcState>(MAX_CHUNKS);
  size: number = 0;
  fileId: number = 0;
  fileVersion: number = 0;
  crcPresent: boolean = false;

  reset() {
    this.dataState.fill(ByteState.ABSENT);
    this.crcState.fill(CrcState.ABSENT);
    this.size = 0;
    this.fileId = 0;
    this.fileVersion = 0;
    this.crcPresent = false;
  }

  constructor() {
    this.reset();
  }

  addGroup(addr: number, groupData: Uint8Array): boolean {
    if (groupData.length != GROUP_SIZE) {
      // TODO: Handle data with missing bytes.
      throw new Error(`RFT: Invalid group size (${groupData.length}`);
    }
    for (let i=0; i<GROUP_SIZE; i++) {
      this.data[GROUP_SIZE * addr + i] = groupData[i];
      this.dataState[GROUP_SIZE * addr + i] = ByteState.PRESENT;
    }

    return this.isComplete();
  }

  addCrc(mode: number, chunkAddr: number, crc: number) {
    // TODO: Handle mode.
    this.crc[chunkAddr] = crc;
    this.crcState[chunkAddr] = CrcState.PRESENT;
  }

  isComplete(): boolean {
    if (this.size > 0) {
      let presentCount = 0;
      for (let a=0; a<this.size; a++) {
        if (this.dataState[a] != ByteState.ABSENT) {
          presentCount++;
        }
      }
      return presentCount == this.size;
    }
    return false;
  }

  getData(): Blob | null {
    if (this.isComplete()) {
      return new Blob([this.data.slice(0, this.size)]);
    } else {
      return null;
    }
  }
}
