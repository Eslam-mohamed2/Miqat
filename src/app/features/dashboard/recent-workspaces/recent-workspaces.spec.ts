import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RecentWorkspaces } from './recent-workspaces';

describe('RecentWorkspaces', () => {
  let component: RecentWorkspaces;
  let fixture: ComponentFixture<RecentWorkspaces>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RecentWorkspaces]
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
