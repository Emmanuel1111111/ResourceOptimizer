import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AdjustSchedulesComponent } from './adjust-schedules.component';

describe('AdjustSchedulesComponent', () => {
  let component: AdjustSchedulesComponent;
  let fixture: ComponentFixture<AdjustSchedulesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [AdjustSchedulesComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AdjustSchedulesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
