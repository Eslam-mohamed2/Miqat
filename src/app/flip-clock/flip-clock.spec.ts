import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FlipClock } from './flip-clock';

describe('FlipClock', () => {
  let component: FlipClock;
  let fixture: ComponentFixture<FlipClock>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FlipClock]
    })
    .compileComponents();

    fixture = TestBed.createComponent(FlipClock);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
