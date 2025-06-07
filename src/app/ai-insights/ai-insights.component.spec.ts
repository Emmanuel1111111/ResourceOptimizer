import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AiInsightsComponent } from './ai-insights.component';

describe('AiInsightsComponent', () => {
  let component: AiInsightsComponent;
  let fixture: ComponentFixture<AiInsightsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [AiInsightsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AiInsightsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
