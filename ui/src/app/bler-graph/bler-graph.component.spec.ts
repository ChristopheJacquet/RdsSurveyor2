import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BlerGraphComponent } from './bler-graph.component';
import { Block, Group, UNCORRECTABLE_ERRORS } from '../../../../core/drivers/input';

describe('BlerGraphComponent', () => {
  let component: BlerGraphComponent;
  let fixture: ComponentFixture<BlerGraphComponent>;

  const cleanBlock = () => new Block(0, 0);
  const correctedBlock = () => new Block(0, 2);
  const errorBlock = () => new Block(0, UNCORRECTABLE_ERRORS);
  const group = (block: () => Block) => new Group([block(), block(), block(), block()]);

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BlerGraphComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BlerGraphComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('starts with zero rates before any block is seen', () => {
    expect(component.hasBlocks).toBe(false);
    expect(component.errorRatePercent).toBe(0);
    expect(component.correctedRatePercent).toBe(0);
  });

  it('reports hasBlocks once any block has been seen', () => {
    component.updateBlerGraph(true, group(cleanBlock));
    expect(component.hasBlocks).toBe(true);
  });

  it('computes error and corrected rates from block errorCount/ok', () => {
    // 2 clean groups, 1 corrected group, 1 error group => 16 blocks total.
    component.updateBlerGraph(true, group(cleanBlock));
    component.updateBlerGraph(true, group(cleanBlock));
    component.updateBlerGraph(true, group(correctedBlock));
    component.updateBlerGraph(true, group(errorBlock));

    expect(component.errorRatePercent).toBeCloseTo(4 / 16 * 100, 5);
    expect(component.correctedRatePercent).toBeCloseTo(4 / 16 * 100, 5);
  });

  it('excludes unsynced groups from the rates', () => {
    component.updateBlerGraph(false, undefined);

    expect(component.hasBlocks).toBe(false);
    expect(component.errorRatePercent).toBe(0);
    expect(component.correctedRatePercent).toBe(0);
  });

  it('ignores unsynced groups when decoded blocks are also present', () => {
    component.updateBlerGraph(true, group(cleanBlock));
    component.updateBlerGraph(true, group(errorBlock));
    component.updateBlerGraph(false, undefined);

    // Rate is over the 8 decoded blocks only, not the 12 total pushed.
    expect(component.hasBlocks).toBe(true);
    expect(component.errorRatePercent).toBeCloseTo(4 / 8 * 100, 5);
  });

  it('evicts the oldest blocks once the window is full', () => {
    // Fill the 228-block window with errors (57 groups of 4 blocks).
    for (let i = 0; i < 57; i++) {
      component.updateBlerGraph(true, group(errorBlock));
    }
    expect(component.errorRatePercent).toBe(100);

    // One more group of clean blocks evicts the 4 oldest error blocks.
    component.updateBlerGraph(true, group(cleanBlock));

    expect(component.errorRatePercent).toBeCloseTo(224 / 228 * 100, 5);
    expect(component.correctedRatePercent).toBe(0);
  });

  it('falls back to a "no data" state once sustained unsync evicts all decoded blocks', () => {
    // Fill the window with decoded (error) blocks.
    for (let i = 0; i < 57; i++) {
      component.updateBlerGraph(true, group(errorBlock));
    }
    expect(component.hasBlocks).toBe(true);

    // 5+ seconds of continuous unsync evicts every decoded block.
    for (let i = 0; i < 57; i++) {
      component.updateBlerGraph(false, undefined);
    }

    expect(component.hasBlocks).toBe(false);
    expect(component.errorRatePercent).toBe(0);
  });
});
