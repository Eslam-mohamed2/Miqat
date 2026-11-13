import { Dictionary, PluralDictionary } from '../i18n';

/**
 * Words every screen uses. They are fixed here so the whole app says one thing
 * one way: look here before translating a button or a label again.
 */
export const AR_COMMON: Dictionary = {
  // The product and its places
  'Miqat': 'ميقات',
  'Calendar': 'التقويم',
  'Tasks': 'المهام',
  'Board': 'اللوحة',
  'List': 'القائمة',
  'Projects': 'المشاريع',
  'Project': 'مشروع',
  'Inbox': 'الوارد',
  'People': 'الأشخاص',
  'Friends': 'الأصدقاء',
  'Settings': 'الإعدادات',
  'Help': 'المساعدة',
  'Whiteboard': 'السبورة',
  'Node Flow': 'مخطط العقد',
  'Plan my day': 'خطّط يومي',
  'Find a time': 'ابحث عن وقت',
  'Notifications': 'الإشعارات',
  'Mentions': 'الإشارات',
  'Chat': 'المحادثة',
  'Chats': 'المحادثات',
  'Profile': 'الملف الشخصي',
  'Discussion': 'النقاش',

  // Things
  'Event': 'حدث',
  'Events': 'الأحداث',
  'Task': 'مهمة',
  'Meeting': 'اجتماع',
  'Reminder': 'تذكير',
  'Reminders': 'التذكيرات',
  'Comment': 'تعليق',
  'Comments': 'التعليقات',
  'Member': 'عضو',
  'Members': 'الأعضاء',
  'Owner': 'المالك',
  'Group': 'مجموعة',
  'Call': 'مكالمة',
  'Message': 'رسالة',
  'Attachment': 'مرفق',
  'Attachments': 'المرفقات',
  'Tag': 'وسم',
  'Tags': 'الوسوم',
  'Note': 'ملاحظة',
  'Notes': 'ملاحظات',
  'Description': 'الوصف',
  'Title': 'العنوان',
  'Name': 'الاسم',
  'Email': 'البريد الإلكتروني',
  'Password': 'كلمة المرور',
  'Time zone': 'المنطقة الزمنية',
  'Date': 'التاريخ',
  'Time': 'الوقت',
  'Location': 'المكان',
  'Status': 'الحالة',
  'Priority': 'الأولوية',
  'Assignee': 'المكلَّف',
  'Due': 'الاستحقاق',
  'Due date': 'تاريخ الاستحقاق',
  'Estimate': 'التقدير',
  'Color': 'اللون',

  // Actions
  'Save': 'حفظ',
  'Save changes': 'حفظ التغييرات',
  'Saved': 'تم الحفظ',
  'Cancel': 'إلغاء',
  'Close': 'إغلاق',
  'Delete': 'حذف',
  'Remove': 'إزالة',
  'Edit': 'تعديل',
  'Rename': 'إعادة تسمية',
  'Add': 'إضافة',
  'Create': 'إنشاء',
  'New': 'جديد',
  'Done': 'تم',
  'OK': 'موافق',
  'Yes': 'نعم',
  'No': 'لا',
  'Back': 'رجوع',
  'Next': 'التالي',
  'Previous': 'السابق',
  'Continue': 'متابعة',
  'Confirm': 'تأكيد',
  'Search': 'بحث',
  'Filter': 'تصفية',
  'Sort': 'ترتيب',
  'Send': 'إرسال',
  'Share': 'مشاركة',
  'Copy': 'نسخ',
  'Copied': 'تم النسخ',
  'Open': 'فتح',
  'View': 'عرض',
  'Show': 'إظهار',
  'Hide': 'إخفاء',
  'More': 'المزيد',
  'Undo': 'تراجع',
  'Redo': 'إعادة',
  'Retry': 'إعادة المحاولة',
  'Try again': 'حاول مرة أخرى',
  'Refresh': 'تحديث',
  'Join': 'انضمام',
  'Leave': 'مغادرة',
  'Invite': 'دعوة',
  'Accept': 'قبول',
  'Decline': 'رفض',
  'Import': 'استيراد',
  'Export': 'تصدير',
  'Upload': 'رفع',
  'Download': 'تنزيل',
  'Sign in': 'تسجيل الدخول',
  'Sign up': 'إنشاء حساب',
  'Log out': 'تسجيل الخروج',
  'Get started': 'ابدأ الآن',
  'Learn more': 'اعرف المزيد',
  'Select': 'اختيار',
  'Clear': 'مسح',
  'Apply': 'تطبيق',
  'Reset': 'إعادة ضبط',
  'Reply': 'رد',
  'Mark as read': 'تحديد كمقروء',
  'Mark all as read': 'تحديد الكل كمقروء',

  // States and small words
  'Loading…': 'جارٍ التحميل…',
  'Saving…': 'جارٍ الحفظ…',
  'Sending…': 'جارٍ الإرسال…',
  'Today': 'اليوم',
  'Tomorrow': 'غدًا',
  'Yesterday': 'أمس',
  'Now': 'الآن',
  'Day': 'يوم',
  'Week': 'أسبوع',
  'Month': 'شهر',
  'Year': 'سنة',
  'All': 'الكل',
  'None': 'لا شيء',
  'Any': 'أي',
  'You': 'أنت',
  'Me': 'أنا',
  'and': 'و',
  'or': 'أو',
  'On': 'مفعّل',
  'Off': 'متوقف',
  'Optional': 'اختياري',
  'Required': 'مطلوب',
  'Not available yet': 'غير متاح بعد',
  'Something went wrong.': 'حدث خطأ ما.',
  'Something went wrong. Please try again.': 'حدث خطأ ما. حاول مرة أخرى.',
  'Nothing here yet': 'لا شيء هنا بعد',
  'No results': 'لا نتائج',

  // Task status and priority (the values the API uses stay English; these are the labels)
  'To do': 'للتنفيذ',
  'In progress': 'قيد التنفيذ',
  'In review': 'قيد المراجعة',
  'On hold': 'معلّقة',
  'Completed': 'مكتملة',
  'Cancelled': 'ملغاة',
  'Low': 'منخفضة',
  'Medium': 'متوسطة',
  'High': 'عالية',
  'Urgent': 'عاجلة',

  // Appearance
  'Dark': 'داكن',
  'Light': 'فاتح',
  'System': 'النظام',
  'Theme': 'المظهر',
  'Language': 'اللغة',
  'English': 'English',
  'Arabic': 'العربية'
};

export const AR_COMMON_PLURALS: PluralDictionary = {
  '{n} minutes': {
    zero: '{n} دقيقة', one: 'دقيقة واحدة', two: 'دقيقتان', few: '{n} دقائق', many: '{n} دقيقة', other: '{n} دقيقة'
  },
  '{n} hours': {
    zero: '{n} ساعة', one: 'ساعة واحدة', two: 'ساعتان', few: '{n} ساعات', many: '{n} ساعة', other: '{n} ساعة'
  },
  '{n} days': {
    zero: '{n} يوم', one: 'يوم واحد', two: 'يومان', few: '{n} أيام', many: '{n} يومًا', other: '{n} يوم'
  },
  '{n} weeks': {
    zero: '{n} أسبوع', one: 'أسبوع واحد', two: 'أسبوعان', few: '{n} أسابيع', many: '{n} أسبوعًا', other: '{n} أسبوع'
  },
  '{n} tasks': {
    zero: 'لا مهام', one: 'مهمة واحدة', two: 'مهمتان', few: '{n} مهام', many: '{n} مهمة', other: '{n} مهمة'
  },
  '{n} events': {
    zero: 'لا أحداث', one: 'حدث واحد', two: 'حدثان', few: '{n} أحداث', many: '{n} حدثًا', other: '{n} حدث'
  },
  '{n} people': {
    zero: 'لا أحد', one: 'شخص واحد', two: 'شخصان', few: '{n} أشخاص', many: '{n} شخصًا', other: '{n} شخص'
  },
  '{n} members': {
    zero: 'لا أعضاء', one: 'عضو واحد', two: 'عضوان', few: '{n} أعضاء', many: '{n} عضوًا', other: '{n} عضو'
  },
  '{n} comments': {
    zero: 'لا تعليقات', one: 'تعليق واحد', two: 'تعليقان', few: '{n} تعليقات', many: '{n} تعليقًا', other: '{n} تعليق'
  }
};
