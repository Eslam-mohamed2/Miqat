import { Injectable, signal } from '@angular/core';

import { t } from '../i18n/i18n';

export interface Toast {
  id: number;
  text: string;
  /** Colour of the dot in front of the text (a CSS colour). Green when left out. */
  tone?: string;
  /** Label of the action on the right, usually "Undo". */
  actionLabel?: string;
  action?: () => void;
  /** How long it stays, in milliseconds. */
  duration: number;
}

export interface ToastOptions {
  tone?: string;
  /** Shows "Undo" and runs this when it is pressed. */
  undo?: () => void;
  actionLabel?: string;
  action?: () => void;
  duration?: number;
}

const DEFAULT_DURATION_MS = 5000;

/**
 * Short confirmations at the bottom of the screen, with an optional "Undo"
 * (design/miqat-2.0: toast with undo). Rendered once, by the app shell.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);

  private nextId = 1;
  private timers = new Map<number, ReturnType<typeof setTimeout>>();

  show(text: string, options: ToastOptions = {}): number {
    const id = this.nextId++;
    const toast: Toast = {
      id,
      text,
      tone: options.tone,
      actionLabel: options.undo ? (options.actionLabel ?? t('Undo')) : options.actionLabel,
      action: options.undo ?? options.action,
      duration: options.duration ?? DEFAULT_DURATION_MS
    };

    // Three at most: an older one makes room rather than stacking up the screen.
    this.toasts.update(list => [...list.slice(-2), toast]);
    this.timers.set(id, setTimeout(() => this.dismiss(id), toast.duration));
    return id;
  }

  /** Runs the toast's action (if any) and removes it. */
  act(toast: Toast): void {
    toast.action?.();
    this.dismiss(toast.id);
  }

  dismiss(id: number): void {
    const timer = this.timers.get(id);
    if (timer) clearTimeout(timer);
    this.timers.delete(id);
    this.toasts.update(list => list.filter(toast => toast.id !== id));
  }
}
