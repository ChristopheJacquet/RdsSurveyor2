import { RdsPipeline, RdsReportEventType } from "../drivers/input";
import { Block, Group, UNCORRECTABLE_ERRORS } from "../protocol/rds_types";

// Number of good blocks needed after initial block to confirm synchronization.
const SYNC_THRESHOLD = 2;

// Number of groups for the good blocks above to be received.
const SYNC_CONFIRM_DURATION = 5;

// Lose synchronization after that many groups without a good block.
const SYNC_LOSS_DURATION = 2;

const BLOCK_SIZE = 26;
const BLOCKS_PER_GROUP = 4;
const GROUP_SIZE = BLOCKS_PER_GROUP * BLOCK_SIZE;

const SYNDROMES = new Map<number, number>(
  [[0x3D8, 0], [0x3D4, 1], [0x25C, 2], [0x3CC, 2], [0x258, 3]]);

// Reverse lookup: for a given block position (A/B/C/D), the syndrome
// value(s) expected of an error-free block at that position.
const SYNDROMES_BY_BLOCK: number[][] = [[], [], [], []];
for (const [synd, blockIndex] of SYNDROMES) {
  SYNDROMES_BY_BLOCK[blockIndex].push(synd);
}

// Generator polynomial: x^10+x^8+x^7+x^5+x^4+x^3+1.
const GEN = 0x5B9;
const GEN_DEGREE = 10;

// x^325 mod gen: x^9+x^8+x^4+x^3+x+1. Used as the initial multiplier to
// turn a raw block into its syndrome.
const INITIAL_MULTIPLIER = 0x31B;

// A 5-bit "trap": once the shifted syndrome falls in this window, the
// remaining bits identify a correctable burst error.
const TRAP = 0x1F;

class SyncEntry {
  public constructor(public bitTime: number, public block: number) {}

  public toString(): string {
    return `${this.block.toString(16).padStart(4, '0')}@${this.bitTime}`;
  }
}

function calcSyndrome(block: number, ini: number): number {
  let rem = 0;
  for (let i = BLOCK_SIZE; i > 0; i--) {
    if ((block >> (i - 1)) & 0x01) rem = (rem << 1) ^ ini;
    else rem = rem << 1;
    if (rem & (0x01 << GEN_DEGREE)) rem = rem ^ GEN;
  }
  return rem;
}

function popcount(x: number): number {
  let count = 0;
  while (x != 0) {
    x &= x - 1;
    count++;
  }
  return count;
}

// Tries to correct a burst error in `message`, given the syndrome expected
// of an error-free block at this position. Returns the corrected message
// and the number of bits that were flipped, or null if uncorrectable.
function correctBlock(block: number, expectedSyndrome: number): Block {
  let rem = calcSyndrome(block, INITIAL_MULTIPLIER) ^ expectedSyndrome;
  let shift = 16;
  let trapped = false;
  for (; shift > 0; shift--) {     // Calculate successive syndromes.
    rem = calcSyndrome(rem, 1);
    if ((rem & TRAP) == 0) {
      trapped = true;
      break;
    }
    rem = rem << 1;
  }
  if (!trapped) {
    return new Block((block >> GEN_DEGREE) & 0xFFFF, UNCORRECTABLE_ERRORS);
  }

  rem = rem << shift;
  return new Block(((block ^ rem) >> GEN_DEGREE) & 0xFFFF, popcount(rem));
}

// Tries to correct `message`, known to be at position `blockIndex` within
// the group, against every syndrome value that is valid for that position.
function correctBlockAtPosition(block: number, blockIndex: number): Block {
  let best = new Block((block >> GEN_DEGREE) & 0xFFFF, UNCORRECTABLE_ERRORS);
  for (const expectedSyndrome of SYNDROMES_BY_BLOCK[blockIndex]) {
    const correct = correctBlock(block, expectedSyndrome);
    if (correct.errorCount < best.errorCount) {
      best = correct;
    }
  }
  return best;
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
      const synd = calcSyndrome(this.block, INITIAL_MULTIPLIER);

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
        const synd = calcSyndrome(this.block, INITIAL_MULTIPLIER);

        if (SYNDROMES.get(synd) == this.blockCount) {
          this.nbOk++;
          this.group[this.blockCount] = new Block((this.block>>10) & 0xFFFF, 0);
        } else {
          const corrected = correctBlockAtPosition(this.block, this.blockCount);
          this.group[this.blockCount] = corrected;
          if (corrected.errorCount != UNCORRECTABLE_ERRORS) {
            this.nbOk++;
          }
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
