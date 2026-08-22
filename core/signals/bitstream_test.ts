import { Block, Group, RdsReportEvent, RdsPipeline, RdsReportEventType } from "../drivers/input";
import { BitStreamSynchronizer } from "./bitstream";

class RdsListener implements RdsPipeline {
  processMpxSamples(samples: Float32Array, length?: number): void {
  }

  processBits(bytes: Uint8Array): void {
  }

  reportFrequency(frequencyKhz: number): void {
  }

  reportSourceEnd(): void {
    throw new Error("Method not implemented.");
  }

  processRdsReportEvent(event: RdsReportEvent): void {
  }
}

describe('Error-free bit stream', () => {
  const data = new Uint8Array(
    [0xf9, 0x03, 0x6b, 0xe0, 0x80, 0x61, 0x1f, 0x2d, 
     0xa3, 0x60, 0x40, 0x40, 0x6e, 0x79, 0x03, 0x6b,
     0xe2, 0x82, 0x3f, 0x28, 0x00, 0x02, 0xd0, 0x00,
     0x00, 0xda, 0x79, 0x03, 0x6b, 0xfc, 0x82, 0x03,
     0x41, 0x01, 0x00, 0x01, 0xe4, 0x03, 0xc0, 0xf9]);

  const listener = new RdsListener();
  const bss = new BitStreamSynchronizer(0, listener);

  it('should sync', () => {
    const spy = spyOn(listener, 'processRdsReportEvent');
    bss.addBits(data);
    expect(bss.synced).toBe(true);
    expect(spy).toHaveBeenCalledTimes(3);
    expect(spy).toHaveBeenCalledWith({
      stream: 0,
      type: RdsReportEventType.GROUP,
      group: new Group([
        new Block(0xf206, 0),
        new Block(0x0403, 0),
        new Block(0xe5b4, 0),
        new Block(0x2020, 0),
      ]),
      sourceInfo: "BitStreamSynchronizer",
    })
    expect(spy).toHaveBeenCalledWith({
      stream: 0,
      type: RdsReportEventType.GROUP,
      group: new Group([
        new Block(0xf206, 0),
        new Block(0x1411, 0),
        new Block(0x0000, 0),
        new Block(0x0000, 0),
      ]),
      sourceInfo: "BitStreamSynchronizer",
    })
    expect(spy).toHaveBeenCalledWith({
      stream: 0,
      type: RdsReportEventType.GROUP,
      group: new Group([
        new Block(0xf206, 0),
        new Block(0xe410, 0),
        new Block(0x2020, 0),
        new Block(0xf201, 0),
      ]),
      sourceInfo: "BitStreamSynchronizer",
    })
  });
});
