import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { InputPaneComponent } from './input-pane.component';

describe('InputPaneComponent', () => {
  let component: InputPaneComponent;
  let fixture: ComponentFixture<InputPaneComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InputPaneComponent],
      providers: [provideRouter([])]
    })
    .compileComponents();

    fixture = TestBed.createComponent(InputPaneComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
