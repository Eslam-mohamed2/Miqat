import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MiniCalendar } from './mini-calendar';
import { TEST_PROVIDERS } from '../../../../testing/test-providers';

describe('MiniCalendar', () => {
  let component: MiniCalendar;
  let fixture: ComponentFixture<MiniCalendar>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MiniCalendar],
      providers: TEST_PROVIDERS
    })
    .compileComponents();

    fixture = TestBed.createComponent(MiniCalendar);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
