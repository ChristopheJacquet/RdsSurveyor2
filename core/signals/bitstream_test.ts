import { BitStreamSynchronizer } from "./bitstream";

describe('Error-free bit stream', () => {
  const data = new Uint8Array(
    [0xf9, 0x03, 0x6b, 0xe0, 0x80, 0x61, 0x1f, 0x2d, 
     0xa3, 0x60, 0x40, 0x40, 0x6e, 0x79, 0x03, 0x6b,
     0xe2, 0x82, 0x3f, 0x28, 0x00, 0x02, 0xd0, 0x00,
     0x00, 0xda, 0x79, 0x03, 0x6b, 0xfc, 0x82, 0x03,
     0x41, 0x01, 0x00, 0x01, 0xe4, 0x03, 0xc0, 0xf9]);

  const bss = new BitStreamSynchronizer();

  for (let i = 0; i < data.length; i++) {
    let byte = data[i];

    for (let j = 0; j < 8; j++) {
      bss.addBit((byte & 0x80) != 0);
      byte <<= 1;
    }
  }

  it('should sync', () => {
    expect(bss.synced).toBe(true);
  });

});
