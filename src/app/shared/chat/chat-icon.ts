import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type ChatIconName =
  'chat' | 'close' | 'search' | 'phone' | 'hang-up' | 'video' | 'video-off' | 'mic' | 'mic-off' | 'minimise' |
  'edit' | 'delete' | 'send' | 'check' | 'lock' | 'gone' | 'missed' | 'no-answer' |
  'people' | 'add-person' | 'plus' | 'back' | 'more' | 'leave' | 'admin';

/**
 * The line icons of the chat and the call screen, drawn like the rest of
 * design/miqat-2.0: 24px grid, 1.7 stroke, in the current text colour.
 */
@Component({
  selector: 'app-chat-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  styles: [':host { display: inline-flex; flex-shrink: 0; }'],
  template: `
    <svg [attr.width]="size()" [attr.height]="size()" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
      @switch (name()) {
        @case ('chat') { <path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-5 4v-4H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"></path> }
        @case ('close') { <path d="M6 6l12 12M18 6L6 18"></path> }
        @case ('search') { <circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.5-3.5"></path> }
        @case ('phone') { <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"></path> }
        @case ('hang-up') { <path transform="rotate(135 12 12)" d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"></path> }
        @case ('video') { <rect x="3" y="6" width="13" height="12" rx="2.5"></rect><path d="M16 10l5-3v10l-5-3"></path> }
        @case ('video-off') { <rect x="3" y="6" width="13" height="12" rx="2.5"></rect><path d="M16 10l5-3v10l-5-3M4 3l16 18"></path> }
        @case ('mic') { <rect x="9" y="3" width="6" height="11" rx="3"></rect><path d="M5 11a7 7 0 0 0 14 0M12 18v3"></path> }
        @case ('mic-off') { <rect x="9" y="3" width="6" height="11" rx="3"></rect><path d="M5 11a7 7 0 0 0 14 0M12 18v3M4 3l16 18"></path> }
        @case ('minimise') { <path d="M6 12h12"></path> }
        @case ('edit') { <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z"></path><path d="M13.5 6.5l4 4"></path> }
        @case ('delete') { <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"></path> }
        @case ('send') { <path d="M12 19V5M5 12l7-7 7 7"></path> }
        @case ('check') { <path d="M5 12.5l4.5 4.5L19 7.5"></path> }
        @case ('lock') { <rect x="5" y="11" width="14" height="9" rx="2"></rect><path d="M8 11V8a4 4 0 0 1 8 0v3"></path> }
        @case ('gone') { <circle cx="12" cy="12" r="9"></circle><path d="M5.7 5.7l12.6 12.6"></path> }
        @case ('missed') { <path d="M17 7L7 17M7 9v8h8"></path> }
        @case ('no-answer') { <path d="M7 17L17 7M9 7h8v8"></path> }
        @case ('people') { <circle cx="9" cy="8" r="3.5"></circle><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.6a6.5 6.5 0 0 1 3 5.4"></path> }
        @case ('add-person') { <circle cx="10" cy="8" r="3.5"></circle><path d="M3 20a7 7 0 0 1 14 0M19 8v6M16 11h6"></path> }
        @case ('plus') { <path d="M12 5v14M5 12h14"></path> }
        @case ('back') { <path d="M15 5l-7 7 7 7"></path> }
        @case ('more') { <circle cx="5" cy="12" r="1"></circle><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle> }
        @case ('leave') { <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M15 8l4 4-4 4M19 12H9"></path> }
        @case ('admin') { <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z"></path> }
      }
    </svg>
  `
})
export class ChatIcon {
  readonly name = input.required<ChatIconName>();
  /** Width and height in pixels. */
  readonly size = input(18);
}
