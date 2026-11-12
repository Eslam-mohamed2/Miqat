import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Topnav } from './topnav';
import { TEST_PROVIDERS } from '../../../testing/test-providers';

describe('Topnav', () => {
  let component: Topnav;
  let fixture: ComponentFixture<Topnav>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Topnav],
      providers: TEST_PROVIDERS
    })
    .compileComponents();

    fixture = TestBed.createComponent(Topnav);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
