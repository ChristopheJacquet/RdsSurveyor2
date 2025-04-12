import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ConstellationDiagramComponent } from './constellation-diagram.component';

describe('ConstellationDiagramComponent', () => {
  let component: ConstellationDiagramComponent;
  let fixture: ComponentFixture<ConstellationDiagramComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConstellationDiagramComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ConstellationDiagramComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
