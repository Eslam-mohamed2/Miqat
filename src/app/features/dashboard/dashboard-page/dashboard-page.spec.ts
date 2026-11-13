import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DashboardPage } from './dashboard-page';
import { TEST_PROVIDERS } from '../../../../testing/test-providers';

describe('DashboardPage (Plan my day)', () => {
  let component: DashboardPage;
  let fixture: ComponentFixture<DashboardPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardPage],
      providers: TEST_PROVIDERS
    })
    .compileComponents();

    fixture = TestBed.createComponent(DashboardPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('shows the four steps, starting with yesterday while the day loads', () => {
    expect(component.steps().map(step => step.label)).toEqual(['Review yesterday', 'Choose tasks', 'Schedule', 'Commit']);
    expect(component.steps()[0].state).toBe('now');
  });

  it('has nothing to commit before a task is ticked', () => {
    expect(component.canCommit()).toBeFalse();
  });
});
