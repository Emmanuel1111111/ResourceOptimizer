import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ExecutiveBookingComponent } from './executive-booking.component';

describe('ExecutiveBookingComponent', () => {
  let component: ExecutiveBookingComponent;
  let fixture: ComponentFixture<ExecutiveBookingComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ExecutiveBookingComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ExecutiveBookingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
