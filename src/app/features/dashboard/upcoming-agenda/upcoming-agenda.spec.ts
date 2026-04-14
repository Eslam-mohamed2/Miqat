import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UpcomingAgenda } from './upcoming-agenda';

describe('UpcomingAgenda', () => {
  let component: UpcomingAgenda;
  let fixture: ComponentFixture<UpcomingAgenda>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UpcomingAgenda]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UpcomingAgenda);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
