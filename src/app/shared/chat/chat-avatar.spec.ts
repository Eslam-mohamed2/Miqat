import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ChatAvatar } from './chat-avatar';
import { TEST_PROVIDERS } from '../../../testing/test-providers';

describe('ChatAvatar: the dot that says whether a person is online', () => {
  let fixture: ComponentFixture<ChatAvatar>;
  const dot = (kind: 'online' | 'offline') => fixture.nativeElement.querySelector(`.${kind}-dot`) as HTMLElement | null;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ChatAvatar], providers: [...TEST_PROVIDERS] }).compileComponents();
    fixture = TestBed.createComponent(ChatAvatar);
    fixture.componentRef.setInput('name', 'Basim East');
  });

  it('is green for someone who is online', () => {
    fixture.componentRef.setInput('online', true);
    fixture.detectChanges();

    expect(dot('online')).not.toBeNull();
    expect(dot('offline')).toBeNull();
    expect(dot('online')!.title).toBe('Online');
  });

  it('is a quiet dot, not nothing, for someone who is offline: they are still shown', () => {
    fixture.componentRef.setInput('online', false);
    fixture.detectChanges();

    expect(dot('offline')).not.toBeNull();
    expect(dot('online')).toBeNull();
    expect(dot('offline')!.title).toBe('Offline');
    expect(fixture.nativeElement.querySelector('.initials').textContent.trim()).toBe('BE');
  });

  it('is left out where being online means nothing (a group) or is not known', () => {
    fixture.detectChanges();
    expect(dot('online')).toBeNull();
    expect(dot('offline')).toBeNull();

    fixture.componentRef.setInput('online', null);
    fixture.detectChanges();
    expect(dot('online')).toBeNull();
    expect(dot('offline')).toBeNull();
  });
});
