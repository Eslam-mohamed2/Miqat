import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Sidebar } from './sidebar';
import { AR, AR_PLURALS } from '../../core/i18n/ar';
import { useLanguageForTests } from '../../core/i18n/i18n';
import { InboxCountService } from '../../core/services/inbox-count.service';
import { TEST_PROVIDERS } from '../../../testing/test-providers';

describe('Sidebar', () => {
  let component: Sidebar;
  let fixture: ComponentFixture<Sidebar>;

  async function create() {
    await TestBed.configureTestingModule({
      imports: [Sidebar],
      providers: TEST_PROVIDERS
    })
    .compileComponents();

    fixture = TestBed.createComponent(Sidebar);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  /** Everything the rail and the tab bar say: link names, tooltips and the tab labels. */
  function said(): string[] {
    const host = fixture.nativeElement as HTMLElement;
    const labels = [...host.querySelectorAll('[aria-label], [title]')]
      .flatMap(element => [element.getAttribute('aria-label'), element.getAttribute('title')]);
    const tabs = [...host.querySelectorAll('.tab')].map(tab => tab.textContent?.trim());
    return [...labels, ...tabs].filter((text): text is string => !!text);
  }

  afterEach(() => useLanguageForTests('en'));

  it('should create', async () => {
    await create();
    expect(component).toBeTruthy();
  });

  it('names its links in English as before', async () => {
    await create();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('nav.rail')?.getAttribute('aria-label')).toBe('Sections');
    expect(host.querySelector('nav.tabbar')?.getAttribute('aria-label')).toBe('Main');
    expect([...host.querySelectorAll('.tab')].map(tab => tab.textContent?.trim())).toEqual(['Day', 'Week', 'Tasks', 'Inbox']);
    expect(said()).toContain('Create');
    expect(said()).toContain('Switch to light mode');
  });

  it('says nothing in English when the interface is Arabic', async () => {
    useLanguageForTests('ar', { dictionary: AR, plurals: AR_PLURALS });
    await create();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('nav.rail')?.getAttribute('aria-label')).toBe('الأقسام');
    expect([...host.querySelectorAll('.tab')].map(tab => tab.textContent?.trim())).toEqual(['يوم', 'أسبوع', 'المهام', 'الوارد']);
    // The product's name stays "Miqat" in Arabic; nothing else is in English.
    expect(said().filter(text => /[A-Za-z]/.test(text.replace(/Miqat/g, '')))).toEqual([]);
  });

  it('counts what is new in the Inbox the Arabic way', async () => {
    useLanguageForTests('ar', { dictionary: AR, plurals: AR_PLURALS });
    await create();
    const inbox = TestBed.inject(InboxCountService);

    expect(component.inboxLabel()).toBe('الوارد');
    inbox.unreadNotifications.set(1);
    expect(component.inboxLabel()).toBe('الوارد، عنصر جديد واحد');
    inbox.unreadNotifications.set(2);
    expect(component.inboxLabel()).toBe('الوارد، عنصران جديدان');
    inbox.unreadMentions.set(3);
    expect(component.inboxLabel()).toBe('الوارد، ٥ عناصر جديدة');
    inbox.friendRequests.set(7);
    expect(component.inboxLabel()).toBe('الوارد، ١٢ عنصرًا جديدًا');
  });

  it('counts what is new in the Inbox in English as before', async () => {
    await create();
    const inbox = TestBed.inject(InboxCountService);

    expect(component.inboxLabel()).toBe('Inbox');
    inbox.unreadNotifications.set(1);
    expect(component.inboxLabel()).toBe('Inbox, 1 new');
    inbox.unreadMentions.set(4);
    expect(component.inboxLabel()).toBe('Inbox, 5 new');
  });
});
