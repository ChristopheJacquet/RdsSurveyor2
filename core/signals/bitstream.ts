import { RdsReportEventListener, RdsReportEventType } from "../drivers/input";

// Number of good blocks needed after initial block to confirm synchronization.
const SYNC_THRESHOLD = 2;

// Number of groups for the good blocks above to be received.
const SYNC_CONFIRM_DURATION = 5;

// Lose synchronization after that many groups without a good block.
const SYNC_LOSS_DURATION = 10;

const MAT_H: number[] = [
  0x31B, 0x38F, 0x2A7, 0x0F7, 0x1EE, 0x3DC, 0x201, 0x1BB, 0x376, 0x355,
  0x313, 0x39F, 0x287, 0x0B7, 0x16E, 0x2DC, 0x001, 0x002, 0x004, 0x008,
  0x010, 0x020, 0x040, 0x080, 0x100, 0x200
];

const BLOCK_SIZE = 26;
const BLOCKS_PER_GROUP = 4;
const GROUP_SIZE = BLOCKS_PER_GROUP * BLOCK_SIZE;

const SYNDROMES: number[][] = [[0x3D8, 0x3D8], [0x3D4, 0x3D4], [0x25C, 0x3CC], [0x258, 0x258]];

enum BitInversion {
  AUTO, INVERT, NOINVERT
}

enum Status {
  NOT_SYNCED, SYNCED
}

class SyncEntry {
  public constructor(public bitTime: number, public block: number) {}

  public toString(): string {
    return `${this.block.toString(16).padStart(4, '0')}@${this.bitTime}`;
  }
}

function calcSyndrome(block: number): number {
  let synd = 0;
  for (let i = 0; i < BLOCK_SIZE; i++) {
    if ((block & 1) != 0) synd ^= MAT_H[i];
    block >>= 1;
  }
  return synd;
}

export class BitStreamSynchronizer {
	private inversion: BitInversion = BitInversion.AUTO;
	
	private block = 0;        // block contents
	private blockCount = 0;   // block counter within group
	private bitCount = 0;     // bit count within block
	private group = new Uint16Array(BLOCKS_PER_GROUP);   // group
	public synced = false;
	private nbOk = 0;
	private blocksOk: Array<boolean> = [false, false, false, false];
	private nbUnsync = 0;
	private groupCount = 0;
	private bitTime = 0;
  private unreportedUnsyncedBits = 0;
	private negativePolarity = false;
	private nbSyncAtOffset: SyncEntry[][][][] = [];
  private listener: RdsReportEventListener;
	
	public constructor(listener: RdsReportEventListener) {
    this.listener = listener;
		this.eraseSyncArray();
	}
	
	private eraseSyncArray() {
    this.nbSyncAtOffset = new Array(BLOCK_SIZE);
		for (let i=0; i<this.nbSyncAtOffset.length; i++) {
      this.nbSyncAtOffset[i] = new Array(BLOCKS_PER_GROUP);
			for (let j=0; j<this.nbSyncAtOffset[i].length; j++) {
        this.nbSyncAtOffset[i][j] = new Array(2);
				for (let k=0; k<this.nbSyncAtOffset[i][j].length; k++) {
					this.nbSyncAtOffset[i][j][k] = [];
        }
      }
    }
	}

  public addBit(bit: boolean) {
    this.block = (this.block << 1) & 0x3FFFFFF;
    if (bit) this.block |= 1;
    this.bitCount++;
    this.bitTime++;
          
    if (!this.synced) {
      const synd: number[] = [ calcSyndrome(this.block), calcSyndrome(~this.block) ];
      
      outer_loop:
      for (let i=0; i<BLOCKS_PER_GROUP; i++) {
        for (let j=0; j<2; j++) {
          if (j==0 && this.inversion == BitInversion.INVERT ||
              j==1 && this.inversion == BitInversion.NOINVERT) continue;
          if (synd[j] == SYNDROMES[i][0] || synd[j] == SYNDROMES[i][1]) {
            const offset = this.bitTime % BLOCK_SIZE;
            const pseudoBlock = (Math.floor(this.bitTime / BLOCK_SIZE) + BLOCKS_PER_GROUP - i) % BLOCKS_PER_GROUP;

            console.log("[" + (j==0 ? "+" : "-") + (String.fromCharCode(65+i)) + ":" + offset + "/" + pseudoBlock + "]");

            // Add current time and block to the list of syndrome hits.
            const block = (this.block >> 10) & 0xFFFF;
            this.nbSyncAtOffset[offset][pseudoBlock][j].push(
              new SyncEntry(this.bitTime, block));

            // Weed out out-of-time hits.
            while (this.nbSyncAtOffset[offset][pseudoBlock][j][0].bitTime < this.bitTime - SYNC_CONFIRM_DURATION * GROUP_SIZE)
              this.nbSyncAtOffset[offset][pseudoBlock][j].shift();

            // Are we above threshold?
            if (this.nbSyncAtOffset[offset][pseudoBlock][j].length > SYNC_THRESHOLD) {
              this.synced = true;
              this.unreportedUnsyncedBits = 0;

              this.group[i] = block;
              this.blockCount = (i+1) % BLOCKS_PER_GROUP;
              this.bitCount = 0;
              this.nbOk = 1;
              for (let k=0; k<BLOCKS_PER_GROUP; k++) this.blocksOk[k] = (k == i);
              this.negativePolarity = (j==1);

              // Fill in the previous blocks.
              {
                const syncEntries = this.nbSyncAtOffset[offset][pseudoBlock][j];
                let bt = syncEntries.pop()!.bitTime - BLOCK_SIZE;
                let pastBlocks: number[] = [];
                let pastOk: boolean[] = [];

                while (bt >= 0 && syncEntries.length > 0) {
                  if (bt == syncEntries[syncEntries.length-1].bitTime) {
                    const blk = syncEntries.pop()!.block;
                    pastBlocks.unshift(this.negativePolarity ? ~blk : blk);
                    pastOk.unshift(true);
                  } else {
                    pastBlocks.unshift(0);
                    pastOk.unshift(false);
                  }
                  bt -= BLOCK_SIZE;
                }

                // Pad pastGroups so that it start on a group boundary.
                // Note: i contains the number of past blocks to add to the current group.
                const targetBlockSize = i + Math.ceil((pastBlocks.length - i) / BLOCKS_PER_GROUP) * BLOCKS_PER_GROUP;
                while (pastBlocks.length < targetBlockSize) {
                  pastBlocks.unshift(0);
                  pastOk.unshift(false);
                }

                // Now, emit groups.
                while (pastBlocks.length >= BLOCKS_PER_GROUP) {
                  this.emitGroup(
                    new Uint16Array(pastBlocks.slice(0, BLOCKS_PER_GROUP)),
                    pastOk.slice(0, BLOCKS_PER_GROUP)
                  )
                  pastBlocks = pastBlocks.slice(BLOCKS_PER_GROUP);
                  pastOk = pastOk.slice(BLOCKS_PER_GROUP);
                }

                // Fill in the rest in the current group.
                for (let k = 0; k < pastBlocks.length; k++) {
                  this.group[k] = pastBlocks[k];
                  this.blocksOk[k] = pastOk[k];
                }
              }
              
              if (this.negativePolarity) this.group[i] = ~ this.group[i];
              
              this.eraseSyncArray();

              console.log("Got synchronization on block " + String.fromCharCode(65 + i) + "! (" + (j==0 ? "positive" : "negative") + " logic)");
              // TODO: Need to report status?
            }
            break outer_loop;

          }
        }
      }
    }

    if (!this.synced) {
      // Report "group-equivalents" for the unsynced bits?
      this.unreportedUnsyncedBits++;
      if (this.unreportedUnsyncedBits >= GROUP_SIZE) {
        this.listener.processRdsReportEvent({
          type: RdsReportEventType.UNSYNCED_GROUP_DURATION,
          freq: 0,
          sourceInfo: "BitStreamSynchronizer"
        })
        this.unreportedUnsyncedBits -= GROUP_SIZE;
      }
    } else {   // If synced.
      if (this.bitCount == BLOCK_SIZE) {
        if (this.negativePolarity) this.block = ~this.block;    // Invert block if polarity is negative.
        this.group[this.blockCount] = (this.block>>10) & 0xFFFF;
        const synd = calcSyndrome(this.block);

        if (synd == SYNDROMES[this.blockCount][0] || synd == SYNDROMES[this.blockCount][1]) {
          this.nbOk++;
          this.blocksOk[this.blockCount] = true;
        } else {
          this.blocksOk[this.blockCount] = false;
          this.group[this.blockCount] = -1;
        }
        
        this.bitCount = 0;
        this.blockCount++;
        
        // end of group?
        if (this.blockCount > 3) {
          this.groupCount++;
          
          this.blockCount = 0;
          
          if (this.nbOk > 0) this.nbUnsync = 0; else this.nbUnsync++;
          
          // after a while without a correct block, decide we have lost synchronization
          if (this.nbUnsync > SYNC_LOSS_DURATION) {
            this.synced = false;
            console.log("Lost synchronization.");
            // TODO: Need to report status?
          }
          
          this.nbOk = 0;
          
          // Return group data.
          const theGroup = new Uint16Array(this.group);
          /*
          console.log(
            'Read group:',
            this.blocksOk[0] ? theGroup[0].toString(16) : '----',
            this.blocksOk[1] ? theGroup[1].toString(16) : '----',
            this.blocksOk[2] ? theGroup[2].toString(16) : '----',
            this.blocksOk[3] ? theGroup[3].toString(16) : '----');
          */
          this.emitGroup(theGroup, [...this.blocksOk]);
        }
      }
    }
  }

  private emitGroup(blocks: Uint16Array, ok: boolean[]) {
    this.listener.processRdsReportEvent({
      type: RdsReportEventType.GROUP,
      ok: ok,
      blocks: blocks,
      freq: 0,
      sourceInfo: "BitStreamSynchronizer",
    });
}

  public addBits(bytes: Uint8Array) {
    for (let i = 0; i < bytes.length; i++) {
      let byte = bytes[i];
  
      for (let j = 0; j < 8; j++) {
        this.addBit((byte & 0x80) != 0);
        byte <<= 1;
      }
    }
  }
	
	public forceInversion(inversion: BitInversion) {
		this.inversion = inversion;
	}
}
