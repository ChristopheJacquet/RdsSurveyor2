import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StationInfoComponent } from './station-info.component';

describe('StationInfoComponent', () => {
  let component: StationInfoComponent;
  let fixture: ComponentFixture<StationInfoComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StationInfoComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(StationInfoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
