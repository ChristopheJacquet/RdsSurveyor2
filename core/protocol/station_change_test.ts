import { Block, Group, UNCORRECTABLE_ERRORS } from "../drivers/input";
import { ReceiverEvent, ReceiverEventKind, StationChangeDetector } from "./station_change";

function send(s: string, detector: StationChangeDetector): Array<ReceiverEvent> {
  const events = new Array<ReceiverEvent>();

  for (let l of s.split('\n')) {
    let g = l.trim().split(' ');
    let b = [
      parseInt(g[0], 16), parseInt(g[1], 16), parseInt(g[2], 16), parseInt(g[3], 16)];
    const evts = detector.processGroup(
      /* stream= */ 0,
      new Group(
        b.map(v => Number.isNaN(v) ? new Block(0, UNCORRECTABLE_ERRORS) : new Block(v, 0)) as [Block, Block, Block, Block]),
      /* maxErrors= */ 0);
    events.push(...evts);
  }
  return events;
}

// Builds the Group produced by 4 error-free blocks.
function mkGroup(pi: number, b1: number, b2: number, b3: number): Group {
  return new Group([new Block(pi, 0), new Block(b1, 0), new Block(b2, 0), new Block(b3, 0)]);
}

// Builds the Group produced when the PI block is missing/uncorrectable
// (a "----" block), as emitted for a PI-less group.
function mkGroupWithMissingPi(b1: number, b2: number, b3: number): Group {
  return new Group([
    new Block(0, UNCORRECTABLE_ERRORS), new Block(b1, 0), new Block(b2, 0), new Block(b3, 0)]);
}

describe('A station change', () => {
  const detector = new StationChangeDetector();
  const events = send(
    `1000 0101 0102 0103
     1000 0201 0202 0203
     2000 0301 0302 0303
     2000 0401 0402 0403`, detector);
  
  it('should get detected', () => {
    expect(events).toEqual([
      jasmine.objectContaining({kind: ReceiverEventKind.NewStationEvent, pi: 0x1000}),
      jasmine.objectContaining({kind: ReceiverEventKind.GroupEvent, group: mkGroup(0x1000, 0x0101, 0x0102, 0x0103)}),
      jasmine.objectContaining({kind: ReceiverEventKind.GroupEvent, group: mkGroup(0x1000, 0x0201, 0x0202, 0x0203)}),
      jasmine.objectContaining({kind: ReceiverEventKind.NewStationEvent, pi: 0x2000}),
      jasmine.objectContaining({kind: ReceiverEventKind.GroupEvent, group: mkGroup(0x2000, 0x0301, 0x0302, 0x0303)}),
      jasmine.objectContaining({kind: ReceiverEventKind.GroupEvent, group: mkGroup(0x2000, 0x0401, 0x0402, 0x0403)})
    ]);
  });
});

describe('An isolated group with bad PI', () => {
  const detector = new StationChangeDetector();
  const events = send(
    `1000 0101 0102 0103
     FFFF 0201 0202 0203
     1000 0301 0302 0303`, detector);
  
  it('should get dropped', () => {
    expect(events).toEqual([
      jasmine.objectContaining({kind: ReceiverEventKind.NewStationEvent, pi: 0x1000}),
      jasmine.objectContaining({kind: ReceiverEventKind.GroupEvent, group: mkGroup(0x1000, 0x0101, 0x0102, 0x0103)}),
      jasmine.objectContaining({kind: ReceiverEventKind.GroupEvent, group: mkGroup(0x1000, 0x0301, 0x0302, 0x0303)}),
    ]);
  });
});

describe('An isolated group with missing PI', () => {
  const detector = new StationChangeDetector();
  const events = send(
    `1000 0101 0102 0103
     ---- 0201 0202 0203
     1000 0301 0302 0303`, detector);
  
  it('should get emitted', () => {
    expect(events).toEqual([
      jasmine.objectContaining({kind: ReceiverEventKind.NewStationEvent, pi: 0x1000}),
      jasmine.objectContaining({kind: ReceiverEventKind.GroupEvent, group: mkGroup(0x1000, 0x0101, 0x0102, 0x0103)}),
      jasmine.objectContaining({kind: ReceiverEventKind.GroupEvent, group: mkGroupWithMissingPi(0x0201, 0x0202, 0x0203)}),
      jasmine.objectContaining({kind: ReceiverEventKind.GroupEvent, group: mkGroup(0x1000, 0x0301, 0x0302, 0x0303)}),
    ]);
  });
});

describe('PI-less groups around a station change', () => {
  const detector = new StationChangeDetector();
  const events = send(
    `1000 0101 0102 0103
     ---- 0201 0202 0203
     1000 0301 0302 0303
     ---- 0401 0402 0403
     ---- 0501 0502 0503
     2000 0601 0602 0603
     ---- 0701 0702 0703
     2000 0801 0802 0803`, detector);
  
  it('should get dropped', () => {
    expect(events).toEqual([
      jasmine.objectContaining({kind: ReceiverEventKind.NewStationEvent, pi: 0x1000}),
      jasmine.objectContaining({kind: ReceiverEventKind.GroupEvent, group: mkGroup(0x1000, 0x0101, 0x0102, 0x0103)}),
      jasmine.objectContaining({kind: ReceiverEventKind.GroupEvent, group: mkGroupWithMissingPi(0x0201, 0x0202, 0x0203)}),
      jasmine.objectContaining({kind: ReceiverEventKind.GroupEvent, group: mkGroup(0x1000, 0x0301, 0x0302, 0x0303)}),
      jasmine.objectContaining({kind: ReceiverEventKind.NewStationEvent, pi: 0x2000}),
      jasmine.objectContaining({kind: ReceiverEventKind.GroupEvent, group: mkGroup(0x2000, 0x0601, 0x0602, 0x0603)}),
      jasmine.objectContaining({kind: ReceiverEventKind.GroupEvent, group: mkGroupWithMissingPi(0x0701, 0x0702, 0x0703)}),
      jasmine.objectContaining({kind: ReceiverEventKind.GroupEvent, group: mkGroup(0x2000, 0x0801, 0x0802, 0x0803)}),
    ]);
  });
});
