import { RdsReportEvent, RdsReportEventListener, RdsReportEventType } from "../drivers/input";
import { BitStreamSynchronizer } from "./bitstream";

class RdsListener implements RdsReportEventListener {
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
  const bss = new BitStreamSynchronizer(listener);

  it('should sync', () => {
    const spy = spyOn(listener, 'processRdsReportEvent');
    bss.addBits(data);
    expect(bss.synced).toBe(true);
    expect(spy).toHaveBeenCalledTimes(3);
    expect(spy).toHaveBeenCalledWith({
      type: RdsReportEventType.GROUP,
      ok: [true, true, true, true],
      blocks: new Uint16Array([0xf206, 0x0403, 0xe5b4, 0x2020]),
      freq: 0,
      sourceInfo: "BitStreamSynchronizer",
    })
    expect(spy).toHaveBeenCalledWith({
      type: RdsReportEventType.GROUP,
      ok: [true, true, true, true],
      blocks: new Uint16Array([0xf206, 0x1411, 0x0000, 0x0000]),
      freq: 0,
      sourceInfo: "BitStreamSynchronizer",
    })
    expect(spy).toHaveBeenCalledWith({
      type: RdsReportEventType.GROUP,
      ok: [true, true, true, true],
      blocks: new Uint16Array([0xf206, 0xe410, 0x2020, 0xf201]),
      freq: 0,
      sourceInfo: "BitStreamSynchronizer",
    })
  });
});
