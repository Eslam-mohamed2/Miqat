import { Pipe, PipeTransform } from '@angular/core';

import { Params, num, t, tCount } from './i18n';

/**
 * The sentence in the interface language (see ./i18n).
 *
 *   {{ 'Theme' | t }}
 *   {{ 'In {n} min' | t: { n: minutes } }}
 *   [attr.aria-label]="'Close' | t"
 *
 * Pure: the language cannot change while the page is open (changing it reloads).
 */
@Pipe({ name: 't', standalone: true })
export class TPipe implements PipeTransform {
  transform(text: string, params?: Params): string {
    return t(text, params);
  }
}

/**
 * A counted phrase: {{ count | tCount: '{n} task' : '{n} tasks' }}
 */
@Pipe({ name: 'tCount', standalone: true })
export class TCountPipe implements PipeTransform {
  transform(count: number, one: string, other: string, params?: Params): string {
    return tCount(count, one, other, params);
  }
}

/**
 * A number, or a ready-made string that holds digits, in the chosen digits:
 * {{ count | num }}   {{ '09:30' | num }}
 */
@Pipe({ name: 'num', standalone: true })
export class NumPipe implements PipeTransform {
  transform(value: number | string | null | undefined): string {
    return num(value);
  }
}
