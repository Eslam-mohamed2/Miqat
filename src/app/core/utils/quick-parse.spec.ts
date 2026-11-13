import { useLanguageForTests } from '../i18n/i18n';
import { AR_CORE } from '../i18n/ar/core';
import { ParseContext, parseSentence } from './quick-parse';

/** Thursday 12 November 2026, 10:00 in Cairo. */
const context: ParseContext = {
  now: new Date('2026-11-12T08:00:00Z'),
  zone: 'Africa/Cairo',
  people: [
    { id: 'u1', name: 'Omar Khaled' }, { id: 'u2', name: 'Mariam Adel' }, { id: 'u3', name: 'Ahmed Samir' },
    { id: 'u4', name: 'عمر خالد' }, { id: 'u5', name: 'Mark Stone' }
  ],
  projects: [{ id: 'p1', name: 'Miqat Launch' }, { id: 'p2', name: 'Marketing Squad' }, { id: 'p3', name: 'إطلاق ميقات' }],
  calendars: [{ id: 'c1', name: 'Personal' }]
};

const kinds = (text: string) => parseSentence(text, context).pieces
  .filter(piece => piece.kind !== 'text' && piece.kind !== 'link')
  .map(piece => `${piece.kind}:${piece.text}`);

describe('parseSentence', () => {
  it('reads the sentence of the design, part by part', () => {
    const parsed = parseSentence('Sprint review with Omar tomorrow at 3pm for 45 min #Miqat Launch on Meet', context);

    expect(parsed.title).toBe('Sprint review');
    expect(parsed.people.map(person => person.id)).toEqual(['u1']);
    expect(parsed.day).toEqual({ year: 2026, month: 11, day: 13 });
    expect(parsed.time).toEqual({ hour: 15, minute: 0 });
    expect(parsed.minutes).toBe(45);
    expect(parsed.project?.id).toBe('p1');
    expect(parsed.place).toBe('Google Meet');
    expect(parsed.online).toBeTrue();
    expect(kinds(parsed.text)).toEqual([
      'who:Omar', 'when:tomorrow', 'when:at 3pm', 'len:for 45 min', 'proj:#Miqat Launch', 'where:on Meet'
    ]);
  });

  it('reads the same sentence in Arabic', () => {
    const parsed = parseSentence('مراجعة السبرنت مع عمر بكرة الساعة ٣ العصر لمدة ٤٥ دقيقة #إطلاق_ميقات على ميت', context);

    expect(parsed.title).toBe('مراجعة السبرنت');
    expect(parsed.people.map(person => person.id)).toEqual(['u4']);
    expect(parsed.day).toEqual({ year: 2026, month: 11, day: 13 });
    expect(parsed.time).toEqual({ hour: 15, minute: 0 });
    expect(parsed.minutes).toBe(45);
    expect(parsed.project?.id).toBe('p3');
    expect(parsed.place).toBe('Google Meet');
  });

  it('reads a repeating event and the calendar it goes on', () => {
    const parsed = parseSentence('Gym with Ahmed every Friday 7am #Personal', context);

    expect(parsed.repeat).toEqual({ pattern: 'Weekly', interval: 1 });
    expect(parsed.day).toEqual({ year: 2026, month: 11, day: 13 });
    expect(parsed.time).toEqual({ hour: 7, minute: 0 });
    expect(parsed.calendar?.id).toBe('c1');
  });

  it('reads task shorthand: a deadline, an estimate and a priority', () => {
    const parsed = parseSentence('Send invoice to Mariam by Sunday ~30m !high', context);

    expect(parsed.title).toBe('Send invoice');
    expect(parsed.deadline).toBeTrue();
    expect(parsed.day).toEqual({ year: 2026, month: 11, day: 15 });
    expect(parsed.estimate).toBe(30);
    expect(parsed.priority).toBe('High');
    expect(parsed.people.map(person => person.id)).toEqual(['u2']);
    expect(parsed.assignee?.id).toBe('u2');
  });

  it('hands a task over only after "to" or "for": "with Omar" is company', () => {
    const parsed = parseSentence('Review the deck with Omar by friday', context);

    expect(parsed.people.map(person => person.id)).toEqual(['u1']);
    expect(parsed.assignee).toBeNull();
  });

  it('leaves plain words alone, so they can be searched for', () => {
    expect(parseSentence('Design review', context).structured).toBeFalse();
    expect(parseSentence('look at this bug', context).structured).toBeFalse();
    expect(parseSentence('Buy sun cream', context).structured).toBeFalse();
  });

  it('does not take the first word of a sentence for a person', () => {
    const parsed = parseSentence('Mark tests done', context);

    expect(parsed.people).toEqual([]);
    expect(parsed.title).toBe('Mark tests done');
  });

  it('reads a time range as a start and a length', () => {
    const parsed = parseSentence('Review 3-4pm next sunday', context);

    expect(parsed.time).toEqual({ hour: 15, minute: 0 });
    expect(parsed.minutes).toBe(60);
    expect(parsed.day).toEqual({ year: 2026, month: 11, day: 15 });
  });

  it('reads a place that is written with a capital, and a date', () => {
    const parsed = parseSentence('Lunch at Zooba Zamalek on 15 nov 1pm', context);

    expect(parsed.place).toBe('Zooba Zamalek');
    expect(parsed.day).toEqual({ year: 2026, month: 11, day: 15 });
    expect(parsed.time).toEqual({ hour: 13, minute: 0 });
  });

  it('matches a project by the start of its name', () => {
    expect(parseSentence('Workshop #mar tomorrow', context).project?.id).toBe('p2');
  });

  it('reads "g friday" as going to a date, not as something to create', () => {
    const parsed = parseSentence('g friday', context);

    expect(parsed.goTo).toBeTrue();
    expect(parsed.day).toEqual({ year: 2026, month: 11, day: 13 });
    expect(parseSentence('gym tomorrow', context).goTo).toBeFalse();
  });

  it('reads a length on its own, an interval and a call by phone', () => {
    expect(parseSentence('Workshop 90 min tomorrow', context).minutes).toBe(90);
    expect(parseSentence('Standup for an hour and a half', context).minutes).toBe(90);
    expect(parseSentence('Water plants every 3 days', context).repeat).toEqual({ pattern: 'Daily', interval: 3 });
    expect(parseSentence('Report in 3 days', context).day).toEqual({ year: 2026, month: 11, day: 15 });
    expect(parseSentence('Catch up with Omar on the phone', context).place).toBe('Phone call');
  });
});

/** The same sentences typed in Arabic: Arabic digits, Arabic words, Arabic word order. */
describe('parseSentence, in Arabic', () => {
  const arabic: ParseContext = {
    ...context,
    people: [...context.people, { id: 'u6', name: 'مريم عادل' }, { id: 'u7', name: 'سارة علي' }]
  };
  const read = (text: string) => parseSentence(text, arabic);
  const day = (value: number, month = 11) => ({ year: 2026, month, day: value });

  afterEach(() => useLanguageForTests('en'));

  it('reads the day, the hour and the length of an event', () => {
    const parsed = read('اجتماع الفريق غدًا الساعة ٣ مساءً لمدة ساعة');

    expect(parsed.title).toBe('اجتماع الفريق');
    expect(parsed.day).toEqual(day(13));
    expect(parsed.time).toEqual({ hour: 15, minute: 0 });
    expect(parsed.minutes).toBe(60);
    expect(parsed.structured).toBeTrue();
  });

  it('reads today, tomorrow and the day after, however the tanween is typed', () => {
    expect(read('مراجعة اليوم').day).toEqual(day(12));
    expect(read('مراجعة غدًا').day).toEqual(day(13));
    expect(read('مراجعة غداً').day).toEqual(day(13));
    expect(read('مراجعة غدا').day).toEqual(day(13));
    expect(read('مراجعة في الغد').day).toEqual(day(13));
    expect(read('مراجعة بكرة').day).toEqual(day(13));
    expect(read('مراجعة بعد غد').day).toEqual(day(14));
    expect(read('مراجعة بعد غدٍ').structured).toBeTrue();

    // The vowel mark on "غدٍ" belongs to the day word: it is not left behind in the title.
    const marked = read('اجتماع الفريق بعد غدٍ الساعة ٢ ظهرًا');
    expect(marked.day).toEqual(day(14));
    expect(marked.title).toBe('اجتماع الفريق');
  });

  it('does not take "غداء" (lunch) for "غدا" (tomorrow)', () => {
    const parsed = read('غداء غدا ١ ظهرًا');

    expect(parsed.title).toBe('غداء');
    expect(parsed.day).toEqual(day(13));
    expect(parsed.time).toEqual({ hour: 13, minute: 0 });
    expect(read('غداء العمل').structured).toBeFalse();
  });

  it('reads the hour with ص and م, with the words for morning and evening, and after "الساعة"', () => {
    expect(read('مراجعة ٣ م').time).toEqual({ hour: 15, minute: 0 });
    expect(read('مراجعة ٩ ص').time).toEqual({ hour: 9, minute: 0 });
    expect(read('مراجعة ٣ مساءً').time).toEqual({ hour: 15, minute: 0 });
    expect(read('مراجعة ١٠ صباحًا').time).toEqual({ hour: 10, minute: 0 });
    expect(read('مراجعة ١٠ صباحا').time).toEqual({ hour: 10, minute: 0 });
    expect(read('مراجعة ٤ عصرًا').time).toEqual({ hour: 16, minute: 0 });
    expect(read('مراجعة ٣ بعد الظهر').time).toEqual({ hour: 15, minute: 0 });
    expect(read('مراجعة الساعة ٣').time).toEqual({ hour: 15, minute: 0 });
    expect(read('مراجعة الساعة ١٠:٣٠').time).toEqual({ hour: 10, minute: 30 });
    expect(read('سحور ١٢ ليلًا').time).toEqual({ hour: 0, minute: 0 });
    expect(read('سحور منتصف الليل').time).toEqual({ hour: 0, minute: 0 });
  });

  it('reads half past, a quarter past and a quarter to', () => {
    expect(read('مراجعة الساعة ٣ ونصف').time).toEqual({ hour: 15, minute: 30 });
    expect(read('مراجعة الساعة ٣ وربع مساءً').time).toEqual({ hour: 15, minute: 15 });
    expect(read('مراجعة الساعة ٤ إلا ربع').time).toEqual({ hour: 15, minute: 45 });
    expect(read('مراجعة الساعة ٣ والنصف').time).toEqual({ hour: 15, minute: 30 });
    expect(read('مراجعة الساعة ١٠ إلا ربعًا صباحًا').time).toEqual({ hour: 9, minute: 45 });
    expect(read('مراجعة الساعة ٣ ونصف').title).toBe('مراجعة');
  });

  it('reads a time range as a start and a length', () => {
    const parsed = read('مراجعة من ٣ إلى ٤ مساءً');

    expect(parsed.title).toBe('مراجعة');
    expect(parsed.time).toEqual({ hour: 15, minute: 0 });
    expect(parsed.minutes).toBe(60);
    expect(read('ورشة ٩ ص حتى ١١ ص').minutes).toBe(120);
  });

  it('reads the names of the weekdays', () => {
    expect(read('تسليم التقرير يوم الأحد').day).toEqual(day(15));
    expect(read('تسليم التقرير الاثنين').day).toEqual(day(16));
    expect(read('تسليم التقرير الثلاثاء').day).toEqual(day(17));
    expect(read('تسليم التقرير الأربعاء').day).toEqual(day(18));
    expect(read('تسليم التقرير السبت').day).toEqual(day(14));

    const friday = read('اجتماع الجمعة القادمة ٩ ص');
    expect(friday.title).toBe('اجتماع');
    expect(friday.day).toEqual(day(13));
    expect(friday.time).toEqual({ hour: 9, minute: 0 });
  });

  it('reads a written date, a day counted from today and next week', () => {
    const dinner = read('عشاء ١٥ نوفمبر ٨ م');
    expect(dinner.title).toBe('عشاء');
    expect(dinner.day).toEqual(day(15));
    expect(dinner.time).toEqual({ hour: 20, minute: 0 });

    expect(read('رحلة ٢٠ كانون الأول').day).toEqual(day(20, 12));
    expect(read('رحلة في ٣ ديسمبر').title).toBe('رحلة');
    expect(read('تسليم بعد ٣ أيام').day).toEqual(day(15));
    expect(read('تسليم بعد يومين').day).toEqual(day(14));
    expect(read('تسليم بعد أسبوعين').day).toEqual(day(26));
    expect(read('تسليم الأسبوع القادم').day).toEqual(day(19));
  });

  it('reads how long something lasts', () => {
    expect(read('تمرين لمدة ٣٠ دقيقة').minutes).toBe(30);
    expect(read('ورشة ٩٠ دقيقة غدًا').minutes).toBe(90);
    expect(read('ورشة لمدة ساعة ونصف').minutes).toBe(90);
    expect(read('ورشة لمدة ساعتين').minutes).toBe(120);
    expect(read('ورشة لمدة ٣ ساعات').minutes).toBe(180);
    expect(read('ورشة لمدة نصف ساعة').minutes).toBe(30);
    expect(read('ورشة لمدة ساعة و٢٠ دقيقة').minutes).toBe(80);
  });

  it('reads what repeats', () => {
    const gym = read('رياضة كل يوم ٧ ص');
    expect(gym.title).toBe('رياضة');
    expect(gym.repeat).toEqual({ pattern: 'Daily', interval: 1 });
    expect(gym.time).toEqual({ hour: 7, minute: 0 });

    expect(read('اجتماع كل أسبوع').repeat).toEqual({ pattern: 'Weekly', interval: 1 });
    expect(read('تقرير شهريًا').repeat).toEqual({ pattern: 'Monthly', interval: 1 });
    expect(read('تقرير يوميا').repeat).toEqual({ pattern: 'Daily', interval: 1 });
    expect(read('مراجعة كل أسبوعين').repeat).toEqual({ pattern: 'Weekly', interval: 2 });
    expect(read('ري النبات كل ٣ أيام').repeat).toEqual({ pattern: 'Daily', interval: 3 });

    const friday = read('صلاة الجمعة كل جمعة ١٢ ظهرًا');
    expect(friday.repeat).toEqual({ pattern: 'Weekly', interval: 1 });
    expect(friday.day).toEqual(day(13));
    expect(friday.time).toEqual({ hour: 12, minute: 0 });
  });

  it('reads task shorthand: a deadline, an estimate, a priority and who it is for', () => {
    const parsed = read('أرسل الفاتورة لمريم قبل الأحد ~٣٠د !عالية');

    expect(parsed.title).toBe('أرسل الفاتورة');
    expect(parsed.deadline).toBeTrue();
    expect(parsed.day).toEqual(day(15));
    expect(parsed.estimate).toBe(30);
    expect(parsed.priority).toBe('High');
    expect(parsed.people.map(person => person.id)).toEqual(['u6']);
    expect(parsed.assignee?.id).toBe('u6');

    expect(read('راجع العقد ~ساعة ونصف !عاجل').estimate).toBe(90);
    expect(read('راجع العقد ~ساعة ونصف !عاجل').priority).toBe('Critical');
    expect(read('راجع العقد !منخفضة').priority).toBe('Low');
    expect(read('سلّم العرض حتى الخميس').deadline).toBeTrue();
    expect(read('سلّم العرض حتى الخميس').day).toEqual(day(19));
  });

  it('reads people joined to "و" and "مع", and hands a task over only after "لـ" or "إلى"', () => {
    const parsed = read('مراجعة العرض مع عمر وسارة غدًا');

    expect(parsed.title).toBe('مراجعة العرض');
    expect(parsed.people.map(person => person.id).sort()).toEqual(['u4', 'u7']);
    expect(parsed.assignee).toBeNull();
    expect(read('أرسل التقرير إلى مريم').assignee?.id).toBe('u6');

    const call = read('اتصال بسارة بعد غد');
    expect(call.title).toBe('اتصال');
    expect(call.people.map(person => person.id)).toEqual(['u7']);
    expect(call.assignee).toBeNull();
  });

  it('reads a call and a place', () => {
    const call = read('مكالمة مع عمر عبر زوم');
    expect(call.title).toBe('مكالمة');
    expect(call.place).toBe('Zoom');
    expect(call.online).toBeTrue();
    expect(call.people.map(person => person.id)).toEqual(['u4']);

    const lunch = read('غداء في المطعم مع عمر غدًا');
    expect(lunch.title).toBe('غداء');
    expect(lunch.place).toBe('المطعم');
    expect(lunch.online).toBeFalse();
    expect(lunch.day).toEqual(day(13));
  });

  it('reads "اذهب إلى" as going to a date', () => {
    const parsed = read('اذهب إلى الجمعة');

    expect(parsed.goTo).toBeTrue();
    expect(parsed.day).toEqual(day(13));
  });

  it('leaves plain Arabic words alone, so they can be searched for', () => {
    expect(read('مراجعة التصميم').structured).toBeFalse();
    expect(read('شراء هدية').structured).toBeFalse();
    expect(read('من هنا').structured).toBeFalse();
  });

  it('names a call by phone in the interface language', () => {
    expect(read('اتصال بالعميل على الهاتف').place).toBe('Phone call');

    useLanguageForTests('ar', { dictionary: AR_CORE });
    expect(read('اتصال بالعميل على الهاتف').place).toBe('مكالمة هاتفية');
    expect(read('Sync with Omar on the phone').place).toBe('مكالمة هاتفية');
    expect(read('Sync with Omar on Meet').place).toBe('Google Meet');
  });
});
