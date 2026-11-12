import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { TEST_PROVIDERS } from '../testing/test-providers';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: TEST_PROVIDERS
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  // The generated spec looked for the CLI starter's "Hello, Miqat" heading, which
  // this app never had: the root component is only a frame around the router.
  it('should render the router outlet', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('router-outlet')).not.toBeNull();
  });
});
