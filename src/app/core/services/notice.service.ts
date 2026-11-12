import { Injectable, signal } from '@angular/core';

/** A short note shown by the app shell on top of whatever page is open. */
export interface Notice {
  /** Material icon name. */
  icon: string;
  /** Small line above the text, e.g. "From your notifications". */
  label: string;
  /** The message itself. */
  text: string;
}

const VISIBLE_FOR_MS = 9000;

/**
 * Carries a note across a navigation.
 *
 * Opening a notification moves the user to another page - a task, a project, a
 * profile. Without something saying why, they land there with no idea which
 * notification brought them. The page that sends them sets a notice here and the
 * shell shows it on arrival.
 */
@Injectable({
  providedIn: 'root'
})
export class NoticeService {
  readonly notice = signal<Notice | null>(null);

  private timer?: ReturnType<typeof setTimeout>;

  show(notice: Notice) {
    clearTimeout(this.timer);
    this.notice.set(notice);
    this.timer = setTimeout(() => this.notice.set(null), VISIBLE_FOR_MS);
  }

  clear() {
    clearTimeout(this.timer);
    this.notice.set(null);
  }
}
