import { Dictionary, PluralDictionary } from '../i18n';

/**
 * The calendar's views: the page header, the week and day grid, the month, the
 * schedule, the phone's day screen, the left column and the occasion marks.
 */
export const AR_CALENDAR: Dictionary = {
  // How dates, times and lists are put together
  '{weekday}, {day} {month} {year}': '{weekday}، {day} {month} {year}',
  '{weekday}, {day} {month}': '{weekday}، {day} {month}',
  '{day}, {time}': '{day}، {time}',
  ', ': '، ',
  '{h} AM': '{h} ص',
  '{h} PM': '{h} م',
  '{h} h': '{h} س',
  '{m} min': '{m} د',
  '{h} h {m} min': '{h} س {m} د',
  '{amount} behind': 'متأخر {amount}',
  '{amount} ahead': 'متقدم {amount}',
  'All day': 'طوال اليوم',
  'all-day': 'طوال اليوم',
  'Until {time}': 'حتى {time}',
  'Now, {time}': 'الآن، {time}',

  // The page header
  'Week {n}': 'الأسبوع {n}',
  'Weeks {from} – {to}': 'الأسابيع {from} – {to}',
  'Schedule@@view': 'جدول',
  'Previous day': 'اليوم السابق',
  'Next day': 'اليوم التالي',
  'Previous week': 'الأسبوع السابق',
  'Next week': 'الأسبوع التالي',
  'Previous month': 'الشهر السابق',
  'Next month': 'الشهر التالي',
  'Create or search': 'إنشاء أو بحث',
  'Create or search — “Lunch with Omar tomorrow {hour}pm”': 'إنشاء أو بحث — «غداء مع عمر غدًا {hour} م»',
  'Calendars, tasks to plan and layers': 'التقاويم ومهام التخطيط والطبقات',
  'Share times': 'مشاركة الأوقات',
  'Event details': 'تفاصيل الحدث',
  'Nothing selected': 'لا شيء محدد',
  'Pick an event or a task': 'اختر حدثًا أو مهمة',
  'Its time in every zone, who is coming and what it is linked to show here.':
    'هنا يظهر وقته في كل منطقة زمنية، ومن سيحضر، وما يرتبط به.',

  // The week and the day
  'Time zone: {zone}': 'المنطقة الزمنية: {zone}',
  'Time zone the calendar is shown in': 'المنطقة الزمنية التي يُعرض بها التقويم',
  'From your profile': 'من ملفك الشخصي',
  'This device': 'هذا الجهاز',
  'Coordinated Universal Time': 'التوقيت العالمي المنسق',
  'Open {day}': 'فتح {day}',
  'Planned: {title}, {day}, {time}': 'مخططة: {title}، {day}، {time}',
  'Due: {title}, {day}, {time}': 'مستحقة: {title}، {day}، {time}',
  '{title}, {day}, {time}': '{title}، {day}، {time}',
  'Planned: {title}, {time}': 'مخططة: {title}، {time}',
  'Due: {title}, {time}': 'مستحقة: {title}، {time}',
  '{title}, {time}': '{title}، {time}',
  '{label}, invitation not answered': '{label}، دعوة لم يُرد عليها',
  '{label}, declined': '{label}، مرفوضة',

  // Layers and what they say about themselves
  'No city is known for {city}': 'لا مدينة معروفة لـ {city}',
  'Islamic occasions · no country is known for {city}': 'المناسبات الإسلامية · لا دولة معروفة لـ {city}',
  'No country is known for {city}': 'لا دولة معروفة لـ {city}',
  'Islamic occasions · no holidays are built in for {country}': 'المناسبات الإسلامية · لا عطل مضمّنة لـ {country}',
  'No holidays are built in for {country}': 'لا عطل مضمّنة لـ {country}',
  '{country} · from your time zone': '{country} · حسب منطقتك الزمنية',
  'Layers': 'الطبقات',
  'Prayer times': 'أوقات الصلاة',
  'Hijri dates': 'التواريخ الهجرية',
  'Holidays and occasions': 'العطل والمناسبات',
  'Second time zone': 'منطقة زمنية ثانية',
  'Shown under each day': 'تظهر تحت كل يوم',
  'Pick one in Settings': 'اختر واحدة من الإعدادات',
  'Same as the calendar’s zone': 'نفس منطقة التقويم',
  'Prayer times need a city, and none is known for the time zone in your profile.':
    'أوقات الصلاة تحتاج إلى مدينة، ولا مدينة معروفة للمنطقة الزمنية في ملفك الشخصي.',
  'No second time zone is chosen yet. Pick one in Settings.':
    'لم تُختر منطقة زمنية ثانية بعد. اختر واحدة من الإعدادات.',

  // Planning a task
  'Personal': 'شخصي',
  'late': 'متأخرة',
  'Planned for {when}. The due date moved with it.': 'خُططت في {when}. وانتقل تاريخ الاستحقاق معها.',
  'Planned for {when}.': 'خُططت في {when}.',
  'Time block removed.': 'أُزيلت فترة العمل.',
  'Put back as it was.': 'أُعيدت كما كانت.',
  'The task was not changed.': 'لم تتغير المهمة.',
  'To plan': 'للتخطيط',
  'Plan {title}, {due}': 'تخطيط {title}، {due}',
  'Plan {title}': 'تخطيط {title}',
  'Show fewer': 'عرض أقل',
  'Drag a task onto the week to block time for it.': 'اسحب مهمة إلى الأسبوع لتحجز لها وقتًا.',
  'Nothing waits for a time block.': 'لا مهام تنتظر فترة عمل.',

  // The month
  'The day and the month': 'اليوم والشهر',
  'Nothing planned. A good day to protect.': 'لا شيء مخطط. يوم يستحق أن تحافظ عليه.',
  'Open this week': 'فتح هذا الأسبوع',
  '{month} at a glance': '{month} في لمحة',
  'In meetings': 'في الاجتماعات',
  'Focus blocks': 'فترات التركيز',
  'No meetings this month.': 'لا اجتماعات هذا الشهر.',
  'Week {n} is your heaviest: {meetings} of meetings. {focus} of focus time is planned in it.':
    'الأسبوع {n} هو الأكثر ازدحامًا: {meetings} من الاجتماعات. وفيه {focus} مخططة للتركيز.',
  'Week {n} is your heaviest: {meetings} of meetings. No focus time is planned in it yet.':
    'الأسبوع {n} هو الأكثر ازدحامًا: {meetings} من الاجتماعات. ولم يُخطط فيه وقت للتركيز بعد.',
  // Under a bar of the chart, where "Week 46" has no room: the note beside it names the week.
  'W{n}': '{n}',
  'Meeting hours per week: {hours}': 'ساعات الاجتماعات في كل أسبوع: {hours}',

  // The schedule
  'Public holiday': 'عطلة رسمية',
  'Observance': 'مناسبة',
  'Islamic calendar': 'التقويم الهجري',
  'Day {n} of {total}': 'اليوم {n} من {total}',
  'day {n} of {total}': 'اليوم {n} من {total}',
  'Date may vary': 'قد يتغير التاريخ',
  'Planned': 'مخططة',
  'Personal task': 'مهمة شخصية',
  'Invitation · not answered': 'دعوة · لم يُرد عليها',
  'Declined@@invitation': 'مرفوضة',
  'Nothing on the calendar in {month}.': 'لا شيء في التقويم خلال {month}.',

  // The phone's day screen
  '{date}: views, calendars and layers': '{date}: طرق العرض والتقاويم والطبقات',
  'This week': 'هذا الأسبوع',
  'Details': 'التفاصيل',
  'Nothing planned': 'لا شيء مخطط',
  '{title} now': '{title} الآن',
  '{title} in {time}': '{title} بعد {time}',

  // The left column
  'Load@@how full a day is': 'الانشغال',
  'Invitations': 'الدعوات',
  '{n} to answer': 'بانتظار ردك: {n}',
  'from {name}': 'من {name}',
  'someone': 'شخص ما',
  'Answer {title}': 'الرد على {title}',
  'Going': 'سأحضر',
  'Maybe': 'ربما',
  'Can’t go': 'لن أحضر',
  'Your answer was not saved.': 'لم يُحفظ ردك.',
  'Calendars and layers': 'التقاويم والطبقات',
  'Calendars': 'التقاويم',
  'Calendar actions': 'إجراءات التقويم',
  'New event': 'حدث جديد',
  'New calendar': 'تقويم جديد',
  'Importing…': 'جارٍ الاستيراد…',
  // The left-to-right mark (U+200E) before the dot keeps ".ics" together in a right-to-left line.
  'Import an .ics file': 'استيراد ملف \u200E.ics',
  'Import from Google Calendar': 'استيراد من Google Calendar',
  'Export my events': 'تصدير أحداثي',
  'Calendar settings': 'إعدادات التقويم',
  'Rename or recolour {name}': 'إعادة تسمية {name} أو تغيير لونه',
  'Rename or recolour': 'إعادة التسمية أو تغيير اللون',
  'This server has no events yet: the calendar shows tasks.': 'هذا الخادم لا يدعم الأحداث بعد: التقويم يعرض المهام.',
  'Calendar name': 'اسم التقويم',
  'Colour': 'اللون',
  'Colour {n}': 'اللون {n}',
  'Tasks of {name}': 'مهام {name}',
  'That calendar could not be changed.': 'تعذر تغيير هذا التقويم.',
  'Give the calendar a name.': 'أعطِ التقويم اسمًا.',
  'The calendar was not saved.': 'لم يُحفظ التقويم.',
  'Delete the calendar "{name}"?': 'حذف التقويم «{name}»؟',
  'The calendar was not deleted.': 'لم يُحذف التقويم.',
  'Your events were saved as miqat.ics.': 'حُفظت أحداثك في الملف miqat.ics.',
  'The calendar could not be exported.': 'تعذر تصدير التقويم.',
  'That file is too large ({n} MB at most).': 'الملف كبير جدًا (الحد الأقصى {n} ميغابايت).',
  '{n} added': 'أُضيف {n}',
  '{n} updated': 'حُدّث {n}',
  '{n} could not be read': 'تعذرت قراءة {n}',
  'Import finished: {summary}.': 'اكتمل الاستيراد: {summary}.',
  'That file could not be imported.': 'تعذر استيراد هذا الملف.',

  // Reminders in the left column
  'Next reminders': 'التذكيرات القادمة',
  'Untitled': 'بلا عنوان',
  'Rings {when}': 'يرن {when}',
  'Snooze or remove the reminder for {title}': 'تأجيل تذكير {title} أو إزالته',
  'this item': 'هذا العنصر',
  'Snooze or remove': 'تأجيل أو إزالة',
  // The choices that follow say "in" themselves: «بعد غد» would be the day after tomorrow.
  'Ring again in': 'التنبيه مجددًا',
  '{n} minutes@@ring again in': 'بعد {n} دقائق',
  '1 hour@@ring again in': 'بعد ساعة',
  'That reminder was not snoozed.': 'لم يُؤجَّل هذا التذكير.',
  'That reminder was not removed.': 'لم تتم إزالة هذا التذكير.'
};

export const AR_CALENDAR_PLURALS: PluralDictionary = {
  '{n} items': {
    zero: 'لا عناصر', one: 'عنصر واحد', two: 'عنصران', few: '{n} عناصر', many: '{n} عنصرًا', other: '{n} عنصر'
  },
  '+{n} more': {
    zero: '+{n} أخرى', one: '+{n} آخر', two: '+{n} آخران', few: '+{n} أخرى', many: '+{n} أخرى', other: '+{n} أخرى'
  },
  '{n}d late': {
    zero: 'متأخرة', one: 'متأخرة يومًا واحدًا', two: 'متأخرة يومين', few: 'متأخرة {n} أيام', many: 'متأخرة {n} يومًا',
    other: 'متأخرة {n} يوم'
  },
  '{n}h late': {
    zero: 'متأخرة', one: 'متأخرة ساعة واحدة', two: 'متأخرة ساعتين', few: 'متأخرة {n} ساعات', many: 'متأخرة {n} ساعة',
    other: 'متأخرة {n} ساعة'
  },
  '{n} planned tasks': {
    zero: 'لا مهام مخططة', one: 'مهمة مخططة واحدة', two: 'مهمتان مخططتان', few: '{n} مهام مخططة',
    many: '{n} مهمة مخططة', other: '{n} مهمة مخططة'
  },
  '{n} due': {
    zero: 'لا مهام مستحقة', one: 'مهمة مستحقة واحدة', two: 'مهمتان مستحقتان', few: '{n} مهام مستحقة',
    many: '{n} مهمة مستحقة', other: '{n} مهمة مستحقة'
  },
  'Show {n} more': {
    zero: 'عرض المزيد', one: 'عرض مهمة أخرى', two: 'عرض مهمتين أخريين', few: 'عرض {n} مهام أخرى',
    many: 'عرض {n} مهمة أخرى', other: 'عرض {n} مهمة أخرى'
  },
  'Delete the calendar "{name}"? Its {n} events move to your default calendar.': {
    zero: 'حذف التقويم «{name}»؟',
    one: 'حذف التقويم «{name}»؟ سينتقل حدثه الوحيد إلى تقويمك الافتراضي.',
    two: 'حذف التقويم «{name}»؟ سينتقل حدثاه إلى تقويمك الافتراضي.',
    few: 'حذف التقويم «{name}»؟ ستنتقل أحداثه ({n}) إلى تقويمك الافتراضي.',
    many: 'حذف التقويم «{name}»؟ ستنتقل أحداثه ({n}) إلى تقويمك الافتراضي.',
    other: 'حذف التقويم «{name}»؟ ستنتقل أحداثه ({n}) إلى تقويمك الافتراضي.'
  }
};
