import { Dictionary, PluralDictionary } from '../i18n';

/**
 * Projects: the project page (features/projects) with its Tasks, Members and
 * Discussion sections, and the comment thread it shares with the task panel
 * (shared/comment-thread).
 *
 * Only what no other part lists. The words these screens share with the rest
 * of the app ("Tasks", "Members", "Discussion", "Reply", "Unassigned", "edited",
 * "just now" ...) are in common.ts and in the parts that own them.
 *
 * A comment is masculine ("تعليق"): "حُذف", "لم يُرسل". A project too ("مشروع").
 */
export const AR_PROJECTS: Dictionary = {
  // ── The project page: head ─────────────────────────────────────────────────
  'Project unavailable': 'المشروع غير متاح',
  'That project could not be found.': 'تعذّر العثور على هذا المشروع.',
  'Project · owned by {owner}': 'مشروع · المالك: {owner}',
  'Project · owned by {owner} · created {date}': 'مشروع · المالك: {owner} · أُنشئ في {date}',
  'an unknown owner': 'غير معروف',
  'No description yet.': 'لا وصف بعد.',
  '{percent} · {done} of {total} tasks': '{percent} · {done} من {total}',
  '{n} late': '{n} متأخرة',
  'No members': 'لا أعضاء',
  'Could not load this project.': 'تعذّر تحميل المشروع.',
  'Could not save the project.': 'تعذّر حفظ المشروع.',
  'Could not delete this project.': 'تعذّر حذف المشروع.',
  'Delete “{name}” and everything in it? This cannot be undone.':
    'هل تريد حذف «{name}» وكل ما فيه؟ لا يمكن التراجع عن ذلك.',

  // ── Sections and their tools ───────────────────────────────────────────────
  'Section': 'القسم',
  'Table': 'جدول',
  'Filter tasks': 'تصفية المهام',
  'Filter tasks…': 'تصفية المهام…',
  'Filter by status': 'تصفية حسب الحالة',
  'All statuses': 'كل الحالات',
  'Group by': 'تجميع حسب',
  'Group by status': 'تجميع حسب الحالة',
  'Group by assignee': 'تجميع حسب المكلَّف',
  'No grouping': 'بلا تجميع',
  'All tasks': 'كل المهام',
  'Only the people on this project can read and write here.': 'لا يقرأ هذا النقاش ويكتب فيه إلا أعضاء المشروع.',

  // ── Tasks section ──────────────────────────────────────────────────────────
  'No tasks yet.': 'لا مهام بعد.',
  'No tasks match those filters.': 'لا مهام تطابق هذه التصفية.',
  'Add the first task and the team can start tracking progress.': 'أضف المهمة الأولى ليبدأ الفريق متابعة التقدّم.',
  'Clear the filter or choose another status.': 'امسح التصفية أو اختر حالة أخرى.',
  'Complete: {title}': 'إكمال: {title}',
  'Mark not done: {title}': 'إلغاء الإكمال: {title}',
  'Status of {title}': 'حالة «{title}»',
  'Priority of {title}': 'أولوية «{title}»',
  'Assignee of {title}': 'المكلَّف بمهمة «{title}»',
  'Delete {title}': 'حذف «{title}»',

  // ── Members section ────────────────────────────────────────────────────────
  'Add a member': 'إضافة عضو',
  '+ Add member': '+ إضافة عضو',
  'They get a notification.': 'يصله إشعار.',
  'No members yet.': 'لا أعضاء بعد.',
  'Add teammates so they can pick up tasks in this project.': 'أضف زملاءك ليتولّوا مهامًا في هذا المشروع.',
  'Joined': 'تاريخ الانضمام',
  'Remove from the project': 'إزالة من المشروع',
  'Remove {name} from this project?': 'هل تريد إزالة {name} من هذا المشروع؟',
  'Could not add that member.': 'تعذّرت إضافة العضو.',
  'Could not remove that member.': 'تعذّرت إزالة العضو.',

  // ── Discussion: what a server without it says ──────────────────────────────
  'The discussion is not available on this server yet.': 'النقاش غير متاح على هذا الخادم بعد.',
  'This server runs an older build without project discussions. They will be here once the server is updated; nothing else on this page is affected.':
    'يعمل هذا الخادم بإصدار أقدم لا يتضمن نقاشات المشاريع. ستظهر هنا بعد تحديث الخادم، ولا يتأثر أي شيء آخر في هذه الصفحة.',

  // ── The comment thread (a task's, and a project's discussion) ──────────────
  'Loading comments…': 'جارٍ تحميل التعليقات…',
  'No comments yet.': 'لا تعليقات بعد.',
  'No comments yet. Type {at} to pull someone in.': 'لا تعليقات بعد. اكتب {at} لإشراك أحدهم.',
  'Start the discussion: everyone on this project can read it and reply.': 'ابدأ النقاش: كل أعضاء المشروع يستطيعون قراءته والرد.',
  'Could not load the discussion.': 'تعذّر تحميل النقاش.',
  'Earlier comments': 'تعليقات أقدم',
  'Could not load earlier comments.': 'تعذّر تحميل التعليقات الأقدم.',
  'Edited {when}': 'آخر تعديل: {when}',
  'Not sent': 'لم يُرسل',
  'Discard': 'تجاهل',

  // The comment box
  'Comment, @mention someone…': 'اكتب تعليقًا، واستخدم @ للإشارة إلى أحد…',
  'Write a comment, @mention a member…': 'اكتب تعليقًا، واستخدم @ للإشارة إلى عضو…',
  'Write a reply…': 'اكتب ردًّا…',
  'Replying to {name}': 'ردًّا على {name}',
  'Post comment': 'نشر التعليق',
  'Posting': 'جارٍ النشر',
  'Post (Enter)': 'نشر (Enter)',
  'Enter to post · Shift + Enter for a new line': 'Enter للنشر · Shift + Enter لسطر جديد',
  'People you can mention': 'من يمكنك الإشارة إليهم',
  'needs access': 'يحتاج صلاحية',
  '{names} will be given access to this task when you post.': 'سيحصل {names} على صلاحية الوصول إلى هذه المهمة عند النشر.',
  'Could not post that comment.': 'تعذّر نشر التعليق.',

  // Editing and deleting
  'Edit your comment': 'تعديل تعليقك',
  'Editing changes the text only. To notify someone new, mention them in a new comment.':
    'التعديل يغيّر النص فقط. لإشعار شخص جديد، أشر إليه في تعليق جديد.',
  'Esc to cancel · Ctrl + Enter to save': 'Esc للإلغاء · Ctrl + Enter للحفظ',
  'Could not save that change.': 'تعذّر حفظ التعديل.',
  'Delete this comment? This cannot be undone.': 'هل تريد حذف هذا التعليق؟ لا يمكن التراجع عن ذلك.',
  'Comment deleted': 'حُذف التعليق',
  'Could not delete that comment.': 'تعذّر حذف التعليق.',

  // ── What the server calls the people in the mention list ───────────────────
  'Project owner': 'مالك المشروع',
  'Project member': 'عضو في المشروع',
  'Task owner': 'صاحب المهمة',

  // ── What the server answers about a discussion ─────────────────────────────
  'Only the comment\'s author or the project owner can delete it.': 'لا يحذف التعليق إلا كاتبه أو مالك المشروع.',
  'The comment you are replying to is not in this project any more.': 'التعليق الذي تردّ عليه لم يعد في هذا المشروع.',
  'That comment is not in this project.': 'هذا التعليق ليس في هذا المشروع.',

  // ── The notification a reply sends (the Inbox shows the server's sentence) ─
  'New reply': 'رد جديد',
  '{actor} replied to your comment in "{name}": {text}': 'ردّ {actor} على تعليقك في «{name}»: {text}'
};

export const AR_PROJECTS_PLURALS: PluralDictionary = {
  '{n} members: show the team': {
    zero: 'لا أعضاء: عرض الفريق', one: 'عضو واحد: عرض الفريق', two: 'عضوان: عرض الفريق',
    few: '{n} أعضاء: عرض الفريق', many: '{n} عضوًا: عرض الفريق', other: '{n} عضو: عرض الفريق'
  },
  'Delete this comment and the {n} replies to it? This cannot be undone.': {
    zero: 'هل تريد حذف هذا التعليق؟ لا يمكن التراجع عن ذلك.',
    one: 'هل تريد حذف هذا التعليق والرد عليه؟ لا يمكن التراجع عن ذلك.',
    two: 'هل تريد حذف هذا التعليق والردَّين عليه؟ لا يمكن التراجع عن ذلك.',
    few: 'هل تريد حذف هذا التعليق و{n} ردود عليه؟ لا يمكن التراجع عن ذلك.',
    many: 'هل تريد حذف هذا التعليق و{n} ردًّا عليه؟ لا يمكن التراجع عن ذلك.',
    other: 'هل تريد حذف هذا التعليق و{n} رد عليه؟ لا يمكن التراجع عن ذلك.'
  }
};
