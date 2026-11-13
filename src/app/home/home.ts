import { ChangeDetectionStrategy, Component, afterNextRender, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { Params, isArabic, locale, num, t } from '../core/i18n/i18n';
import { NumPipe, TPipe } from '../core/i18n/t.pipe';
import { prayerLabel } from '../core/utils/prayer-times';
import { zonedParts } from '../core/utils/time-zone';

// Colours of the things drawn in the product pictures. They are the calendar
// colours of the theme, so the pictures follow dark and light like the real screens.
const SAGE = 'var(--mq-green)';
const SKY = 'var(--mq-blue)';
const ROSE = 'var(--mq-rose)';
const LILAC = 'var(--mq-violet)';
const AMBER = 'var(--mq-amber)';
const GOLD = 'var(--mq-accent-text)';
const NEUTRAL = 'var(--lp-neutral)';

/** A word of a quick-add sentence; `tone` marks one Miqat recognised. */
interface Token { text: string; tone?: string; }

interface PreviewEvent {
  time: string; title: string; tone: string; planned: boolean;
  top: number; height: number;
  /** A block too short for two lines shows the time and the title side by side. */
  inline: boolean;
}

interface PreviewDay { dow: string; day: number; hijri: string; today: boolean; events: PreviewEvent[]; }

/** A sentence of the page in the interface language, its digits in the chosen style. */
const say = (text: string, params?: Params) => num(t(text, params));

/** The same for a sentence with a marked part ("The calendar that *plans with you.*"): before, marked, after. */
const sayParts = (text: string) => say(text).split('*');

// The week the pictures show: Sunday 8 to Thursday 12 November 2026.
const DAY_MS = 86_400_000;
const FIRST_DAY = Date.UTC(2026, 10, 8);
const dateWord = (day: number, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(locale(), { ...options, timeZone: 'UTC' }).format(FIRST_DAY + (day - 8) * DAY_MS);

/**
 * The Arabic sample in "Arabic and Hijri". In the English page it is a picture of
 * the Arabic interface and keeps its Arabic digits; in the Arabic page it follows
 * the digits chosen, like everything around it.
 */
const arabicSample = (text: string) => (isArabic() ? num(text) : text.replace(/[0-9]/g, digit => '٠١٢٣٤٥٦٧٨٩'[+digit]));

// The week picture in the hero: one hour is 52px and the grid starts at 09:00.
const HOUR = 52;
const FIRST_HOUR = 9;

const clock = (hours: number) =>
  `${String(Math.floor(hours)).padStart(2, '0')}:${String(Math.round((hours % 1) * 60)).padStart(2, '0')}`;

function block(start: number, end: number, title: string, tone: string, planned = false): PreviewEvent {
  const length = (end - start) * HOUR;
  return {
    time: clock(start), title, tone, planned,
    top: (start - FIRST_HOUR) * HOUR + 1,
    height: Math.max(22, length - 3),
    // Arabic letters stand taller: there a 45-minute block is a single line too.
    inline: length < (isArabic() ? 42 : 34)
  };
}

/** The 60 marks around the hero clock, as two SVG paths. */
function clockTicks(): { minor: string; major: string } {
  let minor = '';
  let major = '';
  for (let i = 0; i < 60; i++) {
    const angle = (i * Math.PI) / 30;
    const x = Math.sin(angle);
    const y = -Math.cos(angle);
    const isMajor = i % 5 === 0;
    const outer = 396;
    const inner = isMajor ? 370 : 386;
    const mark = `M${(430 + x * outer).toFixed(1)} ${(430 + y * outer).toFixed(1)}L${(430 + x * inner).toFixed(1)} ${(430 + y * inner).toFixed(1)}`;
    if (isMajor) major += mark; else minor += mark;
  }
  return { minor, major };
}

/** The landing page (design/miqat-2.0: V2-Landing). The header and the footer are their own components. */
@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink, TPipe, NumPipe],
  templateUrl: './home.html',
  styleUrl: './home.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Home {
  private router = inject(Router);

  // ── Hero clock: the time in Cairo, where Miqat is made ─────────────────────
  readonly ticks = clockTicks();
  readonly hands = this.readHands();

  // ── Hero ────────────────────────────────────────────────────────────────────
  readonly headline = sayParts('The calendar that *plans with you.*');
  readonly hint = sayParts('Press *C* anywhere in Miqat to create anything.');

  // ── Hero: the week picture ──────────────────────────────────────────────────
  readonly month = dateWord(12, { month: 'long' });
  readonly weekSub = say('Week 46 · Jumada II 1448');

  readonly todo = [
    { title: t('Rotate staging secrets'), meta: say('DevOps · 45m'), tone: ROSE },
    { title: t('Add user search endpoint'), meta: say('Backend · 1h'), tone: SAGE },
    { title: t('Draft launch announcement'), meta: say('Launch · 1h 30m'), tone: GOLD }
  ];

  readonly days: PreviewDay[] = [
    { day: 8, hijri: say('28 Jum. I'), today: false, events: [
      block(10, 11, t('Weekly planning'), NEUTRAL), block(15, 15.75, say('Leadership 1:1'), LILAC)] },
    { day: 9, hijri: say('29 Jum. I'), today: false, events: [
      block(9.5, 10, t('Team standup'), SAGE), block(10.25, 11, say('Review PR #212'), GOLD, true),
      block(13, 14.5, t('API design session'), SAGE)] },
    { day: 10, hijri: say('30 Jum. I'), today: false, events: [
      block(9.5, 10, t('Team standup'), SAGE), block(10.5, 12, t('Pagination endpoints'), GOLD, true),
      block(15, 16, t('Product sync'), SKY)] },
    { day: 11, hijri: say('1 Jum. II'), today: false, events: [
      block(9.5, 10, t('Team standup'), SAGE), block(11, 12, t('Hiring loop'), LILAC),
      block(16, 16.9, t('Deploy window'), ROSE)] },
    { day: 12, hijri: say('2 Jum. II'), today: true, events: [
      block(9.5, 10, t('Team standup'), SAGE), block(10, 11.25, t('Write auth spec'), GOLD, true),
      block(12, 13, t('Sprint planning'), GOLD), block(14, 15, t('Design review'), SKY),
      block(15.25, 15.75, t('Reply to mentions'), GOLD, true)] }
  ].map(day => ({ ...day, dow: dateWord(day.day, { weekday: 'short' }) }));

  readonly hours = Array.from({ length: 8 }, (_, i) => ({
    label: `${String(FIRST_HOUR + i + 1).padStart(2, '0')}:00`,
    top: (i + 1) * HOUR
  }));

  readonly prayerLines = [
    { name: 'Dhuhr' as const, time: '11:39', at: 11 + 39 / 60 },
    { name: 'Asr' as const, time: '14:38', at: 14 + 38 / 60 },
    { name: 'Maghrib' as const, time: '16:59', at: 16 + 59 / 60 }
  ].map(prayer => ({
    label: t('{prayer} {time}', { prayer: prayerLabel(prayer.name), time: num(prayer.time) }),
    top: (prayer.at - FIRST_HOUR) * HOUR
  }));

  readonly nowTop = (9.4 - FIRST_HOUR) * HOUR;

  // What someone would type into quick add. The Arabic one is as people say it.
  readonly heroTokens: Token[] = [
    { text: t('Lunch@@quick add') }, { text: t('with@@quick add') }, { text: t('Omar'), tone: SKY },
    { text: t('tomorrow@@quick add'), tone: GOLD }, { text: say('1pm@@quick add'), tone: GOLD },
    { text: t('#Personal'), tone: AMBER }
  ];

  readonly quickNote = sayParts('Fri is your weekend. Omar is free *Sun 13:00* instead.');
  readonly plannedNote = say('Due today at 17:00. Placed in your morning focus window, clear of meetings and Dhuhr.');

  readonly principles = [
    t('Keyboard-first'), t('Arabic and English, right to left'),
    t('Your work week, Sunday to Thursday'), t('You approve every change')
  ];

  // ── Product cards ───────────────────────────────────────────────────────────
  // One sentence in each language, whatever the language of the page.
  readonly enTokens: Token[] = [
    { text: 'Sprint review' }, { text: 'with' }, { text: 'Omar', tone: SKY }, { text: 'Sunday', tone: GOLD },
    { text: '3pm', tone: GOLD }, { text: 'for 45 min', tone: SAGE }, { text: '#Miqat Launch', tone: AMBER }
  ];

  readonly arTokens: Token[] = [
    { text: 'مراجعة السبرنت' }, { text: 'مع' }, { text: 'عمر', tone: SKY }, { text: 'الأحد', tone: GOLD },
    { text: arabicSample('الساعة 3 العصر'), tone: GOLD }, { text: arabicSample('لمدة 45 دقيقة'), tone: SAGE }
  ];

  readonly load = { hours: say('6 h'), of: say('of 8 h planned'), note: say('Balanced. 2 h left for the unexpected.') };

  /** Who is busy when, on a strip that runs from 08:00 to 19:00. */
  readonly availability = [
    { who: t('Eslam'), busy: [[10, 11], [13, 14]] },
    { who: t('Mariam'), busy: [[9.5, 10], [12, 13]] },
    { who: t('Omar'), busy: [[11, 12]] },
    { who: t('Sara'), busy: [[8, 9], [14, 15]] }
  ].map(person => ({
    who: person.who,
    busy: person.busy.map(([from, to]) => ({ left: ((from - 8) / 11) * 100, width: ((to - from) / 11) * 100 }))
  }));

  readonly slot = { left: (7 / 11) * 100, width: (0.75 / 11) * 100 };
  readonly slotNote = say('Sun 15 · 15:00 works for all four');

  readonly prayers = [
    { name: prayerLabel('Dhuhr'), time: '11:39' }, { name: prayerLabel('Asr'), time: '14:38' },
    { name: prayerLabel('Maghrib'), time: '16:59' }, { name: prayerLabel('Isha'), time: '18:18' }
  ];
  readonly prayerDate = say('Thursday 12 November · 2 Jumada II 1448');

  readonly taskRows = [
    { title: t('Write auth spec'), when: say('Thu 10:00'), planned: true },
    { title: t('Review calendar week view'), when: say('Thu 15:15'), planned: true },
    { title: t('Draft launch announcement'), when: t('Schedule@@verb'), planned: false }
  ];

  readonly flowNote = say('+1 day on QA: Beta launch stays on Thu 26 Nov.');

  // ── A day with Miqat ────────────────────────────────────────────────────────
  readonly dayStops = [
    { time: '08:30', title: t('Plan@@day stop'), body: t('Miqat lays out your meetings, places three tasks in the gaps, and you approve the day in one click.'), now: false },
    { time: '09:24', title: t('Meet@@day stop'), body: t('Six minutes before standup, the join button is waiting. Sara joins from Riyadh, an hour ahead.'), now: true },
    { time: '11:39', title: t('Pause@@day stop'), body: say('Dhuhr falls inside Sprint planning, so Miqat suggested starting at 12:00. Everyone said yes.'), now: false },
    { time: '14:00', title: t('Think together'), body: t('The design review opens its whiteboard. Three stickies become tasks before the meeting ends.'), now: false },
    { time: '17:00', title: t('Review@@day stop'), body: t('Five of seven tasks done. What slipped is already waiting in tomorrow’s plan.'), now: false }
  ];

  // ── Arabic and Hijri ────────────────────────────────────────────────────────
  readonly regionList = [
    t('A Sunday-to-Thursday week, with Friday and Saturday as your weekend'),
    t('Arabic and English everywhere, including quick add'),
    t('Hijri dates next to Gregorian, using Umm al-Qura'),
    t('Prayer times for your city, with your chosen method'),
    t('Ramadan working hours, coming soon')
  ];

  // The Arabic day: Arabic in both languages of the page.
  readonly arDay = {
    dow: 'الخميس',
    gregorian: arabicSample('12 نوفمبر'),
    hijri: arabicSample('2 جمادى الآخرة 1448'),
    input: arabicSample('اجتماع مع عمر بكرة الساعة 1 الظهر')
  };

  readonly arAgenda = [
    { time: arabicSample('9:30'), title: 'اجتماع الفريق اليومي', tone: SAGE, prayer: false },
    { time: arabicSample('11:39'), title: 'صلاة الظهر', tone: GOLD, prayer: true },
    { time: arabicSample('12:00'), title: 'تخطيط السبرنت', tone: GOLD, prayer: false },
    { time: arabicSample('2:00'), title: 'مراجعة التصميم', tone: SKY, prayer: false }
  ];

  // ── Questions ───────────────────────────────────────────────────────────────
  readonly faq = [
    { q: t('Do I have to use prayer times?'), a: t('No. Prayer times and Hijri dates are layers you switch on or off. When they are on, Miqat plans around them and warns you when a meeting runs into one.') },
    { q: t('Does Miqat work in Arabic?'), a: t('Yes. The whole interface works right to left, and quick add understands Arabic phrases like “بكرة الساعة ٣ العصر” as well as English.') },
    { q: t('Can I bring my Google calendar?'), a: t('Yes. Import it from Settings or the calendar and choose which Google calendars to copy. Their events appear next to your Miqat tasks, boards and flows. It is a copy, so import again to refresh it.') },
    { q: t('Will Miqat move my meetings on its own?'), a: t('Never. Miqat proposes time blocks for your tasks and suggests better meeting times. You approve every change.') },
    { q: t('Who can see my calendar?'), a: t('Only the people you share it with. Booking links show when you are free, never what your events are.') }
  ];

  /** The open question; -1 when all are closed. */
  readonly openQuestion = signal(0);

  /** What the visitor typed into "Work email": it is carried to the sign-up form. */
  readonly email = signal('');

  constructor() {
    // A link straight to a section (/home#faq) arrives before the section exists.
    afterNextRender(() => {
      const id = decodeURIComponent(location.hash.slice(1));
      if (id) document.getElementById(id)?.scrollIntoView();
    });
  }

  toggleQuestion(index: number): void {
    this.openQuestion.update(open => (open === index ? -1 : index));
  }

  /** Query parameters for the sign-up link at the foot of the page. */
  signUpParams(): { email: string } | null {
    const email = this.email().trim();
    return email ? { email } : null;
  }

  /** Enter in the email field does what the button next to it does. */
  start(): void {
    this.router.navigate(['/register'], { queryParams: this.signUpParams() });
  }

  private readHands() {
    let hours = 9;
    let minutes = 24;
    let seconds = 0;
    try {
      const cairo = zonedParts(new Date(), 'Africa/Cairo');
      hours = cairo.hour;
      minutes = cairo.minute;
      // Zones are offset by whole minutes, so the seconds are the same everywhere.
      seconds = new Date().getUTCSeconds();
    } catch {
      /* A browser without time-zone data shows the design's 09:24. */
    }

    const second = seconds + new Date().getMilliseconds() / 1000;
    const minute = minutes * 60 + second;
    const hour = (hours % 12) * 3600 + minute;
    const ring = 2 * Math.PI * 352;

    return {
      hour: `${((hour / 43200) * 360).toFixed(3)}deg`,
      minute: `${((minute / 3600) * 360).toFixed(3)}deg`,
      second: `${((second / 60) * 360).toFixed(3)}deg`,
      // How much of the day has passed, as an arc on the inner ring.
      dayDash: `${(((hours * 60 + minutes) / 1440) * ring).toFixed(1)} ${ring.toFixed(1)}`
    };
  }
}
