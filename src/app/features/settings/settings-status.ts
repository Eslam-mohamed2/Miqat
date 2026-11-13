import { Injectable, inject, signal } from '@angular/core';

import { ToastService } from '../../core/services/toast.service';

/**
 * What the pill beside a section's title says. Settings have no Save button
 * (design/miqat-2.0: "Changes save automatically"), so every section reports
 * here when a change is on its way, has been kept, or was refused.
 */
@Injectable()
export class SettingsStatus {
  private toasts = inject(ToastService);

  readonly state = signal<'idle' | 'saving' | 'saved' | 'failed'>('idle');

  /** A change is on its way to the server. */
  saving(): void {
    this.state.set('saving');
  }

  /** The change was kept (on the server, or in this browser for a local choice). */
  saved(): void {
    this.state.set('saved');
  }

  /** The change was refused: the pill says so and a toast says why. */
  failed(reason: string): void {
    this.state.set('failed');
    this.toasts.show(reason, { tone: 'var(--mq-late)' });
  }

  /** Back to "Changes save automatically", when another section opens. */
  reset(): void {
    this.state.set('idle');
  }
}
