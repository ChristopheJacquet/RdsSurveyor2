import { RdsPipeline, RdsReportEventType } from "../drivers/input";
import { Block, Group, UNCORRECTABLE_ERRORS } from "../protocol/rds_types";

// Number of good blocks needed after initial block to confirm synchronization.
const SYNC_THRESHOLD = 2;

// Number of groups for the good blocks above to be received.
const SYNC_CONFIRM_DURATION = 5;

// Lose synchronization after that many groups without a good block.
const SYNC_LOSS_DURATION = 2;

const MAT_H: number[] = [
  0x31B, 0x38F, 0x2A7, 0x0F7, 0x1EE, 0x3DC, 0x201, 0x1BB, 0x376, 0x355,
  0x313, 0x39F, 0x287, 0x0B7, 0x16E, 0x2DC, 0x001, 0x002, 0x004, 0x008,
  0x010, 0x020, 0x040, 0x080, 0x100, 0x200
];

const BLOCK_SIZE = 26;
const BLOCKS_PER_GROUP = 4;
const GROUP_SIZE = BLOCKS_PER_GROUP * BLOCK_SIZE;

const SYNDROMES = new Map<number, number>(
  [[0x3D8, 0], [0x3D4, 1], [0x25C, 2], [0x3CC, 2], [0x258, 3]]);

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
	private block = 0;        // block contents
	private blockCount = 0;   // block counter within group
	private bitCount = 0;     // bit count within block
	private group: [Block, Block, Block, Block] = [
    new Block(0, UNCORRECTABLE_ERRORS),
    new Block(0, UNCORRECTABLE_ERRORS),
    new Block(0, UNCORRECTABLE_ERRORS),
    new Block(0, UNCORRECTABLE_ERRORS),
  ];   // group
	public synced = false;
	private nbOk = 0;
	private nbUnsync = 0;
	private groupCount = 0;
	private bitTime = 0;
  private unreportedUnsyncedBits = 0;
	private nbSyncAtOffset: SyncEntry[][][] = [];
  private stream: number;
  private listener: RdsPipeline;
  private verbose = false;
	
	public constructor(stream: number, listener: RdsPipeline) {
    this.stream = stream;
    this.listener = listener;
		this.eraseSyncArray();
	}
	
	private eraseSyncArray() {
    this.nbSyncAtOffset = new Array(BLOCK_SIZE);
		for (let i=0; i<this.nbSyncAtOffset.length; i++) {
      this.nbSyncAtOffset[i] = new Array(BLOCKS_PER_GROUP);
			for (let j=0; j<this.nbSyncAtOffset[i].length; j++) {
        this.nbSyncAtOffset[i][j] = [];
      }
    }
	}

  public addBit(bit: boolean) {
    this.block = (this.block << 1) & 0x3FFFFFF;
    if (bit) this.block |= 1;
    this.bitCount++;
    this.bitTime++;
    
    try_sync:
    if (!this.synced) {
      const synd = calcSyndrome(this.block);
      
      const blockIndex = SYNDROMES.get(synd);
      if (blockIndex == undefined) {    // The syndrome does not match one of the offset syndromes.
        break try_sync;
      }

      const offset = this.bitTime % BLOCK_SIZE;
      const pseudoBlock = (Math.floor(this.bitTime / BLOCK_SIZE) + BLOCKS_PER_GROUP - blockIndex) % BLOCKS_PER_GROUP;

      if (this.verbose) {
        console.log(`[${this.stream}] Good CRC: ${String.fromCharCode(65+blockIndex)}:${offset}/${pseudoBlock}`);
      }

      // Add current time and block to the list of syndrome hits.
      const block = (this.block >> 10) & 0xFFFF;
      this.nbSyncAtOffset[offset][pseudoBlock].push(
        new SyncEntry(this.bitTime, block));

      // Weed out out-of-time hits.
      while (this.nbSyncAtOffset[offset][pseudoBlock][0].bitTime < this.bitTime - SYNC_CONFIRM_DURATION * GROUP_SIZE)
        this.nbSyncAtOffset[offset][pseudoBlock].shift();

      // Are we above threshold?
      if (this.nbSyncAtOffset[offset][pseudoBlock].length > SYNC_THRESHOLD) {
        this.synced = true;
        this.unreportedUnsyncedBits = 0;

        this.group[blockIndex] = new Block(block, 0);
        this.blockCount = (blockIndex+1) % BLOCKS_PER_GROUP;
        this.bitCount = 0;
        this.nbOk = 1;
        for (let k=0; k<BLOCKS_PER_GROUP; k++) {
          if (k != blockIndex) this.group[k].errorCount = UNCORRECTABLE_ERRORS;
        }

        // Fill in the previous blocks.
        {
          const syncEntries = this.nbSyncAtOffset[offset][pseudoBlock];
          let bt = syncEntries.pop()!.bitTime - BLOCK_SIZE;
          let pastBlocks: Block[] = [];

          while (bt >= 0 && syncEntries.length > 0) {
            if (bt == syncEntries[syncEntries.length-1].bitTime) {
              const blk = syncEntries.pop()!.block;
              pastBlocks.unshift(new Block(blk, 0));
            } else {
              pastBlocks.unshift(new Block(0, UNCORRECTABLE_ERRORS));
            }
            bt -= BLOCK_SIZE;
          }

          // Pad pastGroups so that it start on a group boundary.
          // Note: i contains the number of past blocks to add to the current group.
          const targetBlockSize = blockIndex + Math.ceil((pastBlocks.length - blockIndex) / BLOCKS_PER_GROUP) * BLOCKS_PER_GROUP;
          while (pastBlocks.length < targetBlockSize) {
            pastBlocks.unshift(new Block(0, UNCORRECTABLE_ERRORS));
          }

          // Now, emit groups.
          while (pastBlocks.length >= BLOCKS_PER_GROUP) {
            this.emitGroup(
              new Group(pastBlocks.slice(0, BLOCKS_PER_GROUP) as [Block, Block, Block, Block]));
            pastBlocks = pastBlocks.slice(BLOCKS_PER_GROUP);
          }

          // Fill in the rest in the current group.
          for (let k = 0; k < pastBlocks.length; k++) {
            this.group[k] = pastBlocks[k];
          }
        }
        
        this.eraseSyncArray();

        console.log(`[${this.stream}] @${this.bitTime} Got synchronization on block ${String.fromCharCode(65 + blockIndex)}!`);
        // TODO: Need to report status?
      }
    }

    if (!this.synced) {
      // Report "group-equivalents" for the unsynced bits?
      this.unreportedUnsyncedBits++;
      if (this.unreportedUnsyncedBits >= GROUP_SIZE) {
        this.listener.processRdsReportEvent({
          stream: this.stream,
          type: RdsReportEventType.UNSYNCED_GROUP_DURATION,
          sourceInfo: "BitStreamSynchronizer"
        })
        this.unreportedUnsyncedBits -= GROUP_SIZE;
      }
    } else {   // If synced.
      if (this.bitCount == BLOCK_SIZE) {
        const synd = calcSyndrome(this.block);

        if (SYNDROMES.get(synd) == this.blockCount) {
          this.nbOk++;
          this.group[this.blockCount] = new Block((this.block>>10) & 0xFFFF, 0);
        } else {
          this.group[this.blockCount] = new Block(-1, UNCORRECTABLE_ERRORS);
        }

        this.bitCount = 0;
        this.blockCount++;
        
        // end of group?
        if (this.blockCount > 3) {
          this.groupCount++;
          
          this.blockCount = 0;
          
          if (this.nbOk > 0) this.nbUnsync = 0; else this.nbUnsync++;
          
          // after a while without a correct block, decide we have lost synchronization
          if (this.nbUnsync >= SYNC_LOSS_DURATION) {
            this.synced = false;
            console.log(`[${this.stream}] @${this.bitTime} Lost synchronization.`);
            // TODO: Need to report status?
          }
          
          this.nbOk = 0;

          // Return group data.
          this.emitGroup(new Group([...this.group] as [Block, Block, Block, Block]));
        }
      }
    }
  }

  private emitGroup(group: Group) {
    this.listener.processRdsReportEvent({
      stream: this.stream,
      type: RdsReportEventType.GROUP,
      group: group,
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
}
