import { Dictionary, PluralDictionary } from '../i18n';

/**
 * Tasks: the page with its lists, the board, the detail panel, the "Schedule"
 * pop-up and the task dialog (features/tasks and features/dashboard/task-window).
 *
 * A task is feminine in Arabic ("مهمة"), so what is said about one is too:
 * "مكتملة", "متأخرة", "أُضيفت". Status and priority names are in common.ts; the two
 * the code names differently ("Done", "Critical") are here with the same Arabic.
 */
export const AR_TASKS: Dictionary = {
  // ── Status, priority and dates (task-view.ts) ──────────────────────────────
  'Done@@status': 'مكتملة',
  'Critical': 'عاجلة',
  '{priority} priority': 'أولوية {priority}',
  'High priority': 'أولوية عالية',
  'Today {time}': 'اليوم {time}',
  'Tomorrow {time}': 'غدًا {time}',
  'Yesterday {time}': 'أمس {time}',
  '{day} {time}': '{day} {time}',
  '{day}, {time}': '{day}، {time}',
  '{day} {from} – {to}': '{day} {from} – {to}',
  'Done {when}': 'اكتملت {when}',

  // ── The page: header and the left column ───────────────────────────────────
  'Search tasks or type a command': 'ابحث في المهام أو اكتب أمرًا',
  'New task': 'مهمة جديدة',
  'Lists': 'القوائم',
  'Upcoming': 'القادمة',
  'Anytime': 'في أي وقت',
  'Someday': 'يومًا ما',
  'Logbook': 'السجل',
  'Views': 'طرق العرض',
  'Assigned to me': 'المسندة إليّ',
  'Blocked': 'معطّلة',
  'All projects': 'كل المشاريع',
  'New project': 'مشروع جديد',
  'No projects yet.': 'لا مشاريع بعد.',

  // ── The list's head and "Display" ──────────────────────────────────────────
  '{duration} estimated': 'التقدير {duration}',
  '{duration} on your calendar': '{duration} في تقويمك',
  'Open project': 'فتح المشروع',
  'Layout': 'طريقة العرض',
  'Display': 'العرض',
  'Filters are on': 'التصفية مفعّلة',
  'Sort by': 'ترتيب حسب',
  'Date (default)': 'التاريخ (الافتراضي)',
  'Deadline': 'الموعد النهائي',
  'Ascending': 'تصاعدي',
  'Descending': 'تنازلي',
  'Filter by priority': 'تصفية حسب الأولوية',
  'Filter this list': 'تصفية هذه القائمة',
  'Title, description or label': 'العنوان أو الوصف أو الوسم',
  'Clear filters': 'مسح التصفية',
  '{planned} of {capacity} planned': 'خُطّط {planned} من {capacity}',
  'Meetings and task blocks as a share of your working day': 'نصيب الاجتماعات وفترات العمل من يوم عملك',

  // ── Sections of the lists ──────────────────────────────────────────────────
  'Overdue': 'متأخرة',
  'On your calendar today': 'في تقويمك اليوم',
  'On your calendar': 'في تقويمك',
  'Anytime today': 'في أي وقت اليوم',
  'Done today': 'أُنجزت اليوم',
  'Next 7 days': 'الأيام السبعة القادمة',
  'Later': 'لاحقًا',
  'To sort': 'للفرز',
  'Last 7 days': 'آخر سبعة أيام',
  'Earlier': 'قبل ذلك',
  'No project': 'بلا مشروع',
  'show': 'إظهار',

  // ── The "Add a task" row ───────────────────────────────────────────────────
  'Add a task': 'إضافة مهمة',
  'Add a task — “Review PR tomorrow ~{n}m #Backend !high”': 'أضف مهمة — «مراجعة التقرير غدًا ~{n}د #التسويق !عالية»',
  'Will add': 'ستُضاف',
  'a title is needed': 'يلزم عنوان',
  'Read as plain words instead': 'اقرأها ككلمات عادية',
  'Due {day}': 'الاستحقاق: {day}',
  'No project starts with “{name}”': 'لا مشروع يبدأ اسمه بـ«{name}»',
  'Adding…': 'جارٍ الإضافة…',
  'Added “{title}”': 'أُضيفت «{title}»',
  'Added “{title}” to {list}': 'أُضيفت «{title}» إلى قائمة «{list}»',
  'Added “{title}” to your tasks': 'أُضيفت «{title}» إلى مهامك',
  'That task was not added.': 'لم تُضف المهمة.',

  // ── Empty lists ────────────────────────────────────────────────────────────
  'Nothing waiting to be sorted. New tasks without a project or a date land here.':
    'لا شيء بانتظار الفرز. المهام الجديدة التي بلا مشروع أو تاريخ تصل إلى هنا.',
  'Nothing is due or planned for today.': 'لا شيء مستحق أو مخطط له اليوم.',
  'No task is dated later than today.': 'لا مهمة بتاريخ بعد اليوم.',
  'No open task is without a date.': 'لا مهمة مفتوحة بلا تاريخ.',
  'Nothing is on hold.': 'لا شيء معلّق.',
  'Finished tasks are kept here.': 'تُحفظ المهام المنتهية هنا.',
  'No open task is assigned to you.': 'لا مهمة مفتوحة مسندة إليك.',
  'No task is waiting on another one.': 'لا مهمة تنتظر مهمة أخرى.',
  'This project has no tasks yet.': 'لا مهام في هذا المشروع بعد.',
  'No task here matches the filters under “Display”.': 'لا مهمة هنا تطابق التصفية المحددة في «العرض».',

  // ── Keyboard hints and the detail column ───────────────────────────────────
  'Move@@between rows': 'تنقّل',
  'Complete@@verb': 'إكمال',
  'Schedule on calendar': 'جدولة في التقويم',
  'Set priority': 'تحديد الأولوية',
  'Task details': 'تفاصيل المهمة',
  'Choose a task to see its details here.': 'اختر مهمة لعرض تفاصيلها هنا.',

  // ── Rows of the list ───────────────────────────────────────────────────────
  'Mark not done: {title}, {priority} priority': 'إلغاء الإكمال: {title}، أولوية {priority}',
  'Complete: {title}, {priority} priority': 'إكمال: {title}، أولوية {priority}',
  'On your calendar at {time}: change the time for {title}': 'في تقويمك {time}: تغيير وقت «{title}»',
  'Schedule on calendar: {title}': 'جدولة في التقويم: {title}',
  'Schedule': 'جدولة',
  'Assigned to {name}': 'المكلَّف: {name}',

  // ── The board ──────────────────────────────────────────────────────────────
  'Miqat has no sprints yet, so the board shows every task': 'لا دورات عمل في ميقات بعد، لذا تعرض اللوحة كل المهام',
  'no sprint set up yet': 'لم تُعدّ دورة عمل بعد',
  'Done@@progress': 'المنجَز',
  '{percent} · {done} of {total}': '{percent} · {done} من {total}',
  'Burndown: needs sprint dates, which are not set up yet': 'مخطط الإنجاز: يحتاج إلى تواريخ دورة العمل، وهي غير معدّة بعد',
  'The burndown needs sprint dates, which are not set up yet': 'مخطط الإنجاز يحتاج إلى تواريخ دورة العمل، وهي غير معدّة بعد',
  'Rows by project': 'صفوف حسب المشروع',
  'Set a work-in-progress limit': 'تحديد حدّ للعمل الجاري',
  '{count} / {limit} · over limit': '{count} من {limit} · تجاوز الحد',
  '{count} / {limit} WIP': '{count} من {limit} قيد العمل',
  'Work-in-progress limit for {column}': 'حدّ العمل الجاري لعمود {column}',
  'Work-in-progress limit': 'حدّ العمل الجاري',
  'How many tasks “{column}” should hold at once. Saved in this browser.':
    'عدد المهام التي يتسع لها عمود «{column}» في وقت واحد. يُحفظ في هذا المتصفح.',
  'One fewer': 'أقل بواحد',
  'One more': 'أكثر بواحد',
  'None@@limit': 'بلا حد',
  'Limit for {column}': 'حدّ عمود {column}',
  'No limit': 'بلا حد',
  '{status}, {project}': '{status}، {project}',
  'Move “{title}” to {status}': 'نقل «{title}» إلى {status}',
  'Drop a task here': 'أفلت مهمة هنا',
  'Drag cards between columns, or use the arrow on a card. Scheduled tasks keep their calendar block when they move.':
    'اسحب البطاقات بين الأعمدة، أو استخدم السهم على البطاقة. تحتفظ المهام المجدولة بفترة عملها في التقويم عند نقلها.',
  'Cancelled tasks ({n}) are not on the board; they are in the Logbook.': 'المهام الملغاة ({n}) ليست على اللوحة؛ تجدها في السجل.',
  'The Done column shows the newest {shown}; {older} older ones are in the Logbook.':
    'يعرض عمود «مكتملة» أحدث {shown}؛ والأقدم ({older}) في السجل.',

  // ── What changing a task answers (tasks-store.ts) ──────────────────────────
  'Could not load tasks.': 'تعذّر تحميل المهام.',
  'That change was not saved.': 'لم يُحفظ التغيير.',
  'Completed “{title}”': 'اكتملت «{title}»',
  'Could not move that task.': 'تعذّر نقل المهمة.',
  '{priority} priority: “{title}”': 'أولوية {priority}: «{title}»',
  'Removed from your calendar': 'أُزيلت من تقويمك',
  'That time could not be set.': 'تعذّر تحديد هذا الوقت.',
  'Scheduled for {when}': 'جُدولت: {when}',
  'Scheduled for {when} · deadline moved to match': 'جُدولت: {when} · نُقل الموعد النهائي ليوافقها',
  'Moved to tomorrow: “{title}”': 'نُقلت إلى الغد: «{title}»',
  'Delete “{title}” and its discussion? This cannot be undone.': 'هل تريد حذف «{title}» ونقاشها؟ لا يمكن التراجع عن ذلك.',
  'Deleted “{title}”': 'حُذفت «{title}»',
  'Could not delete that task.': 'تعذّر حذف المهمة.',

  // ── The "Schedule" pop-up ──────────────────────────────────────────────────
  '{duration} block': 'فترة عمل {duration}',
  'No estimate: {n} min block': 'بلا تقدير: فترة عمل {n} دقيقة',
  'Next free slot in your working hours': 'أقرب وقت متاح ضمن ساعات عملك',
  'No free slot is left in your working hours today or tomorrow. Pick a time below.':
    'لم يبقَ وقت متاح ضمن ساعات عملك اليوم أو غدًا. اختر وقتًا أدناه.',
  'Or pick a time': 'أو اختر وقتًا',
  'Start time': 'وقت البدء',
  'Set@@time': 'تحديد',
  'The deadline is before this time, so it moves to the end of the block.':
    'الموعد النهائي قبل هذا الوقت، لذا سيُنقل إلى نهاية فترة العمل.',
  'Remove from calendar': 'إزالة من التقويم',

  // ── The detail panel ───────────────────────────────────────────────────────
  'You do not have access to this task.': 'ليست لديك صلاحية الوصول إلى هذه المهمة.',
  'That task could not be loaded.': 'تعذّر تحميل المهمة.',
  'Ask the owner to add you to the project, or to mention you on the task.':
    'اطلب من المالك إضافتك إلى المشروع، أو الإشارة إليك في المهمة.',
  'It may have been deleted, or the link is not complete.': 'ربما حُذفت، أو أن الرابط غير مكتمل.',
  'Back to tasks': 'رجوع إلى المهام',
  'Open the project': 'فتح المشروع',
  'Copy link': 'نسخ الرابط',
  'Link copied': 'تم نسخ الرابط',
  'The link could not be copied.': 'تعذّر نسخ الرابط.',
  'This browser does not allow copying. The link is in the address bar.': 'هذا المتصفح لا يسمح بالنسخ. تجد الرابط في شريط العنوان.',
  'More actions': 'إجراءات أخرى',
  'Edit task': 'تعديل المهمة',
  'Delete task': 'حذف المهمة',
  'Status: {status}. Change': 'الحالة: {status}. تغيير',
  '{priority}. Change': '{priority}. تغيير',
  'Unknown': 'غير معروف',
  'Nobody yet': 'لا أحد بعد',
  'No deadline': 'بلا موعد نهائي',
  'No estimate': 'بلا تقدير',
  'On calendar': 'في التقويم',
  'Time block · open in calendar': 'فترة عمل · فتح في التقويم',
  'Change or remove the time block': 'تغيير فترة العمل أو إزالتها',
  'Find time today': 'ابحث عن وقت اليوم',
  'Not scheduled': 'غير مجدولة',
  'Cycle': 'الدورة',
  'Sprints are not set up in Miqat yet': 'دورات العمل غير متاحة في ميقات بعد',
  'No sprint': 'بلا دورة عمل',
  'Repeats': 'التكرار',
  'Daily': 'يوميًا',
  'Weekly': 'أسبوعيًا',
  'Monthly': 'شهريًا',
  'Yearly': 'سنويًا',
  '{repeat} until {day}': '{repeat} حتى {day}',
  'Labels': 'الوسوم',
  'Shared with': 'مشتركة مع',
  '{name} · project member': '{name} · عضو في المشروع',
  'No description yet. “Edit task” in the menu above adds one.': 'لا وصف بعد. أضفه من «تعديل المهمة» في القائمة أعلاه.',
  'Activity': 'النشاط',
  'created this task': 'أنشأ هذه المهمة',

  // ── The task dialog ────────────────────────────────────────────────────────
  'What needs to be done?': 'ما المطلوب إنجازه؟',
  'Title is required.': 'العنوان مطلوب.',
  'Add some details…': 'أضف بعض التفاصيل…',
  'Project@@field': 'المشروع',
  'Unassigned': 'بلا مكلَّف',
  'Current assignee': 'المكلَّف الحالي',
  'Due time': 'وقت الاستحقاق',
  '(time block)': '(فترة عمل)',
  'Block start time': 'وقت بدء فترة العمل',
  'Times are in {zone}. The block lasts as long as the estimate.': 'الأوقات بتوقيت {zone}. تستمر فترة العمل بقدر التقدير.',
  '{a}m, {b}h {c}m': '{a} د، {b} س {c} د',
  'Write the estimate like {a}m, {b}h or {b}h {a}m.': 'اكتب التقدير هكذا: {a} د أو {b} س أو {b} س {a} د.',
  'The time block starts after the deadline. Move one of them.': 'فترة العمل تبدأ بعد الموعد النهائي. غيّر أحدهما.',
  'Repeat': 'التكرار',
  'Does not repeat@@task': 'لا تتكرر',
  'Every day': 'كل يوم',
  'Every week': 'كل أسبوع',
  'Every month': 'كل شهر',
  'Every year': 'كل سنة',
  'Repeat until': 'التكرار حتى',
  '(optional)': '(اختياري)',
  'design, api': 'تصميم، برمجة',
  'Open in Tasks': 'فتح في المهام',
  'Create task': 'إنشاء المهمة',
  'Failed to update task': 'تعذّر تحديث المهمة',
  'Failed to create task': 'تعذّر إنشاء المهمة'
};

export const AR_TASKS_PLURALS: PluralDictionary = {
  // The last column of a row: how many days past its deadline a task is.
  '{n}d late': {
    zero: 'متأخرة', one: 'متأخرة يومًا واحدًا', two: 'متأخرة يومين', few: 'متأخرة {n} أيام', many: 'متأخرة {n} يومًا', other: 'متأخرة {n} يوم'
  },
  '{n} open': {
    zero: 'لا مهام مفتوحة', one: 'مهمة مفتوحة واحدة', two: 'مهمتان مفتوحتان', few: '{n} مهام مفتوحة',
    many: '{n} مهمة مفتوحة', other: '{n} مهمة مفتوحة'
  },
  '{n} finished tasks': {
    zero: 'لا مهام منتهية', one: 'مهمة منتهية واحدة', two: 'مهمتان منتهيتان', few: '{n} مهام منتهية',
    many: '{n} مهمة منتهية', other: '{n} مهمة منتهية'
  },
  '{n} older in the Logbook': {
    zero: 'لا مهام أقدم في السجل', one: 'مهمة أقدم في السجل', two: 'مهمتان أقدم في السجل', few: '{n} مهام أقدم في السجل',
    many: '{n} مهمة أقدم في السجل', other: '{n} مهمة أقدم في السجل'
  },
  // The board's "Done" figure when no task has an estimate: "40% · 2 of 5 tasks".
  '{percent} · {done} of {n} tasks': {
    zero: '{percent} · لا مهام', one: '{percent} · {done} من مهمة واحدة', two: '{percent} · {done} من مهمتين',
    few: '{percent} · {done} من {n} مهام', many: '{percent} · {done} من {n} مهمة', other: '{percent} · {done} من {n} مهمة'
  }
};
