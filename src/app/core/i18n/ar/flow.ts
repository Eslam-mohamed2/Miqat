import { Dictionary, PluralDictionary } from '../i18n';

/**
 * Quick add (Ctrl K), Plan my day and the Inbox.
 *
 * Words every screen shares (Cancel, Today, Tasks, …) are in common.ts and are
 * not repeated here.
 */
export const AR_FLOW: Dictionary = {
  // ── Quick add: the pages it can open ────────────────────────────────────────
  'Week, month and day': 'أسبوع وشهر ويوم',
  'Place today’s tasks': 'وزّع مهام اليوم على وقتك',
  'List and board': 'قائمة ولوحة',
  'Sketch and plan visually': 'ارسم وخطّط بصريًا',
  'Map your tasks as a flow': 'اعرض مهامك كمخطط مترابط',
  'Friends and requests': 'الأصدقاء والطلبات',
  'Mentions, invites, updates': 'إشارات ودعوات وتحديثات',
  'Profile, theme and account': 'الملف الشخصي والمظهر والحساب',

  // ── Quick add: the dialog ───────────────────────────────────────────────────
  'Quick add': 'إضافة سريعة',
  'Create or search': 'إنشاء أو بحث',
  'Create or search: type it the way you would say it': 'إنشاء أو بحث: اكتب كما تتحدث',
  'What to add': 'ما تريد إضافته',
  'Type': 'النوع',
  'Sentence language': 'لغة الجملة',
  'Go to a date · type a day': 'الانتقال إلى تاريخ · اكتب يومًا',
  'Create · type it the way you’d say it': 'إنشاء · اكتب كما تتحدث',
  'Go to a date': 'الانتقال إلى تاريخ',
  'Go to a date…': 'الانتقال إلى تاريخ…',
  'Opens the calendar on that day': 'يفتح التقويم على ذلك اليوم',
  'Type a day: today, friday, 15 nov': 'اكتب يومًا: اليوم، الجمعة، 15 نوفمبر',
  'Type a day: “today”, “friday”, “15 nov”.': 'اكتب يومًا: «اليوم»، «الجمعة»، «15 نوفمبر».',
  'Searching': 'جارٍ البحث',
  'Add task': 'إضافة مهمة',
  'Add to calendar': 'إضافة إلى التقويم',
  'Open that day': 'فتح ذلك اليوم',
  'Create and invite': 'إنشاء ودعوة',
  'Edit details': 'تعديل التفاصيل',
  'Go@@to the day': 'انتقال',
  'Move@@through the list': 'تنقّل',

  // ── Quick add: the list ─────────────────────────────────────────────────────
  'Run a command': 'نفّذ أمرًا',
  'Or run a command': 'أو نفّذ أمرًا',
  'Go to': 'انتقل إلى',
  'New task': 'مهمة جديدة',
  'New task “{title}”': 'مهمة جديدة «{title}»',
  'New event': 'حدث جديد',
  'New project': 'مشروع جديد',
  'Find a time with {name}': 'ابحث عن وقت مع {name}',
  'Hide prayer times layer': 'إخفاء طبقة أوقات الصلاة',
  'Show prayer times layer': 'إظهار طبقة أوقات الصلاة',
  'In a browser tab Ctrl T opens a new tab: Alt T does the same here': 'في المتصفح يفتح Ctrl T تبويبًا جديدًا: استخدم Alt T هنا',
  'Type g and a day, then Enter': 'اكتب g ثم يومًا، ثم اضغط Enter',
  'Type a capital P, then Enter': 'اكتب حرف P كبيرًا، ثم اضغط Enter',
  'Prayer times are shown on the calendar': 'أوقات الصلاة ظاهرة في التقويم',
  'Prayer times are hidden': 'أوقات الصلاة مخفية',
  'Person': 'شخص',
  'Personal': 'شخصي',
  'Pending@@task': 'للتنفيذ',
  'all day': 'طوال اليوم',
  'repeats': 'يتكرر',

  // ── Quick add: the preview ──────────────────────────────────────────────────
  'No project': 'بلا مشروع',
  'Low priority': 'أولوية منخفضة',
  'Medium priority': 'أولوية متوسطة',
  'High priority': 'أولوية عالية',
  'Critical priority': 'أولوية حرجة',
  'When': 'الموعد',
  'With': 'مع',
  'Length': 'المدة',
  'Where': 'المكان',
  'Repeats': 'التكرار',
  'For@@who': 'لمن',
  '{weekday}, {day} {month}': '{weekday}، {day} {month}',
  'Moved from {day}': 'نُقل من {day}',
  'No time given': 'لم يُحدَّد وقت',
  'Just you': 'أنت فقط',
  'Add someone by typing their name': 'أضف شخصًا بكتابة اسمه',
  'Checking their calendar…': 'جارٍ التحقق من التوفّر…',
  'Their free time could not be checked': 'تعذّر التحقق من التوفّر',
  'Free then': 'متاح حينها',
  'Busy then': 'مشغول حينها',
  'Everyone is free then': 'الجميع متاحون حينها',
  '{name} is busy then': 'لدى {name} ارتباط حينها',
  '{names} are busy then': 'لدى {names} ارتباط حينها',
  'same time as you': 'نفس توقيتك',
  'same time as you in {city}': 'نفس توقيتك، في {city}',
  '{duration} behind you': 'متأخر عنك بمقدار {duration}',
  '{duration} behind you in {city}': 'في {city}، متأخر عنك بمقدار {duration}',
  '{duration} ahead of you': 'متقدّم عليك بمقدار {duration}',
  '{duration} ahead of you in {city}': 'في {city}، متقدّم عليك بمقدار {duration}',
  'Your default length': 'المدة الافتراضية لديك',
  'Runs across {prayer} ({time})': 'يتخلله وقت {prayer} ({time})',
  'Ends before {prayer} ({time})': 'ينتهي قبل {prayer} ({time})',
  'No place yet': 'لا مكان بعد',
  'Add one with “at” or “on Meet”': 'أضفه بكتابة «في …» أو «على زوم»',
  'Saved as the place': 'حُفظ كمكان',
  'Saved as the place. Add the link in the details': 'حُفظ كمكان. أضف الرابط في التفاصيل',
  'Does not repeat': 'لا يتكرر',
  'Until you stop it': 'حتى توقفه',
  'Add “every week” to repeat it': 'أضف «كل أسبوع» ليتكرر',
  'Every week': 'كل أسبوع',
  'Every {weekday}': 'كل أسبوع يوم {weekday}',
  'No reminder': 'بلا تذكير',
  'Reminder when it starts': 'تذكير عند البدء',
  'Reminder {duration} before': 'تذكير قبل الموعد بمقدار {duration}',
  'Your calendar': 'تقويمك',
  'No due date': 'بلا تاريخ استحقاق',
  'Add a day: “by Sunday”': 'أضف يومًا: «قبل الأحد»',
  'End of your working day': 'نهاية يوم عملك',
  'They are told when you add it': 'يصله إشعار عند إضافتها',
  'Write “to {name}” to hand it over': 'اكتب «إلى {name}» لإسنادها إليه',
  'Write “to” and a name to hand it over': 'اكتب «إلى» ثم اسمًا لإسنادها',
  'Planned for {day} {time}': 'مخططة {day} {time}',
  'Used when you plan your day': 'يُستخدم عند تخطيط يومك',
  'No estimate': 'بلا تقدير',
  // Arabic estimates are read too ("~٣٠د"); the digits follow the choice made in Settings.
  'Add one like ~30m': 'أضف تقديرًا مثل ~30د',
  'Calendars are for events: use a project name': 'التقاويم للأحداث: استخدم اسم مشروع',
  'Add one with #name': 'أضفه بكتابة # ثم اسمه',

  // ── Quick add: the note about the time ──────────────────────────────────────
  'Today is {weekday}, outside your working week.': 'اليوم {weekday}، خارج أسبوع عملك.',
  'Tomorrow is {weekday}, outside your working week.': 'غدًا {weekday}، خارج أسبوع عملك.',
  'That day is {weekday}, outside your working week.': 'ذلك اليوم {weekday}، خارج أسبوع عملك.',
  '{range} is outside your working hours ({hours}).': '{range} خارج ساعات العمل ({hours}).',
  'You already have something at that time.': 'لديك ارتباط آخر في ذلك الوقت.',
  '{name} is busy at that time.': 'لدى {name} ارتباط في ذلك الوقت.',
  '{names} are busy at that time.': 'لدى {names} ارتباط في ذلك الوقت.',
  'A guest': 'ضيف',
  'Looking for times that work…': 'جارٍ البحث عن أوقات مناسبة…',
  'Free times could not be looked up.': 'تعذّر البحث عن الأوقات المتاحة.',
  'No free time was found in the next two weeks.': 'لا يوجد وقت متاح خلال الأسبوعين القادمين.',
  'These times work for you:': 'هذه الأوقات تناسبك:',
  'These times work for both of you:': 'هذه الأوقات تناسبكما:',
  'These times work for all of you:': 'هذه الأوقات تناسبكم جميعًا:',

  // ── Quick add: the phone sheet ──────────────────────────────────────────────
  'Plan it for me': 'خطّطها لي',
  'Next {weekday}': 'يوم {weekday} القادم',
  '1 h': 'ساعة',
  'No repeat': 'بلا تكرار',
  'No free {length} in your working hours on {day}.': 'لا توجد فترة متاحة مدتها {length} ضمن ساعات العمل يوم {day}.',

  // ── Quick add: what it says afterwards ──────────────────────────────────────
  'With {names}': 'مع {names}',
  '“{title}” is on your calendar · {day} {time}': '«{title}» في تقويمك · {day} {time}',
  '“{title}” is on your calendar · {day} {time} · {names} invited': '«{title}» في تقويمك · {day} {time} · تمت دعوة {names}',
  'The event was not created.': 'لم يُنشأ الحدث.',
  'The task was not created.': 'لم تُنشأ المهمة.',
  'Task added: “{title}”': 'أُضيفت المهمة: «{title}»',
  'Task added: “{title}” · planned {day} {time}': 'أُضيفت المهمة: «{title}» · مخططة {day} {time}',
  'Task added: “{title}” · due {day}': 'أُضيفت المهمة: «{title}» · تستحق {day}',

  // ── Plan my day: the head and the steps ─────────────────────────────────────
  'Back to week': 'العودة إلى الأسبوع',
  'Steps': 'الخطوات',
  'Review yesterday': 'مراجعة الأمس',
  'Choose tasks': 'اختيار المهام',
  'Schedule@@step': 'الجدولة',
  'Commit': 'الاعتماد',
  'Commit plan': 'اعتماد الخطة',
  'Loading your day': 'جارٍ تحميل يومك',
  'Nothing to save: these tasks are already planned at these times': 'لا شيء للحفظ: هذه المهام مخططة بالفعل في هذه الأوقات',
  'Tick at least one task first': 'حدّد مهمة واحدة على الأقل أولًا',

  // ── Plan my day: choosing tasks ─────────────────────────────────────────────
  'What deserves today?': 'ما الذي يستحق يومك؟',
  'Tick tasks to place them. Miqat finds the time.': 'حدّد المهام لوضعها في يومك، وميقات يجد لها الوقت.',
  'Loading your tasks': 'جارٍ تحميل مهامك',
  'Your tasks could not be loaded.': 'تعذّر تحميل مهامك.',
  'Nothing is due today and nothing is late.': 'لا شيء مستحق اليوم ولا شيء متأخر.',
  'Open your tasks': 'افتح مهامك',
  'Planned for today': 'مخططة لليوم',
  'Due today': 'مستحقة اليوم',
  'Overdue': 'متأخرة',
  'From mentions': 'من الإشارات',
  'No room today': 'لا متسع اليوم',
  'No estimate on this task: half an hour is assumed': 'لا تقدير لهذه المهمة: افتُرضت نصف ساعة',
  'Show fewer': 'عرض أقل',
  'Due {date}': 'تستحق {date}',
  'Today {time}': 'اليوم {time}',
  'Just now': 'الآن',

  // ── Plan my day: the day ────────────────────────────────────────────────────
  'Today’s schedule': 'جدول اليوم',
  'Proposed day': 'اليوم المقترح',
  'Dashed blocks are Miqat’s suggestions. Drag to adjust.': 'الفترات المتقطعة اقتراحات ميقات. اسحبها للتعديل.',
  'Shuffle': 'إعادة ترتيب',
  '{title}, {time}, {estimate}. Arrow up and down move it': '{title}، {time}، {estimate}. حرّكها بسهمَي الأعلى والأسفل',
  'Now, {time}': 'الآن، {time}',
  'Lunch': 'الغداء',
  'Protected': 'محمي',
  '{hour} AM': '{hour} ص',
  '{hour} PM': '{hour} م',
  'These tasks fit today in one way only': 'هذه المهام لا تتسع اليوم إلا بترتيب واحد',
  'Tick two or more tasks to shuffle them': 'حدّد مهمتين أو أكثر لإعادة ترتيبها',
  'There is no free time long enough for it today': 'لا يوجد اليوم وقت متاح يكفيها',
  'The plan could not be saved. Try again.': 'تعذّر حفظ الخطة. حاول مرة أخرى.',
  'The plan was taken back': 'تم التراجع عن الخطة',

  // ── Plan my day: workload, guardrails, yesterday ────────────────────────────
  'Workload': 'حِمل العمل',
  'Meetings': 'الاجتماعات',
  'Focus on tasks': 'تركيز على المهام',
  'Free': 'متاح',
  'of {duration} workday': 'من أصل {duration} ليوم العمل',
  'Meetings {meetings}, tasks {tasks}, of {duration} workday': 'الاجتماعات {meetings}، المهام {tasks}، من أصل {duration} ليوم العمل',
  'Over capacity by {duration}.': 'تجاوزت طاقة اليوم بمقدار {duration}.',
  'Over capacity by {duration}. Miqat suggests moving “{title}” to tomorrow.': 'تجاوزت طاقة اليوم بمقدار {duration}. يقترح ميقات نقل «{title}» إلى الغد.',
  'Over capacity by {duration}. Miqat suggests moving “{title}” to {weekday}.': 'تجاوزت طاقة اليوم بمقدار {duration}. يقترح ميقات نقل «{title}» إلى يوم {weekday}.',
  'Balanced. {duration} left for the unexpected.': 'يوم متوازن. يتبقى {duration} للطوارئ.',
  'Your working day ended at {time}: nothing more can be placed today.': 'انتهى يوم عملك الساعة {time}: لا يمكن وضع المزيد اليوم.',
  'Meetings are {duration} over your {hours} h cap.': 'الاجتماعات تتجاوز حدّك البالغ {hours} س بمقدار {duration}.',
  'Guardrails': 'الضوابط',
  'Buffer after meetings': 'فاصل بعد الاجتماعات',
  'Plan around prayer times': 'التخطيط حول أوقات الصلاة',
  'Not available for your time zone': 'غير متاح لمنطقتك الزمنية',
  'Prayer times are worked out for the main city of your time zone, and yours is not on the list':
    'تُحسب أوقات الصلاة للمدينة الرئيسية في منطقتك الزمنية، ومنطقتك ليست في القائمة',
  'Protect lunch': 'حماية وقت الغداء',
  'Cap meetings at {hours} h': 'حد الاجتماعات {hours} س',
  'Warn when meetings pass the cap': 'تنبيه عند تجاوز الاجتماعات للحد',
  'Nothing was carried over.': 'لم يُرحَّل شيء.',
  'Nothing was planned or due yesterday.': 'لم يكن هناك ما هو مخطط أو مستحق أمس.',
  'Loading': 'جارٍ التحميل',

  // ── Inbox: kinds, tabs and what a notification is about ─────────────────────
  'Mention': 'إشارة',
  'Invite@@noun': 'دعوة',
  'Invitation': 'دعوة',
  'Friend request': 'طلب صداقة',
  'Update@@noun': 'تحديث',
  'Weekly recap': 'الملخص الأسبوعي',
  'Invites': 'الدعوات',
  'Requests': 'الطلبات',
  'Updates': 'التحديثات',
  'Your account': 'حسابك',
  'New friend': 'صديق جديد',
  'Task update': 'تحديث مهمة',
  'Event update': 'تحديث حدث',
  'Project update': 'تحديث مشروع',
  'Notification': 'إشعار',
  'Someone': 'شخص ما',
  'M@@the first letter of Miqat': 'م',

  // ── Inbox: the sentences the API writes, said again ─────────────────────────
  // An Arabic word always stands between the person and the title: two Latin names
  // side by side would join into one left-to-right run and misplace the quotation marks.
  '{actor} commented on "{name}": {text}': 'علّق {actor} على «{name}»: {text}',
  '{actor} mentioned you in "{name}".': 'أشار إليك {actor} في «{name}».',
  '{actor} mentioned you in a project.': 'أشار إليك {actor} في مشروع.',
  '{actor} mentioned you in a task.': 'أشار إليك {actor} في مهمة.',
  '{actor} mentioned you in a comment.': 'أشار إليك {actor} في تعليق.',
  '{actor} invited you to "{name}".': 'دعاك {actor} إلى «{name}».',
  '{actor} accepted the invitation to "{name}".': 'قبِل {actor} الدعوة إلى «{name}».',
  '{actor} declined the invitation to "{name}".': 'رفض {actor} الدعوة إلى «{name}».',
  '{actor} may come to "{name}".': 'قد يحضر {actor} الحدث «{name}».',
  '{actor} changed one date of "{name}".': 'عدّل {actor} أحد مواعيد «{name}».',
  '{actor} cancelled one date of "{name}".': 'ألغى {actor} أحد مواعيد «{name}».',
  '{actor} restored one date of "{name}".': 'أعاد {actor} أحد مواعيد «{name}».',
  '{actor} changed "{name}".': 'عدّل {actor} الحدث «{name}».',
  '{actor} cancelled "{name}".': 'ألغى {actor} الحدث «{name}».',
  '{actor} sent you a friend request.': 'أرسل إليك {actor} طلب صداقة.',
  '{actor} accepted your friend request.': 'قبِل {actor} طلب صداقتك.',
  '{actor} added you to "{name}".': 'أضافك {actor} إلى «{name}».',
  '{actor} assigned you "{name}".': 'أسند إليك {actor} المهمة «{name}».',
  '{actor} assigned "{name}" to you.': 'أسند إليك {actor} المهمة «{name}».',
  '{actor} completed "{name}".': 'أكمل {actor} المهمة «{name}».',
  '"{name}" is due now.': 'حان موعد استحقاق «{name}».',
  '"{name}" has started.': 'بدأ «{name}».',
  '"{name}" starts now.': 'يبدأ «{name}» الآن.',

  // The short titles the API gives its notifications
  'New comment': 'تعليق جديد',
  'You were mentioned': 'تمت الإشارة إليك',
  'Invitation answered': 'رد على الدعوة',
  'Event invitation': 'دعوة إلى حدث',
  'Event changed': 'تغيّر الحدث',
  'Event cancelled': 'أُلغي الحدث',
  'New Friend Request': 'طلب صداقة جديد',
  'Friend Request Accepted': 'قُبل طلب الصداقة',
  'Added to a project': 'أُضفت إلى مشروع',
  'Task due soon': 'مهمة تستحق قريبًا',
  'Task assigned to you': 'أُسندت إليك مهمة',
  'Task assigned': 'أُسندت مهمة',
  'Task completed': 'اكتملت المهمة',

  // ── Inbox: the sentences built here ─────────────────────────────────────────
  '{name} mentioned you in {where}': 'أشار إليك {name} في «{where}»',
  '{name} mentioned you in a comment on {where}': 'أشار إليك {name} في تعليق على «{where}»',
  '{name} mentioned you in a project': 'أشار إليك {name} في مشروع',
  '{name} mentioned you in a task': 'أشار إليك {name} في مهمة',
  '{name} mentioned you in a comment': 'أشار إليك {name} في تعليق',
  '{name} invited you to {title}': 'دعاك {name} إلى «{title}»',
  '{name} wants to connect': 'يريد {name} التواصل معك',
  'Friend request · answer it here': 'طلب صداقة · أجب عنه هنا',
  'Your week {n} in review': 'مراجعة أسبوعك رقم {n}',

  // ── Inbox: the list ─────────────────────────────────────────────────────────
  'Inbox items': 'عناصر الوارد',
  'All read': 'الكل مقروء',
  'Mark all read': 'تحديد الكل كمقروء',
  'Earlier@@older items': 'الأقدم',
  'Loading your inbox': 'جارٍ تحميل الوارد',
  'Loading your inbox…': 'جارٍ تحميل الوارد…',
  'Could not load notifications.': 'تعذّر تحميل الإشعارات.',
  'Could not load more notifications.': 'تعذّر تحميل المزيد من الإشعارات.',
  'Could not mark all as read.': 'تعذّر تحديد الكل كمقروء.',
  'Unread': 'غير مقروء',
  'Snoozed': 'مؤجَّل',
  'All clear.': 'لا شيء بانتظارك.',
  'Nothing here needs you. Enjoy the quiet.': 'لا شيء هنا يحتاج إليك. استمتع بالهدوء.',
  'Load older updates': 'تحميل تحديثات أقدم',
  'Archive': 'أرشفة',
  'Snooze': 'تأجيل',
  '{duration} in meetings': '{duration} في الاجتماعات',
  '{duration} of focus': '{duration} تركيز',

  // ── Inbox: the reading pane ─────────────────────────────────────────────────
  'Selected item': 'العنصر المحدد',
  'Snooze until': 'تأجيل حتى',
  'In 1 hour': 'بعد ساعة',
  'This evening · {time}': 'هذا المساء · {time}',
  'Tomorrow · {time}': 'غدًا · {time}',
  'Next week · {day} {time}': 'الأسبوع القادم · {day} {time}',
  'Archived': 'تمت الأرشفة',
  'Snoozed until {day} {time}': 'مؤجَّل حتى {day} {time}',
  '{date}, {time}': '{date}، {time}',
  'Nothing open.': 'لا عنصر مفتوح.',
  'Pick an item from the list.': 'اختر عنصرًا من القائمة.',
  'Inbox zero.': 'الوارد فارغ.',
  'Back to your day.': 'عُد إلى يومك.',
  'Open calendar': 'فتح التقويم',

  // Mentions
  'Loading the conversation': 'جارٍ تحميل المحادثة',
  'There are no comments to show for this mention.': 'لا تعليقات لعرضها لهذه الإشارة.',
  'Reply to {name}': 'الرد على {name}',
  'Reply to them': 'الرد',
  'Write a reply, @mention someone…': 'اكتب ردًا، واستخدم @ للإشارة إلى أحد…',
  'Make it a task': 'تحويل إلى مهمة',
  'A reply is posted as a comment on a task, and this mention is on a project': 'يُنشر الرد تعليقًا على مهمة، وهذه الإشارة في مشروع',
  'The task this mention is on could not be found': 'تعذّر العثور على المهمة التي وردت فيها الإشارة',
  'Reply posted on the task': 'نُشر الرد على المهمة',
  'The reply was not posted.': 'لم يُنشر الرد.',
  'Follow up: {title}': 'متابعة: {title}',
  'From {name}’s mention.': 'من إشارة {name}.',
  'From {name}’s mention in “{title}”.': 'من إشارة {name} في «{title}».',
  'From your mentions': 'من إشاراتك',
  'From your notifications': 'من إشعاراتك',

  // Invitations
  'Organizer': 'المنظِّم',
  'Guests': 'الضيوف',
  'Unknown': 'غير معروف',
  'No place given': 'لم يُحدَّد مكان',
  '{name} · {city}, {time} their time': '{name} · {time} بتوقيت {city}',
  'repeats daily': 'يتكرر يوميًا',
  'repeats weekly': 'يتكرر أسبوعيًا',
  'repeats monthly': 'يتكرر شهريًا',
  'repeats yearly': 'يتكرر سنويًا',
  'Your {weekday} around it': 'يومك ({weekday}) حول هذا الموعد',
  'Checking your calendar…': 'جارٍ فحص تقويمك…',
  'You have “{title}” at that time.': 'لديك «{title}» في هذا الوقت.',
  'You’re free.': 'وقتك متاح.',
  'You’re free. It runs across {prayer} ({time}).': 'وقتك متاح. يتخلله وقت {prayer} ({time}).',
  'You’re free, and it ends before {prayer} ({time}).': 'وقتك متاح، وينتهي قبل {prayer} ({time}).',
  'Your response': 'ردّك',
  'Going': 'سأحضر',
  'Maybe': 'ربما',
  'Your answer was not saved.': 'لم يُحفظ ردك.',
  'Propose a different time': 'اقتراح وقت آخر',

  // Friend requests
  ', @@between names': '، ',
  'No friends in common yet': 'لا أصدقاء مشتركين بعد',
  'Their profile could not be loaded': 'تعذّر تحميل الملف الشخصي',
  'Loading their profile…': 'جارٍ تحميل الملف الشخصي…',
  'You and {name} are now friends. You can see each other’s free and busy times.':
    'أصبحت أنت و{name} صديقين. يرى كلٌّ منكما أوقات الآخر المتاحة والمشغولة.',
  'Declined. {name} won’t be told.': 'تم الرفض. لن يصل {name} إشعار بذلك.',
  'The request could not be answered.': 'تعذّر الرد على الطلب.',

  // Updates and reminders
  'due {date}': 'الاستحقاق {date}',
  'blocked by another task': 'بانتظار مهمة أخرى',
  'On your calendar · {day}': 'في تقويمك · {day}',
  'On your calendar · {day} {time}': 'في تقويمك · {day} {time}',
  'On your calendar · {day} {time} – {end}': 'في تقويمك · {day} {time} – {end}',
  'Open task': 'فتح المهمة',
  'Open project': 'فتح المشروع',
  'Open in calendar': 'فتح في التقويم',
  'Open settings': 'فتح الإعدادات',
  'Open requests': 'فتح الطلبات',
  'Open profile': 'فتح الملف الشخصي',
  'Remind me in 1 h': 'ذكّرني بعد ساعة',

  // The weekly recap
  'Tasks done': 'مهام منجزة',
  'In meetings': 'في الاجتماعات',
  'Focus time': 'وقت التركيز',
  'Plans approved': 'خطط معتمدة',
  '{done} of {total}': '{done} من {total}',
  '{weekday} had the most meetings: {duration}. Focus time is what your planned task blocks added up to.':
    'يوم {weekday} كان الأكثر اجتماعات: {duration}. وقت التركيز هو مجموع فترات العمل التي خططتها لمهامك.',
  'No meetings that week. Focus time is what your planned task blocks added up to.':
    'لا اجتماعات في ذلك الأسبوع. وقت التركيز هو مجموع فترات العمل التي خططتها لمهامك.',
  'See {month}': 'عرض شهر {month}'
};

export const AR_FLOW_PLURALS: PluralDictionary = {
  // ── Quick add ───────────────────────────────────────────────────────────────
  '{name} and {n} more': {
    zero: '{name}', one: '{name} وشخص آخر', two: '{name} وشخصان آخران',
    few: '{name} و{n} آخرين', many: '{name} و{n} آخرين', other: '{name} و{n} آخرين'
  },
  '{n} open tasks': {
    zero: 'لا مهام مفتوحة', one: 'مهمة مفتوحة واحدة', two: 'مهمتان مفتوحتان',
    few: '{n} مهام مفتوحة', many: '{n} مهمة مفتوحة', other: '{n} مهمة مفتوحة'
  },
  'Every {n} days': {
    zero: 'كل يوم', one: 'كل يوم', two: 'كل يومين', few: 'كل {n} أيام', many: 'كل {n} يومًا', other: 'كل {n} يوم'
  },
  'Every {n} weeks': {
    zero: 'كل أسبوع', one: 'كل أسبوع', two: 'كل أسبوعين', few: 'كل {n} أسابيع', many: 'كل {n} أسبوعًا', other: 'كل {n} أسبوع'
  },
  'Every {n} months': {
    zero: 'كل شهر', one: 'كل شهر', two: 'كل شهرين', few: 'كل {n} أشهر', many: 'كل {n} شهرًا', other: 'كل {n} شهر'
  },
  'Every {n} years': {
    zero: 'كل سنة', one: 'كل سنة', two: 'كل سنتين', few: 'كل {n} سنوات', many: 'كل {n} سنة', other: 'كل {n} سنة'
  },

  // ── Plan my day ─────────────────────────────────────────────────────────────
  '{n}d late': {
    zero: 'متأخرة', one: 'متأخرة يومًا واحدًا', two: 'متأخرة يومين',
    few: 'متأخرة {n} أيام', many: 'متأخرة {n} يومًا', other: 'متأخرة {n} يوم'
  },
  'Show {n} more': {
    zero: 'عرض المزيد', one: 'عرض مهمة أخرى', two: 'عرض مهمتين أخريين',
    few: 'عرض {n} مهام أخرى', many: 'عرض {n} مهمة أخرى', other: 'عرض {n} مهمة أخرى'
  },
  '{n} minutes to reset': {
    zero: 'بلا فاصل', one: 'دقيقة واحدة لاستعادة النشاط', two: 'دقيقتان لاستعادة النشاط',
    few: '{n} دقائق لاستعادة النشاط', many: '{n} دقيقة لاستعادة النشاط', other: '{n} دقيقة لاستعادة النشاط'
  },
  '{n} ticked tasks do not fit in what is left of today.': {
    one: 'مهمة محددة واحدة لا يتسع لها ما بقي من اليوم.',
    two: 'مهمتان محددتان لا يتسع لهما ما بقي من اليوم.',
    few: '{n} مهام محددة لا يتسع لها ما بقي من اليوم.',
    many: '{n} مهمة محددة لا يتسع لها ما بقي من اليوم.',
    other: '{n} مهمة محددة لا يتسع لها ما بقي من اليوم.'
  },
  'You finished {done} of {n} tasks planned or due yesterday.': {
    one: 'أنجزت {done} من مهمة واحدة كانت مخططة أو مستحقة أمس.',
    two: 'أنجزت {done} من مهمتين كانتا مخططتين أو مستحقتين أمس.',
    few: 'أنجزت {done} من {n} مهام كانت مخططة أو مستحقة أمس.',
    many: 'أنجزت {done} من {n} مهمة كانت مخططة أو مستحقة أمس.',
    other: 'أنجزت {done} من {n} مهمة كانت مخططة أو مستحقة أمس.'
  },
  '{n} still open are listed under Overdue.': {
    one: 'مهمة واحدة ما زالت مفتوحة وتظهر ضمن «متأخرة».',
    two: 'مهمتان ما زالتا مفتوحتين وتظهران ضمن «متأخرة».',
    few: '{n} مهام ما زالت مفتوحة وتظهر ضمن «متأخرة».',
    many: '{n} مهمة ما زالت مفتوحة وتظهر ضمن «متأخرة».',
    other: '{n} مهمة ما زالت مفتوحة وتظهر ضمن «متأخرة».'
  },
  'You completed {n} tasks anyway.': {
    one: 'ومع ذلك أنجزت مهمة واحدة.', two: 'ومع ذلك أنجزت مهمتين.',
    few: 'ومع ذلك أنجزت {n} مهام.', many: 'ومع ذلك أنجزت {n} مهمة.', other: 'ومع ذلك أنجزت {n} مهمة.'
  },
  'Plan committed: {n} tasks are on your calendar': {
    zero: 'اعتُمدت الخطة',
    one: 'اعتُمدت الخطة: مهمة واحدة في تقويمك', two: 'اعتُمدت الخطة: مهمتان في تقويمك',
    few: 'اعتُمدت الخطة: {n} مهام في تقويمك', many: 'اعتُمدت الخطة: {n} مهمة في تقويمك', other: 'اعتُمدت الخطة: {n} مهمة في تقويمك'
  },
  '{n} late tasks are now due today': {
    one: 'مهمة متأخرة واحدة صارت مستحقة اليوم', two: 'مهمتان متأخرتان صارتا مستحقتين اليوم',
    few: '{n} مهام متأخرة صارت مستحقة اليوم', many: '{n} مهمة متأخرة صارت مستحقة اليوم', other: '{n} مهمة متأخرة صارت مستحقة اليوم'
  },
  '{n} could not be saved': {
    one: 'تعذّر حفظ واحدة', two: 'تعذّر حفظ اثنتين', few: 'تعذّر حفظ {n}', many: 'تعذّر حفظ {n}', other: 'تعذّر حفظ {n}'
  },

  // ── Inbox: reminders the API writes ─────────────────────────────────────────
  '"{name}" is due in {n} minutes.': {
    one: 'تستحق «{name}» بعد دقيقة واحدة.', two: 'تستحق «{name}» بعد دقيقتين.',
    few: 'تستحق «{name}» بعد {n} دقائق.', many: 'تستحق «{name}» بعد {n} دقيقة.', other: 'تستحق «{name}» بعد {n} دقيقة.'
  },
  '"{name}" is due in about {n} hours.': {
    one: 'تستحق «{name}» بعد ساعة تقريبًا.', two: 'تستحق «{name}» بعد ساعتين تقريبًا.',
    few: 'تستحق «{name}» بعد {n} ساعات تقريبًا.', many: 'تستحق «{name}» بعد {n} ساعة تقريبًا.', other: 'تستحق «{name}» بعد {n} ساعة تقريبًا.'
  },
  '"{name}" is due in about {n} days.': {
    one: 'تستحق «{name}» بعد يوم تقريبًا.', two: 'تستحق «{name}» بعد يومين تقريبًا.',
    few: 'تستحق «{name}» بعد {n} أيام تقريبًا.', many: 'تستحق «{name}» بعد {n} يومًا تقريبًا.', other: 'تستحق «{name}» بعد {n} يوم تقريبًا.'
  },
  '"{name}" starts in {n} minutes.': {
    one: 'يبدأ «{name}» بعد دقيقة واحدة.', two: 'يبدأ «{name}» بعد دقيقتين.',
    few: 'يبدأ «{name}» بعد {n} دقائق.', many: 'يبدأ «{name}» بعد {n} دقيقة.', other: 'يبدأ «{name}» بعد {n} دقيقة.'
  },
  '"{name}" starts in about {n} hours.': {
    one: 'يبدأ «{name}» بعد ساعة تقريبًا.', two: 'يبدأ «{name}» بعد ساعتين تقريبًا.',
    few: 'يبدأ «{name}» بعد {n} ساعات تقريبًا.', many: 'يبدأ «{name}» بعد {n} ساعة تقريبًا.', other: 'يبدأ «{name}» بعد {n} ساعة تقريبًا.'
  },
  '"{name}" starts in about {n} days.': {
    one: 'يبدأ «{name}» بعد يوم تقريبًا.', two: 'يبدأ «{name}» بعد يومين تقريبًا.',
    few: 'يبدأ «{name}» بعد {n} أيام تقريبًا.', many: 'يبدأ «{name}» بعد {n} يومًا تقريبًا.', other: 'يبدأ «{name}» بعد {n} يوم تقريبًا.'
  },

  // ── Inbox ───────────────────────────────────────────────────────────────────
  '{n} unread': {
    zero: 'الكل مقروء', one: 'عنصر واحد غير مقروء', two: 'عنصران غير مقروءين',
    few: '{n} عناصر غير مقروءة', many: '{n} عنصرًا غير مقروء', other: '{n} عنصر غير مقروء'
  },
  '{n} tasks done': {
    zero: 'لا مهام منجزة', one: 'مهمة منجزة واحدة', two: 'مهمتان منجزتان',
    few: '{n} مهام منجزة', many: '{n} مهمة منجزة', other: '{n} مهمة منجزة'
  },
  '{n} earlier comments on the task': {
    one: 'تعليق سابق واحد على المهمة', two: 'تعليقان سابقان على المهمة',
    few: '{n} تعليقات سابقة على المهمة', many: '{n} تعليقًا سابقًا على المهمة', other: '{n} تعليق سابق على المهمة'
  },
  '{names} and {n} more': {
    zero: '{names}', one: '{names} وشخص آخر', two: '{names} وشخصان آخران',
    few: '{names} و{n} آخرين', many: '{names} و{n} آخرين', other: '{names} و{n} آخرين'
  },
  '{n} friends in common': {
    zero: 'لا أصدقاء مشتركين', one: 'صديق مشترك واحد', two: 'صديقان مشتركان',
    few: '{n} أصدقاء مشتركين', many: '{n} صديقًا مشتركًا', other: '{n} صديق مشترك'
  },
  '{n} friends in common: {names}': {
    one: 'صديق مشترك واحد: {names}', two: 'صديقان مشتركان: {names}',
    few: '{n} أصدقاء مشتركين: {names}', many: '{n} صديقًا مشتركًا: {names}', other: '{n} صديق مشترك: {names}'
  },
  '{done} of {n} subtasks done': {
    one: 'أُنجزت {done} من مهمة فرعية واحدة', two: 'أُنجزت {done} من مهمتين فرعيتين',
    few: 'أُنجزت {done} من {n} مهام فرعية', many: 'أُنجزت {done} من {n} مهمة فرعية', other: 'أُنجزت {done} من {n} مهمة فرعية'
  },
  'You have “{title}” at that time and {n} more.': {
    one: 'لديك «{title}» في هذا الوقت وحدث آخر.', two: 'لديك «{title}» في هذا الوقت وحدثان آخران.',
    few: 'لديك «{title}» في هذا الوقت و{n} أحداث أخرى.', many: 'لديك «{title}» في هذا الوقت و{n} حدثًا آخر.',
    other: 'لديك «{title}» في هذا الوقت و{n} حدث آخر.'
  }
};
