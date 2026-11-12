import { ComponentFixture, TestBed } from '@angular/core/testing';

import { QuickActionCard } from './quick-action-card';
import { TEST_PROVIDERS } from '../../../../testing/test-providers';

describe('QuickActionCard', () => {
  let component: QuickActionCard;
  let fixture: ComponentFixture<QuickActionCard>;

  // The card is a required input: the template reads card.title, so it must be
  // set before the first render.
  const card = {
    id: 'board',
    title: 'Whiteboard',
    description: 'Sketch and plan visually',
    icon: 'dashboard_customize',
    iconBg: '#1e2240',
    iconColor: '#7c8ef5'
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QuickActionCard],
      providers: TEST_PROVIDERS
    })
    .compileComponents();

    fixture = TestBed.createComponent(QuickActionCard);
    component = fixture.componentInstance;
    component.card = card;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('shows the card title and description', () => {
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.title')?.textContent).toContain('Whiteboard');
    expect(element.querySelector('.description')?.textContent).toContain('Sketch and plan visually');
  });

  it('emits the card when clicked', () => {
    let emitted: unknown;
    component.cardClick.subscribe(value => (emitted = value));
    (fixture.nativeElement as HTMLElement).querySelector('button')!.click();
    expect(emitted).toBe(card);
  });
});
