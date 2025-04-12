import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BlerGraphComponent } from './bler-graph.component';

describe('BlerGraphComponent', () => {
  let component: BlerGraphComponent;
  let fixture: ComponentFixture<BlerGraphComponent>;

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
});
