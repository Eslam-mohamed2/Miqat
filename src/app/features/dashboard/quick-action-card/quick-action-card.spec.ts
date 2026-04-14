import { ComponentFixture, TestBed } from '@angular/core/testing';

import { QuickActionCard } from './quick-action-card';

describe('QuickActionCard', () => {
  let component: QuickActionCard;
  let fixture: ComponentFixture<QuickActionCard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QuickActionCard]
    })
    .compileComponents();

    fixture = TestBed.createComponent(QuickActionCard);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
