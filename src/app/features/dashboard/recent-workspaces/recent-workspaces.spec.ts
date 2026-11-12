import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RecentWorkspaces } from './recent-workspaces';
import { TEST_PROVIDERS } from '../../../../testing/test-providers';

describe('RecentWorkspaces', () => {
  let component: RecentWorkspaces;
  let fixture: ComponentFixture<RecentWorkspaces>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RecentWorkspaces],
      providers: TEST_PROVIDERS
    })
    .compileComponents();

    fixture = TestBed.createComponent(RecentWorkspaces);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
