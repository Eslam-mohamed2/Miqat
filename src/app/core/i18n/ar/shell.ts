import { Dictionary, PluralDictionary } from '../i18n';

/**
 * The frame around every page (the rail, the phone tab bar, the account menu, the
 * notice and the toasts), "Page not found", the projects drawer, the "New project"
 * dialog and the small sections a task or an event carries: subtasks, dependencies,
 * files and reminders.
 *
 * The words every screen shares (Calendar, Tasks, Settings, Cancel, Close …) are in
 * ./common and are not repeated here.
 */
export const AR_SHELL: Dictionary = {
  // ── The rail and the phone tab bar (layout/sidebar) ────────────────────────
  'Sections': 'الأقسام',
  'Main@@navigation': 'التنقل الرئيسي',
  'Miqat home': 'الصفحة الرئيسية لميقات',
  'New event': 'حدث جديد',
  'New task': 'مهمة جديدة',
  'New project': 'مشروع جديد',
  'Type it or search': 'اكتب أو ابحث',
  'Quick add': 'إضافة سريعة',
  'Switch to light mode': 'التبديل إلى المظهر الفاتح',
  'Switch to dark mode': 'التبديل إلى المظهر الداكن',

  // ── The notice of the shell (layout/app-shell) ─────────────────────────────
  'Dismiss': 'إغلاق',

  // ── The account menu (layout/user-menu) ────────────────────────────────────
  'Account menu': 'قائمة الحساب',
  'Account menu for {name}': 'قائمة حساب {name}',
  'Your profile': 'ملفك الشخصي',
  'Help Center': 'مركز المساعدة',

  // ── Page not found (shared/not-found) ──────────────────────────────────────
  'Page not found · {n}': 'الصفحة غير موجودة · {n}',
  'This page doesn’t exist': 'هذه الصفحة غير موجودة',
  'The link may be outdated, or the page may have moved.': 'ربما يكون الرابط قديمًا، أو نُقلت الصفحة.',
  'Back to your calendar': 'العودة إلى تقويمك',
  'Back to home': 'العودة إلى الصفحة الرئيسية',

  // ── The projects drawer (shared/projects-panel) ────────────────────────────
  'Your projects': 'مشاريعك',
  'Search projects': 'ابحث في المشاريع',
  'Could not load projects': 'تعذّر تحميل المشاريع',
  'Could not load projects.': 'تعذّر تحميل المشاريع.',
  'No project matches that': 'لا مشروع يطابق ذلك',
  'No projects yet': 'لا مشاريع بعد',
  'Try another word.': 'جرّب كلمة أخرى.',
  'A project gathers tasks and the people working on them.': 'المشروع يجمع المهام ومن يعملون عليها.',
  '{done} of {total} tasks done': 'أُنجز {done} من {total} من المهام',
  'Owned by you': 'أنت المالك',
  'Unknown owner': 'مالك غير معروف',

  // ── "New project" (shared/create-project-dialog) ───────────────────────────
  'Project name': 'اسم المشروع',
  'Name the project': 'سمِّ المشروع',
  '(optional)': '(اختياري)',
  'What is this project about?': 'ما موضوع هذا المشروع؟',
  'Colour': 'اللون',
  'Colour {n}': 'اللون {n}',
  'Invite members': 'دعوة أعضاء',
  'Add friends first to invite them here. Members can also be added on the project page.':
    'أضف أصدقاء أولًا لتدعوهم من هنا. يمكن أيضًا إضافة الأعضاء من صفحة المشروع.',
  'Creating…': 'جارٍ الإنشاء…',
  'Create project': 'إنشاء المشروع',
  'The project was not created. Please try again.': 'لم يُنشأ المشروع. حاول مرة أخرى.',

  // ── The marks of a task in a list (shared/task-marks) ──────────────────────
  '{done} of {total} subtasks done': 'أُنجز {done} من {total} من المهام الفرعية',
  'Waiting on a task that is not finished': 'تعتمد على مهمة لم تكتمل',
  'Blocked': 'معطّلة',

  // ── Subtasks (shared/task-checklist) ───────────────────────────────────────
  'Subtasks': 'المهام الفرعية',
  '{done} of {total}': '{done} من {total}',
  'Subtasks done': 'المهام الفرعية المنجزة',
  'Rename subtask': 'إعادة تسمية المهمة الفرعية',
  'Rename: {title}': 'إعادة تسمية: {title}',
  'Move up': 'تحريك للأعلى',
  'Move up: {title}': 'تحريك للأعلى: {title}',
  'Move down': 'تحريك للأسفل',
  'Move down: {title}': 'تحريك للأسفل: {title}',
  'Remove: {title}': 'إزالة: {title}',
  'Add a subtask': 'إضافة مهمة فرعية',
  'The checklist could not be loaded.': 'تعذّر تحميل قائمة التحقق.',
  'That line was not added.': 'لم تتم إضافة هذا البند.',
  'That tick was not saved.': 'لم تُحفظ علامة الإنجاز.',
  'That name was not saved.': 'لم يُحفظ الاسم.',
  'That move was not saved.': 'لم يُحفظ الترتيب الجديد.',
  'That line was not removed.': 'لم تتم إزالة هذا البند.',

  // ── Dependencies (shared/task-dependencies) ────────────────────────────────
  // "Blocked by" lists what this task depends on; "Blocking" lists what depends on it.
  'Blocked by': 'تعتمد على',
  'Blocking': 'تعتمد عليها',
  'Add a task this one waits for': 'إضافة مهمة تعتمد عليها هذه المهمة',
  'Stop waiting on {title}': 'إلغاء الاعتماد على {title}',
  'Stop waiting on this task': 'إلغاء الاعتماد على هذه المهمة',
  '{title} no longer waits for this task': 'إلغاء اعتماد {title} على هذه المهمة',
  'No longer waits for this task': 'إلغاء اعتمادها على هذه المهمة',
  'Nothing is in its way.': 'لا شيء يعيقها.',
  'Find one of your tasks': 'ابحث في مهامك',
  'Find a task to wait for': 'ابحث عن مهمة للاعتماد عليها',
  'Close the task list': 'إغلاق قائمة المهام',
  'Loading your tasks…': 'جارٍ تحميل مهامك…',
  'No task matches that.': 'لا مهمة تطابق ذلك.',
  'There is no other task to choose.': 'لا توجد مهمة أخرى لاختيارها.',
  'Dependencies could not be loaded.': 'تعذّر تحميل الاعتماديات.',
  'Dependencies could not be reloaded.': 'تعذّر تحديث الاعتماديات.',
  'Your tasks could not be loaded.': 'تعذّر تحميل مهامك.',
  'That link was not added.': 'لم تتم إضافة هذه الاعتمادية.',
  'That link was not removed.': 'لم تتم إزالة هذه الاعتمادية.',
  'Done@@status': 'مكتملة',
  'Late': 'متأخرة',
  'due {date}': 'الاستحقاق {date}',

  // ── Files (shared/item-attachments) ────────────────────────────────────────
  'Files': 'الملفات',
  'Download {name}': 'تنزيل {name}',
  'Remove {name}': 'إزالة {name}',
  'Remove "{name}"?': 'إزالة «{name}»؟',
  'No files attached yet.': 'لا ملفات مرفقة بعد.',
  'Attach a file': 'إرفاق ملف',
  'Attaching…': 'جارٍ الإرفاق…',
  'Documents, images or a zip, up to {n} MB each.': 'مستندات أو صور أو ملف مضغوط، حتى {n} ميغابايت لكل ملف.',
  'A file can be up to {n} MB.': 'الحد الأقصى لحجم الملف {n} ميغابايت.',
  'Files could not be loaded.': 'تعذّر تحميل الملفات.',
  'That file was not attached.': 'لم يتم إرفاق هذا الملف.',
  'That file could not be downloaded.': 'تعذّر تنزيل هذا الملف.',
  'That file was not removed.': 'لم تتم إزالة هذا الملف.',
  // The tag in front of a file name. PDF, ZIP, XLS and extensions stay as they are.
  'IMG': 'صورة',
  'FILE': 'ملف',
  '{n} B': '{n} بايت',
  '{n} KB': '{n} كيلوبايت',
  '{n} MB': '{n} ميغابايت',

  // ── Reminders (shared/item-reminders) ──────────────────────────────────────
  'Add a reminder': 'إضافة تذكير',
  'Remove reminder: {label}': 'إزالة التذكير: {label}',
  'No reminder set. Pick when you want to hear about it:': 'لا تذكير محدد. اختر متى تريد التنبيه:',
  'That is the most reminders one item can have.': 'هذا أقصى عدد من التذكيرات للعنصر الواحد.',
  'Reminders could not be loaded.': 'تعذّر تحميل التذكيرات.',
  'That reminder was not saved.': 'لم يُحفظ هذا التذكير.',
  'That reminder was not removed.': 'لم تتم إزالة هذا التذكير.',
  'Nothing ahead to remind about': 'لا موعد قادم للتذكير به',
  'Rings {date}': 'ينبّهك {date}'
};

export const AR_SHELL_PLURALS: PluralDictionary = {
  // The accessible name of the Inbox link when something is unread.
  'Inbox, {n} new': {
    zero: 'الوارد',
    one: 'الوارد، عنصر جديد واحد',
    two: 'الوارد، عنصران جديدان',
    few: 'الوارد، {n} عناصر جديدة',
    many: 'الوارد، {n} عنصرًا جديدًا',
    other: 'الوارد، {n} عنصر جديد'
  },
  '{n} projects': {
    zero: 'لا مشاريع', one: 'مشروع واحد', two: 'مشروعان', few: '{n} مشاريع', many: '{n} مشروعًا', other: '{n} مشروع'
  },
  // Members ticked in the "New project" dialog.
  '{n} chosen': {
    zero: 'لم يُختر أحد',
    one: 'اختير عضو واحد',
    two: 'اختير عضوان',
    few: 'اختير {n} أعضاء',
    many: 'اختير {n} عضوًا',
    other: 'اختير {n} عضو'
  },
  // A task another one waits for, past its due day.
  '{n}d late': {
    zero: 'متأخرة',
    one: 'متأخرة يومًا واحدًا',
    two: 'متأخرة يومين',
    few: 'متأخرة {n} أيام',
    many: 'متأخرة {n} يومًا',
    other: 'متأخرة {n} يوم'
  }
};
