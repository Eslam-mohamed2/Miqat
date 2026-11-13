import { Dictionary, PluralDictionary } from '../i18n';

/**
 * The whiteboard and Node Flow.
 *
 * The board itself is not mirrored (a place on it is a place, and a saved board looks
 * the same in both languages); these are the words around it and the words the app
 * itself writes on it.
 */
export const AR_CANVAS: Dictionary = {
  // ── Both: the line above the name ──────────────────────────────────────────
  'saving…': 'جارٍ الحفظ…',
  'could not save': 'تعذّر الحفظ',
  'not saved yet': 'لم يتم الحفظ بعد',
  'saved just now': 'تم الحفظ الآن',
  'saved at {time}': 'تم الحفظ الساعة {time}',
  'loading…': 'جارٍ التحميل…',

  // ── Whiteboard: header ─────────────────────────────────────────────────────
  'My whiteboard': 'سبورتي',
  'Board name': 'اسم السبورة',
  'On this board': 'على هذه السبورة',
  'Download as PNG': 'تنزيل كصورة PNG',
  'Copy link': 'نسخ الرابط',
  'Boards are private for now: the link opens for you only.': 'السبورات خاصة حاليًا: الرابط يفتح لك وحدك.',
  'Present': 'بدء العرض',
  'Presentation': 'العرض التقديمي',
  'Previous frame': 'الإطار السابق',
  'Next frame': 'الإطار التالي',
  '{n} / {total}': '{n} / {total}',
  'Stop presenting': 'إيقاف العرض',

  // ── Whiteboard: what is on the board ───────────────────────────────────────
  'Board canvas': 'مساحة السبورة',
  'Frame name': 'اسم الإطار',
  'Frame {n}': 'إطار {n}',
  'Connector label': 'تسمية الموصّل',
  'Type a note…': 'اكتب ملاحظة…',
  'Note text': 'نص الملاحظة',
  'Sticky note: {text}': 'ملاحظة لاصقة: {text}',
  'Sticky note: empty': 'ملاحظة لاصقة: فارغة',
  'Remove one vote': 'إزالة صوت واحد',
  'Open the task made from this sticky': 'فتح المهمة المنشأة من هذه الملاحظة',
  'Pick a tool and start: a sticky, a frame, or just draw.': 'اختر أداة وابدأ: ملاحظة لاصقة، إطار، أو ارسم مباشرة.',

  // ── Whiteboard: tools ──────────────────────────────────────────────────────
  'Tools': 'الأدوات',
  'Select@@tool': 'تحديد',
  'Pan': 'تحريك',
  'Sticky note': 'ملاحظة لاصقة',
  'Shape': 'شكل',
  'Text': 'نص',
  'Pen': 'قلم',
  'Connector': 'موصّل',
  'Frame': 'إطار',
  'Rectangle': 'مستطيل',
  'Ellipse': 'شكل بيضاوي',
  'Diamond': 'معيّن',
  'Options for pen': 'خيارات القلم',
  'Options for sticky': 'خيارات الملاحظة اللاصقة',
  'Options for shape': 'خيارات الشكل',
  'Options for text': 'خيارات النص',
  'Colour gold': 'اللون الذهبي',
  'Colour sage': 'اللون الأخضر',
  'Colour sky': 'اللون الأزرق',
  'Colour rose': 'اللون الوردي',
  'Colour lilac': 'اللون البنفسجي',
  'Pen width {n}': 'سُمك القلم {n}',
  'Eraser': 'ممحاة',
  'History': 'السجل',
  'Clear board': 'مسح السبورة',
  'Clear the whole board?': 'مسح السبورة كلها؟',
  'Zoom out': 'تصغير',
  'Zoom in': 'تكبير',
  'Zoom to fit': 'ملاءمة العرض',
  'Zoom {value}: fit the board': 'التكبير {value}: ملاءمة السبورة',

  // ── Whiteboard: the bar under a selection ──────────────────────────────────
  'Vote': 'تصويت',
  'Add a vote to each selected sticky': 'إضافة صوت لكل ملاحظة محددة',
  'Group@@verb': 'تجميع',
  'Ungroup': 'فك التجميع',
  'Make these move as one': 'تحريكها معًا كعنصر واحد',
  'Let these move separately again': 'تحريك كل منها على حدة من جديد',
  'Label': 'تسمية',
  'Make tasks': 'إنشاء مهام',
  'Make a task from each selected sticky': 'إنشاء مهمة من كل ملاحظة محددة',
  'Nothing to make: write on the sticky first, or it is a task already':
    'لا شيء للإنشاء: اكتب على الملاحظة أولًا، أو أنها مهمة بالفعل',
  'your tasks': 'مهامك',
  'Open tasks': 'فتح المهام',
  'Made from the whiteboard “{name}”.': 'أُنشئت من السبورة «{name}».',
  'The tasks could not be made. Try again.': 'تعذّر إنشاء المهام. حاول مرة أخرى.',
  '{failed} of {total} could not be made.': 'تعذّر إنشاء {failed} من {total}.',

  // ── Whiteboard: sharing ────────────────────────────────────────────────────
  'Nothing to link to yet: the board is saved once something is on it.': 'لا رابط بعد: تُحفظ السبورة عند وضع شيء عليها.',
  'The link could not be copied.': 'تعذّر نسخ الرابط.',
  'Link copied. Boards are private, so it opens for you only.': 'تم نسخ الرابط. السبورات خاصة، لذا يفتح لك وحدك.',
  'The board is empty: there is nothing to download yet.': 'السبورة فارغة: لا شيء للتنزيل بعد.',

  // ── Whiteboard: the session panel ──────────────────────────────────────────
  'Session': 'الجلسة',
  'Live meeting': 'اجتماع جارٍ',
  'Next meeting': 'الاجتماع التالي',
  'No meeting now': 'لا اجتماع الآن',
  'Nothing else today': 'لا شيء آخر اليوم',
  'open in calendar': 'فتح في التقويم',
  'open calendar': 'فتح التقويم',
  'Agenda': 'جدول الأعمال',
  'Add an agenda item': 'إضافة بند إلى جدول الأعمال',
  'Add an agenda item first': 'أضف بندًا إلى جدول الأعمال أولًا',
  'Every item is finished. Press one to run it again.': 'انتهت كل البنود. اضغط على أحدها لتشغيله من جديد.',
  'Add an item': 'إضافة بند',
  'New agenda item': 'بند جديد في جدول الأعمال',
  'Add to the agenda': 'إضافة إلى جدول الأعمال',
  'Minutes': 'الدقائق',
  'min': 'د',
  '{n} min': '{n} د',
  'Remove {title}': 'إزالة {title}',
  'Finish this item': 'إنهاء هذا البند',
  'Put the timer on this item': 'ضبط المؤقت على هذا البند',
  'Time left in this item': 'الوقت المتبقي لهذا البند',
  'Start timer': 'تشغيل المؤقت',
  'Pause timer': 'إيقاف المؤقت مؤقتًا',
  'No agenda yet. Add what this session should cover and the timer keeps each item to its time.':
    'لا جدول أعمال بعد. أضف ما ستتناوله هذه الجلسة وسيضبط المؤقت وقت كل بند.',
  '{prayer} at {time}': '{prayer} الساعة {time}',
  '{prayer} at {time} · pause planned': '{prayer} الساعة {time} · سيتوقف المؤقت',
  'Timer paused for {prayer}.': 'أُوقف المؤقت لصلاة {prayer}.',
  'Fajr': 'الفجر',
  'Sunrise': 'الشروق',
  'Dhuhr': 'الظهر',
  'Asr': 'العصر',
  'Maghrib': 'المغرب',
  'Isha': 'العشاء',
  'Top votes': 'الأعلى تصويتًا',
  'No votes yet. Select stickies and choose “Vote”.': 'لا أصوات بعد. حدّد ملاحظات واختر «تصويت».',
  'Made from this board': 'أُنشئ من هذه السبورة',
  'Select stickies and choose “Make tasks”. They land in your tasks with a link back to this board.':
    'حدّد ملاحظات واختر «إنشاء مهام». ستظهر في مهامك مع رابط يعود إلى هذه السبورة.',

  // ── Node Flow: header ──────────────────────────────────────────────────────
  'My flow': 'مخططي',
  'Flow name': 'اسم المخطط',
  'no nodes': 'لا عُقد',
  'Layout': 'طريقة العرض',
  'Flow': 'مخطط',
  'Timeline': 'خط زمني',
  'Critical path': 'المسار الحرج',
  'Auto-layout': 'ترتيب تلقائي',
  'Add node': 'إضافة عقدة',
  'Milestone': 'محطة رئيسية',
  'New task': 'مهمة جديدة',
  'New event': 'حدث جديد',
  'New milestone': 'محطة رئيسية جديدة',
  'Nodes laid out by dependency.': 'رُتّبت العُقد حسب الاعتمادية.',

  // ── Node Flow: the canvas ──────────────────────────────────────────────────
  'Flow canvas': 'مساحة المخطط',
  'Untitled': 'بلا عنوان',
  'No dates yet': 'لا تواريخ بعد',
  'Set dates': 'تحديد التواريخ',
  '{n}d': '{n} ي',
  'Done@@status': 'مكتملة',
  'Late': 'متأخرة',
  'Calendar event': 'حدث في التقويم',
  '{title}, {status}': '{title}، {status}',
  '{title}, {status}, on the critical path': '{title}، {status}، على المسار الحرج',
  'Drag onto the node that waits for this one': 'اسحب إلى العقدة التي تنتظر هذه',
  'No nodes yet. Choose “Add node” to start mapping what depends on what.':
    'لا عُقد بعد. اختر «إضافة عقدة» لتبدأ برسم ما يعتمد على ماذا.',
  'Choose the node this one waits for.': 'اختر العقدة التي تنتظرها هذه.',
  'Choose the node that waits for this one.': 'اختر العقدة التي تنتظر هذه.',
  'Esc to cancel': 'Esc للإلغاء',
  'Depends on': 'يعتمد على',
  'That would make a loop: these two already depend on each other the other way round.':
    'هذا يُنشئ حلقة: إحدى هاتين العقدتين تعتمد على الأخرى بالاتجاه المعاكس.',

  // ── Node Flow: the details of a node ───────────────────────────────────────
  'Node details': 'تفاصيل العقدة',
  'Select a node to see what it depends on.': 'حدّد عقدة لترى ما تعتمد عليه.',
  'Node title': 'عنوان العقدة',
  'The title comes from the linked item. Open it to rename it.': 'العنوان مأخوذ من العنصر المرتبط. افتحه لإعادة تسميته.',
  'Change status': 'تغيير الحالة',
  'On the critical path': 'على المسار الحرج',
  'Dates': 'التواريخ',
  'Change dates': 'تغيير التواريخ',
  'Start': 'البداية',
  'Days': 'الأيام',
  'Clear dates': 'مسح التواريخ',
  'No project': 'بلا مشروع',
  'Add a node this one waits for': 'إضافة عقدة تنتظرها هذه',
  'Add a node that waits for this one': 'إضافة عقدة تنتظر هذه',
  'Stop waiting for {title}': 'إيقاف انتظار {title}',
  'Stop unblocking {title}': 'إلغاء اعتماد {title} على هذه',
  'Remove this dependency': 'إزالة هذه الاعتمادية',
  'Nothing. This can start any time.': 'لا شيء. يمكن البدء في أي وقت.',
  'Unblocks': 'يعتمد عليه',
  'What if this slips?': 'ماذا لو تأخّر هذا؟',
  'On time': 'في الموعد',
  'Give this node dates first': 'حدّد تواريخ هذه العقدة أولًا',
  'Give this node dates to see what a delay moves.': 'حدّد تواريخ هذه العقدة لترى ما يحرّكه التأخير.',
  'Nothing depends on this, so nothing else moves.': 'لا شيء يعتمد على هذه، فلن يتحرك شيء آخر.',
  'Pick a delay to see what moves.': 'اختر تأخيرًا لترى ما يتحرك.',
  'The last node': 'العقدة الأخيرة',
  '{title} moves to {date}.': 'ينتقل موعد «{title}» إلى {date}.',
  '{title} stays on {date}. The delay fits in this node’s slack.':
    'يبقى موعد «{title}» في {date}. التأخير ضمن الهامش الزمني لهذه العقدة.',
  ', ': '، ',
  'Keep these dates': 'اعتماد هذه التواريخ',
  'Makes these dates the plan of this flow': 'يجعل هذه التواريخ خطة هذا المخطط',
  'Search your tasks and events': 'ابحث في مهامك وأحداثك',
  'No task or event matches.': 'لا مهمة أو حدث يطابق.',
  'Link a task or event': 'ربط مهمة أو حدث',
  'Open task': 'فتح المهمة',
  'Open in calendar': 'فتح في التقويم',
  'Unlink': 'فك الربط',
  'Keeps the node, forgets the linked item': 'يُبقي العقدة ويفك ارتباطها بالعنصر',
  'Delete node': 'حذف العقدة',
  '“{title}” removed from the flow.': 'أُزيلت «{title}» من المخطط.'
};

export const AR_CANVAS_PLURALS: PluralDictionary = {
  'saved {n} min ago': {
    zero: 'تم الحفظ الآن',
    one: 'تم الحفظ قبل دقيقة',
    two: 'تم الحفظ قبل دقيقتين',
    few: 'تم الحفظ قبل {n} دقائق',
    many: 'تم الحفظ قبل {n} دقيقة',
    other: 'تم الحفظ قبل {n} دقيقة'
  },
  '{n} votes': {
    zero: 'لا أصوات', one: 'صوت واحد', two: 'صوتان', few: '{n} أصوات', many: '{n} صوتًا', other: '{n} صوت'
  },
  '{n} votes: remove one': {
    zero: 'لا أصوات',
    one: 'صوت واحد: إزالة صوت',
    two: 'صوتان: إزالة صوت',
    few: '{n} أصوات: إزالة صوت',
    many: '{n} صوتًا: إزالة صوت',
    other: '{n} صوت: إزالة صوت'
  },
  'Make {n} tasks': {
    zero: 'إنشاء مهام',
    one: 'إنشاء مهمة واحدة',
    two: 'إنشاء مهمتين',
    few: 'إنشاء {n} مهام',
    many: 'إنشاء {n} مهمة',
    other: 'إنشاء {n} مهمة'
  },
  // Followed by "your tasks" in bold.
  '{n} tasks added to': {
    zero: 'لم تُضف مهام إلى',
    one: 'أُضيفت مهمة واحدة إلى',
    two: 'أُضيفت مهمتان إلى',
    few: 'أُضيفت {n} مهام إلى',
    many: 'أُضيفت {n} مهمة إلى',
    other: 'أُضيفت {n} مهمة إلى'
  },
  'Selection, {n} stickies': {
    zero: 'التحديد: لا ملاحظات',
    one: 'التحديد: ملاحظة واحدة',
    two: 'التحديد: ملاحظتان',
    few: 'التحديد: {n} ملاحظات',
    many: 'التحديد: {n} ملاحظة',
    other: 'التحديد: {n} ملاحظة'
  },
  'Selection, {n} items': {
    zero: 'التحديد: لا عناصر',
    one: 'التحديد: عنصر واحد',
    two: 'التحديد: عنصران',
    few: 'التحديد: {n} عناصر',
    many: 'التحديد: {n} عنصرًا',
    other: 'التحديد: {n} عنصر'
  },
  '{n} nodes': {
    zero: 'لا عُقد', one: 'عقدة واحدة', two: 'عقدتان', few: '{n} عُقد', many: '{n} عقدة', other: '{n} عقدة'
  },
  'Slack: {n} days': {
    zero: 'بلا هامش زمني',
    one: 'هامش زمني: يوم واحد',
    two: 'هامش زمني: يومان',
    few: 'هامش زمني: {n} أيام',
    many: 'هامش زمني: {n} يومًا',
    other: 'هامش زمني: {n} يوم'
  },
  // The "what if this slips" choices: +1d, +2d, +3d.
  '+{n}d': {
    zero: 'في الموعد', one: '+يوم', two: '+يومان', few: '+{n} أيام', many: '+{n} يومًا', other: '+{n} يوم'
  },
  '{title} stays on {date}. {n} days of buffer left.': {
    zero: 'يبقى موعد «{title}» في {date}. لم يتبقَّ أي احتياط.',
    one: 'يبقى موعد «{title}» في {date}. يتبقى يوم واحد احتياطًا.',
    two: 'يبقى موعد «{title}» في {date}. يتبقى يومان احتياطًا.',
    few: 'يبقى موعد «{title}» في {date}. تتبقى {n} أيام احتياطًا.',
    many: 'يبقى موعد «{title}» في {date}. يتبقى {n} يومًا احتياطًا.',
    other: 'يبقى موعد «{title}» في {date}. يتبقى {n} يوم احتياطًا.'
  },
  '{n} more items move: {titles}': {
    zero: 'لا يتحرك عنصر آخر',
    one: 'يتحرك عنصر آخر: {titles}',
    two: 'يتحرك عنصران آخران: {titles}',
    few: 'تتحرك {n} عناصر أخرى: {titles}',
    many: 'يتحرك {n} عنصرًا آخر: {titles}',
    other: 'يتحرك {n} عنصر آخر: {titles}'
  },
  'New dates kept for {n} nodes.': {
    zero: 'لم تتغير أي تواريخ.',
    one: 'اعتُمدت التواريخ الجديدة لعقدة واحدة.',
    two: 'اعتُمدت التواريخ الجديدة لعقدتين.',
    few: 'اعتُمدت التواريخ الجديدة لـ{n} عُقد.',
    many: 'اعتُمدت التواريخ الجديدة لـ{n} عقدة.',
    other: 'اعتُمدت التواريخ الجديدة لـ{n} عقدة.'
  }
};
