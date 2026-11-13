import { Dictionary, PluralDictionary } from '../i18n';

/**
 * The screens outside the app shell: the landing page with its header and footer,
 * the sign-in screens, "Set up your week" and the public booking page.
 *
 * The cities, the prayer names and methods, and what the API answers are in core.ts.
 *
 * Digits are written 0-9 here: the page passes these sentences through `num()`, or
 * fills them through a `{placeholder}`, so they follow the digit style chosen.
 * A `*` marks the part of a sentence the page draws differently (an accent word, a
 * link, a key): keep the same number of them as in the English.
 */
export const AR_PUBLIC: Dictionary = {
  // ── Header and footer ─────────────────────────────────────────────────────
  'Main@@navigation': 'التنقل الرئيسي',
  'Product': 'المنتج',
  'How it works': 'كيف يعمل',
  'Arabic and Hijri': 'العربية والهجري',
  'Questions': 'الأسئلة',
  'Footer': 'تذييل الصفحة',
  'Privacy': 'الخصوصية',
  'Terms': 'الشروط',
  'Status@@service': 'حالة الخدمة',
  'The privacy policy is not published yet': 'لم تُنشر سياسة الخصوصية بعد',
  'The terms are not published yet': 'لم تُنشر الشروط بعد',
  'There is no status page yet': 'لا توجد صفحة لحالة الخدمة بعد',
  '© {year} Miqat · Made in Cairo': '© {year} Miqat · صُنع في القاهرة',

  // ── Landing page: hero ────────────────────────────────────────────────────
  'Plan my day: Miqat proposes, you approve': 'خطّط يومي: Miqat يقترح وأنت تقرّر',
  'The calendar that *plans with you.*': 'التقويم الذي *يخطّط معك.*',
  'Miqat keeps your meetings, tasks, whiteboards and plans in one calm place, then finds the right time for the work that matters. In English or Arabic, around your week and your prayers.':
    'Miqat يجمع اجتماعاتك ومهامك وسبوراتك وخططك في مكان واحد هادئ، ثم يجد الوقت المناسب للعمل الأهم. بالعربية أو الإنجليزية، وفق أسبوعك وأوقات صلاتك.',
  'See a day with Miqat': 'شاهد يومًا مع Miqat',
  'Press *C* anywhere in Miqat to create anything.': 'اضغط *C* في أي مكان من Miqat لإنشاء أي شيء.',
  'Product preview': 'لمحة عن المنتج',

  // The week picture: sample content, as an Arabic-speaking team would have it.
  'Week 46 · Jumada II 1448': 'الأسبوع 46 · جمادى الآخرة 1448',
  'To plan': 'للتخطيط',
  'Rotate staging secrets': 'تدوير مفاتيح بيئة الاختبار',
  'DevOps · 45m': 'العمليات · 45 د',
  'Add user search endpoint': 'إضافة واجهة البحث عن المستخدمين',
  'Backend · 1h': 'الخادم · 1 س',
  'Draft launch announcement': 'صياغة إعلان الإطلاق',
  'Launch · 1h 30m': 'الإطلاق · 1 س 30 د',
  '28 Jum. I': '28 جمادى الأولى',
  '29 Jum. I': '29 جمادى الأولى',
  '30 Jum. I': '30 جمادى الأولى',
  '1 Jum. II': '1 جمادى الآخرة',
  '2 Jum. II': '2 جمادى الآخرة',
  'Weekly planning': 'التخطيط الأسبوعي',
  'Leadership 1:1': 'لقاء فردي مع الإدارة',
  'Team standup': 'اجتماع الفريق اليومي',
  'Review PR #212': 'مراجعة طلب الدمج #212',
  'API design session': 'جلسة تصميم الواجهات',
  'Pagination endpoints': 'واجهات ترقيم الصفحات',
  'Product sync': 'اجتماع المنتج',
  'Hiring loop': 'مقابلات التوظيف',
  'Deploy window': 'نافذة النشر',
  'Write auth spec': 'كتابة مواصفات الدخول',
  'Sprint planning': 'تخطيط السبرنت',
  'Design review': 'مراجعة التصميم',
  'Reply to mentions': 'الرد على الإشارات',
  '{prayer} {time}': '{prayer} {time}',

  // Quick add, typed the way people say it.
  'Quick add': 'إضافة سريعة',
  'Lunch@@quick add': 'غداء',
  'with@@quick add': 'مع',
  'tomorrow@@quick add': 'بكرة',
  '1pm@@quick add': 'الساعة 1 الظهر',
  '#Personal': '#شخصي',
  'Omar': 'عمر',
  'Eslam': 'إسلام',
  'Mariam': 'مريم',
  'Sara': 'سارة',
  'Fri is your weekend. Omar is free *Sun 13:00* instead.': 'الجمعة يوم عطلتك. عمر متاح *الأحد 13:00* بدلًا منه.',
  'Planned by Miqat': 'خطّطه Miqat',
  'Due today at 17:00. Placed in your morning focus window, clear of meetings and Dhuhr.':
    'تُستحق اليوم 17:00. وُضعت في فترة تركيزك الصباحية، بعيدًا عن الاجتماعات وصلاة الظهر.',
  'Keep': 'إبقاء',
  'Move': 'نقل',

  // What Miqat holds to
  'Keyboard-first': 'لوحة المفاتيح أولًا',
  'Arabic and English, right to left': 'العربية والإنجليزية، من اليمين إلى اليسار',
  'Your work week, Sunday to Thursday': 'أسبوع عملك، من الأحد إلى الخميس',
  'You approve every change': 'كل تغيير بموافقتك',

  // ── Landing page: product ─────────────────────────────────────────────────
  'One calendar for time, tasks and people.': 'تقويم واحد للوقت والمهام والأشخاص.',
  'Everything links to everything else, so a sticky note can become a task, a task can find its hour, and an hour can become a meeting.':
    'كل شيء مرتبط بكل شيء: الملاحظة اللاصقة تصير مهمة، والمهمة تجد ساعتها، والساعة تصير اجتماعًا.',
  'Type it the way you’d say it': 'اكتبها كما تقولها',
  'Miqat reads people, dates, times, lengths, repeats and projects as you type, in English or Arabic, and shows you what it understood before you press Enter.':
    'Miqat يقرأ الأشخاص والتواريخ والأوقات والمدد والتكرار والمشاريع وأنت تكتب، بالعربية أو الإنجليزية، ويعرض عليك ما فهمه قبل أن تضغط Enter.',
  'Tick what deserves today. Miqat places it. Nothing moves until you approve.':
    'اختر ما يستحق يومك، وMiqat يضعه في مكانه. لا شيء يتحرك قبل موافقتك.',
  '6 h': '6 س',
  'of 8 h planned': 'من 8 س مخطّطة',
  'Balanced. 2 h left for the unexpected.': 'يوم متوازن. تبقى ساعتان لما لم يكن في الحسبان.',
  'Find a time, across time zones': 'ابحث عن وقت، عبر المناطق الزمنية',
  'See everyone’s working hours side by side and send the best time, or a booking link.':
    'شاهد ساعات عمل الجميع جنبًا إلى جنب، وأرسل أفضل وقت أو رابط الحجز.',
  'Sun 15 · 15:00 works for all four': 'الأحد 15 · 15:00 يناسب الأربعة',
  'Prayer times and Hijri dates': 'أوقات الصلاة والتواريخ الهجرية',
  'An optional layer for your city. Miqat plans around it and tells you when a meeting runs into one.':
    'طبقة اختيارية لمدينتك. Miqat يخطّط حولها وينبّهك إذا تعارض اجتماع مع صلاة.',
  'Thursday 12 November · 2 Jumada II 1448': 'الخميس 12 نوفمبر · 2 جمادى الآخرة 1448',
  'Tasks that know your calendar': 'مهام تعرف تقويمك',
  'Every task shows when you’ll actually do it, and keeps its time when it moves on the board.':
    'كل مهمة تُظهر متى ستنجزها فعلًا، وتحتفظ بوقتها حين تنتقل على اللوحة.',
  'Thu 10:00': 'الخميس 10:00',
  'Thu 15:15': 'الخميس 15:15',
  'Review calendar week view': 'مراجعة عرض الأسبوع',
  'Schedule@@verb': 'جدولة',
  'From whiteboard to launch date': 'من السبورة إلى موعد الإطلاق',
  'Turn stickies into tasks, connect them in a flow, and see what a one-day delay does to the date that matters.':
    'حوّل الملاحظات اللاصقة إلى مهام، واربطها في مخطط، وشاهد أثر تأخير يوم واحد على الموعد الأهم.',
  'Week view polish': 'تحسين عرض الأسبوع',
  'Prayer-time layer': 'طبقة أوقات الصلاة',
  'Security review': 'المراجعة الأمنية',
  'Beta launch': 'الإطلاق التجريبي',
  '+1 day on QA: Beta launch stays on Thu 26 Nov.': 'يوم إضافي لضمان الجودة: يبقى الإطلاق التجريبي يوم الخميس 26 نوفمبر.',

  // ── Landing page: a day with Miqat ────────────────────────────────────────
  'A day with Miqat': 'يوم مع Miqat',
  'Thursday, composed.': 'خميس هادئ ومنظّم.',
  'Plan@@day stop': 'التخطيط',
  'Miqat lays out your meetings, places three tasks in the gaps, and you approve the day in one click.':
    'Miqat يرتّب اجتماعاتك ويضع ثلاث مهام في الفراغات، وأنت توافق على يومك بنقرة واحدة.',
  'Meet@@day stop': 'الاجتماع',
  'Six minutes before standup, the join button is waiting. Sara joins from Riyadh, an hour ahead.':
    'قبل الاجتماع اليومي بست دقائق، زر الانضمام في انتظارك. سارة تنضم من الرياض، وتوقيتها متقدم بساعة.',
  'Pause@@day stop': 'وقفة',
  'Dhuhr falls inside Sprint planning, so Miqat suggested starting at 12:00. Everyone said yes.':
    'صلاة الظهر تقع في أثناء تخطيط السبرنت، فاقترح Miqat البدء 12:00. ووافق الجميع.',
  'Think together': 'التفكير معًا',
  'The design review opens its whiteboard. Three stickies become tasks before the meeting ends.':
    'مراجعة التصميم تفتح سبورتها. ثلاث ملاحظات لاصقة تصير مهامّ قبل أن ينتهي الاجتماع.',
  'Review@@day stop': 'المراجعة',
  'Five of seven tasks done. What slipped is already waiting in tomorrow’s plan.':
    'أُنجزت خمس مهام من سبع. وما تأخّر ينتظرك في خطة الغد.',

  // ── Landing page: Arabic and Hijri ────────────────────────────────────────
  'Made for how our week actually works.': 'صُمّم لأسبوعنا كما نعيشه فعلًا.',
  'Most calendars were designed for a Monday-to-Friday world. Miqat starts from yours.':
    'أغلب التقاويم صُمّمت لعالم يعمل من الاثنين إلى الجمعة. Miqat يبدأ من عالمك.',
  'A Sunday-to-Thursday week, with Friday and Saturday as your weekend': 'أسبوع من الأحد إلى الخميس، والجمعة والسبت عطلتك',
  'Arabic and English everywhere, including quick add': 'العربية والإنجليزية في كل مكان، حتى في الإضافة السريعة',
  'Hijri dates next to Gregorian, using Umm al-Qura': 'التواريخ الهجرية بجانب الميلادية، وفق تقويم أم القرى',
  'Prayer times for your city, with your chosen method': 'أوقات الصلاة لمدينتك، بطريقة الحساب التي تختارها',
  'Ramadan working hours, coming soon': 'ساعات العمل في رمضان، قريبًا',

  // ── Landing page: questions ───────────────────────────────────────────────
  'Questions, answered.': 'أسئلة وأجوبتها.',
  'Do I have to use prayer times?': 'هل يجب أن أستخدم أوقات الصلاة؟',
  'No. Prayer times and Hijri dates are layers you switch on or off. When they are on, Miqat plans around them and warns you when a meeting runs into one.':
    'لا. أوقات الصلاة والتواريخ الهجرية طبقتان تفعّلهما أو توقفهما متى شئت. وعند تفعيلهما يخطّط Miqat حولهما وينبّهك إذا تعارض اجتماع مع صلاة.',
  'Does Miqat work in Arabic?': 'هل يعمل Miqat بالعربية؟',
  'Yes. The whole interface works right to left, and quick add understands Arabic phrases like “بكرة الساعة ٣ العصر” as well as English.':
    'نعم. الواجهة كلها تعمل من اليمين إلى اليسار، والإضافة السريعة تفهم عبارات عربية مثل «بكرة الساعة ٣ العصر» كما تفهم الإنجليزية.',
  'Can I bring my Google calendar?': 'هل يمكنني إحضار تقويم Google؟',
  'Yes. Import it from Settings or the calendar and choose which Google calendars to copy. Their events appear next to your Miqat tasks, boards and flows. It is a copy, so import again to refresh it.':
    'نعم. استورده من الإعدادات أو من التقويم، واختر تقاويم Google التي تريد نسخها. تظهر أحداثها بجانب مهامك ولوحاتك ومخططاتك في Miqat. وهي نسخة، فأعد الاستيراد لتحديثها.',
  'Will Miqat move my meetings on its own?': 'هل ينقل Miqat اجتماعاتي من تلقاء نفسه؟',
  'Never. Miqat proposes time blocks for your tasks and suggests better meeting times. You approve every change.':
    'أبدًا. Miqat يقترح فترات عمل لمهامك وأوقاتًا أفضل لاجتماعاتك. وكل تغيير بموافقتك.',
  'Who can see my calendar?': 'من يستطيع رؤية تقويمي؟',
  'Only the people you share it with. Booking links show when you are free, never what your events are.':
    'فقط من تشاركه معهم. روابط الحجز تُظهر أوقاتك المتاحة، ولا تكشف أحداثك أبدًا.',

  // ── Landing page: the last word ───────────────────────────────────────────
  'Begin with today.': 'ابدأ من اليوم.',
  'Set up your week in two minutes. Bring your Google calendar with you.': 'جهّز أسبوعك في دقيقتين. وأحضر تقويم Google معك.',
  'Work email': 'بريد العمل',

  // ── Sign-in screens: the page around the form ─────────────────────────────
  'Steps': 'الخطوات',
  'Account': 'الحساب',
  'Verify@@step': 'التحقق',
  'Your week': 'أسبوعك',
  'By continuing you agree to the *Terms* and *Privacy Policy*.': 'بمتابعتك توافق على *الشروط* و*سياسة الخصوصية*.',
  'Current time in {city}': 'الوقت الآن في {city}',
  'Time in {city}': 'الوقت في {city}',
  '{city} · {seconds}s': '{city} · {seconds} ث',
  '{weekday}, {day} {month} {year}': '{weekday}، {day} {month} {year}',
  '{date} AH': '{date}',
  'Every moment, in its *appointed* place.': 'لكل لحظةٍ *ميقاتها*.',

  // ── Sign in and create an account ─────────────────────────────────────────
  'Welcome back.': 'مرحبًا بعودتك.',
  'Pick up where your day left off.': 'أكمل يومك من حيث توقّف.',
  'Create your account.': 'أنشئ حسابك.',
  'Two minutes, then your week is ready.': 'دقيقتان، ثم يصبح أسبوعك جاهزًا.',
  'Continue with Google': 'المتابعة عبر Google',
  'Signing in with Google…': 'جارٍ تسجيل الدخول عبر Google…',
  'or with email': 'أو بالبريد الإلكتروني',
  'Full name': 'الاسم الكامل',
  'Eslam Mohamed': 'إسلام محمد',
  'Full name is required (at least {n} characters).': 'الاسم الكامل مطلوب ({n} أحرف على الأقل).',
  'A valid email is required.': 'أدخل بريدًا إلكترونيًا صحيحًا.',
  'At least {n} characters': '{n} أحرف على الأقل',
  'Hide password': 'إخفاء كلمة المرور',
  'Show password': 'إظهار كلمة المرور',
  'Creating your account…': 'جارٍ إنشاء حسابك…',
  'Forgot password?': 'نسيت كلمة المرور؟',
  'Signing in…': 'جارٍ تسجيل الدخول…',
  'Already have an account?': 'لديك حساب؟',
  'New to Miqat?': 'جديد على Miqat؟',
  'Create an account': 'إنشاء حساب',
  'Your email is verified. You can sign in now.': 'تم التحقق من بريدك الإلكتروني. يمكنك تسجيل الدخول الآن.',
  'Your password has been reset. You can sign in now.': 'تمت إعادة تعيين كلمة المرور. يمكنك تسجيل الدخول الآن.',
  'Login succeeded but no session token was returned. Please try again.': 'نجح تسجيل الدخول لكن تعذّر بدء الجلسة. حاول مرة أخرى.',
  'Login failed. Please try again.': 'تعذّر تسجيل الدخول. حاول مرة أخرى.',
  'Registration failed. Please try again.': 'تعذّر إنشاء الحساب. حاول مرة أخرى.',
  'Google sign-in is not available right now. Use your email and password instead.':
    'تسجيل الدخول عبر Google غير متاح الآن. استخدم بريدك الإلكتروني وكلمة المرور.',
  'Google login succeeded but no session token was returned.': 'نجح تسجيل الدخول عبر Google لكن تعذّر بدء الجلسة.',
  'Google login failed.': 'تعذّر تسجيل الدخول عبر Google.',

  // ── Forgot password, the code, a new password ─────────────────────────────
  'Reset your password.': 'أعد تعيين كلمة المرور.',
  'We’ll email you a {n}-digit code.': 'سنرسل إلى بريدك رمزًا من {n} أرقام.',
  'Send code': 'إرسال الرمز',
  'Back to sign in': 'العودة إلى تسجيل الدخول',
  'Failed to request password reset. Please try again.': 'تعذّر طلب إعادة تعيين كلمة المرور. حاول مرة أخرى.',
  'Check your email.': 'تحقّق من بريدك.',
  'We sent a {n}-digit code to *{email}*. It expires in {minutes} minutes.':
    'أرسلنا رمزًا من {n} أرقام إلى *{email}*. تنتهي صلاحيته خلال {minutes} دقائق.',
  'Verification code': 'رمز التحقق',
  'Digit {n}': 'الرقم {n}',
  'Verify': 'تحقق',
  'Verifying…': 'جارٍ التحقق…',
  'Wrong email?': 'بريد خاطئ؟',
  'Resend code in {time}': 'إعادة إرسال الرمز بعد {time}',
  'Resend code': 'إعادة إرسال الرمز',
  'Your account was created, but the code could not be emailed. Press "Resend code" to try again.':
    'أُنشئ حسابك، لكن تعذّر إرسال الرمز إلى بريدك. اضغط «إعادة إرسال الرمز» للمحاولة من جديد.',
  'Your email is not verified yet. Enter the code we emailed you when you signed up, or press "Resend code" for a new one.':
    'لم يُتحقق من بريدك الإلكتروني بعد. أدخل الرمز الذي أرسلناه إليك عند التسجيل، أو اضغط «إعادة إرسال الرمز» لتحصل على رمز جديد.',
  'Enter all {n} digits of the code.': 'أدخل الرمز كاملًا ({n} أرقام).',
  'Invalid code. Please try again.': 'الرمز غير صحيح. حاول مرة أخرى.',
  'A new code has been sent to your email.': 'أُرسل رمز جديد إلى بريدك.',
  'Failed to resend the code.': 'تعذّرت إعادة إرسال الرمز.',
  'Choose a new password.': 'اختر كلمة مرور جديدة.',
  'New password': 'كلمة المرور الجديدة',
  'Repeat it': 'أعد كتابتها',
  '{n}+ characters': '{n} أحرف أو أكثر',
  'Uppercase letter': 'حرف كبير',
  'Number@@password rule': 'رقم',
  'Special character': 'رمز خاص',
  ': met': ': تحقّق',
  ': not met yet': ': لم يتحقق بعد',
  'Type the new password once more.': 'اكتب كلمة المرور الجديدة مرة أخرى.',
  'Save and sign in': 'حفظ وتسجيل الدخول',
  'Failed to reset password. Please try again.': 'تعذّرت إعادة تعيين كلمة المرور. حاول مرة أخرى.',

  // What these screens can be answered with that core.ts does not list: the sign-in
  // rate limit (Program.cs), the reset validator, and the password check's last resort.
  'Too many attempts. Please wait a moment and try again.': 'محاولات كثيرة. انتظر قليلًا ثم حاول مرة أخرى.',
  'Token is required.': 'الرمز مطلوب.',
  'Password is invalid.': 'كلمة المرور غير صالحة.',

  // ── Set up your week ──────────────────────────────────────────────────────
  'Preview of your week': 'معاينة أسبوعك',
  'Set up your week.': 'جهّز أسبوعك.',
  'You can change any of this later in Settings.': 'يمكنك تغيير كل هذا لاحقًا من الإعدادات.',
  '{zone} · detected': '{zone} · حسب جهازك',
  'Work week': 'أسبوع العمل',
  '{from} – {to}': '{from} – {to}',
  'Prayer times': 'أوقات الصلاة',
  'Shown on your calendar. Miqat plans around them.': 'تظهر في تقويمك، وMiqat يخطّط حولها.',
  'Hijri dates': 'التواريخ الهجرية',
  'Next to every Gregorian date': 'بجانب كل تاريخ ميلادي',
  'Method@@prayer times': 'طريقة الحساب',
  'Start with today': 'ابدأ من اليوم',
  'Working hours {start} – {end} · {city}': 'ساعات العمل {start} – {end} · {city}',
  'Miqat has no prayer times for {city} yet.': 'لا يملك Miqat أوقات الصلاة لمدينة {city} بعد.',
  'Dashed days are your weekend. Miqat won’t suggest work there.': 'الأيام ذات الإطار المتقطّع عطلتك، ولن يقترح Miqat عملًا فيها.',
  'Could not load your account. Please try again.': 'تعذّر تحميل حسابك. حاول مرة أخرى.',
  'Could not save your week. Please try again.': 'تعذّر حفظ أسبوعك. حاول مرة أخرى.',

  // ── The public booking page ───────────────────────────────────────────────
  'Times shown in your time zone': 'الأوقات معروضة بمنطقتك الزمنية',
  '{name}’s calendar is kept by Miqat. Only free times are shown.': 'تقويم {name} يديره Miqat. تُعرض الأوقات المتاحة فقط.',
  'Choose a day': 'اختر يومًا',
  'Previous month': 'الشهر السابق',
  'Next month': 'الشهر التالي',
  '{month} {year}': '{month} {year}',
  '{day} {month}, times available': '{day} {month}، فيه أوقات متاحة',
  '{day} {month}, unavailable': '{day} {month}، غير متاح',
  'Days with a dot have open times.': 'الأيام التي تحتها نقطة فيها أوقات متاحة.',
  '{day}s': '{day}',
  '{first} and {last}': '{first} و{last}',
  ', ': '، ',
  '{days} are {name}’s weekend.': '{days} عطلة {name} الأسبوعية.',
  '{days} is {name}’s weekend.': '{days} عطلة {name} الأسبوعية.',
  'Choose a time': 'اختر وقتًا',
  'No open times': 'لا أوقات متاحة',
  '{weekday}, {day} {month}': '{weekday}، {day} {month}',
  '{zone}, {name}’s time zone.': '{zone}، المنطقة الزمنية لـ{name}.',
  'Detected: {zone}. {name} is on the same time.': 'منطقتك: {zone}. {name} على التوقيت نفسه.',
  'Detected: {zone}. {name} is in {city}, {hours} h ahead.': 'منطقتك: {zone}. {name} في {city}، وتوقيته متقدم {hours} س.',
  'Detected: {zone}. {name} is in {city}, {hours} h behind.': 'منطقتك: {zone}. {name} في {city}، وتوقيته متأخر {hours} س.',
  '{start} – {end}': '{start} – {end}',
  'Booking is not open yet': 'الحجز غير متاح بعد',
  'This booking link isn’t available.': 'رابط الحجز هذا غير متاح.',
  'There is no booking page at this address right now. The link may have been switched off, or the address may be mistyped. Ask the person who sent it to you for a new one.':
    'لا توجد صفحة حجز على هذا العنوان الآن. ربما أُوقف الرابط، أو كُتب العنوان خطأً. اطلب رابطًا جديدًا ممّن أرسله إليك.',
  'About Miqat': 'عن Miqat',
  'Have a Miqat account? Sign in to plan your own week.': 'لديك حساب في Miqat؟ سجّل الدخول لتخطّط أسبوعك.',
  'Scheduled with Miqat': 'تمت الجدولة عبر Miqat'
};

export const AR_PUBLIC_PLURALS: PluralDictionary = {
};
