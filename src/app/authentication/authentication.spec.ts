import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Authentication } from './authentication';
import { TEST_PROVIDERS } from '../../testing/test-providers';

describe('Authentication', () => {
  let component: Authentication;
  let fixture: ComponentFixture<Authentication>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Authentication],
      providers: TEST_PROVIDERS
    })
    .compileComponents();

    fixture = TestBed.createComponent(Authentication);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
