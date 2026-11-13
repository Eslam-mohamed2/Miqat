import { Dictionary, PluralDictionary } from '../i18n';

/**
 * Chat and calls: the chat corner, chat windows, groups and their members,
 * the call screens, and the lines the chat writes about a group or a call
 * (core/services/chat-text.ts).
 *
 * Arabic verbs agree with the gender of their subject and the API does not say
 * whether a person is a man or a woman. So what somebody else did is said without
 * a verb that would need it ("تمت إضافة سارة بواسطة آية"); the two sentences that
 * cannot avoid one ("… يكتب", "غادر …") use the masculine, as Arabic does for an
 * unknown person.
 */
export const AR_CHAT: Dictionary = {
  // ── The chat corner ────────────────────────────────────────────────────────
  'Chat with {name}': 'محادثة مع {name}',
  'Chat with {name}, {n} unread': 'محادثة مع {name}، {n} غير مقروءة',
  'Close chat with {name}': 'إغلاق المحادثة مع {name}',
  'Chats, {n} unread': 'المحادثات، {n} غير مقروءة',
  'New group': 'مجموعة جديدة',
  'Search friends and groups': 'ابحث في الأصدقاء والمجموعات',
  'Search friends': 'ابحث في الأصدقاء',
  'Call in progress': 'مكالمة جارية',
  'Join the call in {name}': 'الانضمام إلى المكالمة في {name}',
  'Start a chat': 'بدء محادثة',
  'Online': 'متصل',
  'Offline': 'غير متصل',
  'Say hello': 'قل مرحبًا',
  'No friend or group matches that name.': 'لا يوجد صديق أو مجموعة بهذا الاسم.',
  'No friend matches that name.': 'لا يوجد صديق بهذا الاسم.',
  'Add friends to start chatting with them.': 'أضف أصدقاء لتبدأ المحادثة معهم.',
  'Could not open the chat. Try again.': 'تعذّر فتح المحادثة. حاول مرة أخرى.',

  // ── A chat window ──────────────────────────────────────────────────────────
  'Members of {name}': 'أعضاء {name}',
  'Open the profile of {name}': 'فتح الملف الشخصي لـ{name}',
  'typing…': 'جارٍ الكتابة…',
  '{name} is typing': '{name} يكتب الآن',
  '{name} is typing…': '{name} يكتب…',
  'Voice call': 'مكالمة صوتية',
  'Video call': 'مكالمة فيديو',
  'Minimise chat': 'تصغير المحادثة',
  'Minimise': 'تصغير',
  'Close chat': 'إغلاق المحادثة',
  'You are in this call on another tab': 'أنت في هذه المكالمة من تبويب آخر',
  'Earlier messages': 'رسائل أقدم',
  'Loading messages…': 'جارٍ تحميل الرسائل…',
  'Say hello to {name}.': 'قل مرحبًا لـ{name}.',
  'Call again · {time}': 'معاودة الاتصال · {time}',
  'Message deleted': 'تم حذف هذه الرسالة',
  'edited': 'معدّلة',
  'Delete?': 'حذف الرسالة؟',
  'Keep': 'إبقاء',
  'Edit message': 'تعديل الرسالة',
  'Delete message': 'حذف الرسالة',
  'Not sent. Try again': 'لم تُرسل. حاول مرة أخرى',
  'You are no longer in this group.': 'لم تعد عضوًا في هذه المجموعة.',
  'You are no longer friends, so this chat is closed.': 'لم تعودا صديقين، لذلك أُغلقت هذه المحادثة.',
  'Editing your message': 'تعديل رسالتك',
  'Write a message': 'اكتب رسالة',
  'Message {name}': 'رسالة إلى {name}',
  'Save change': 'حفظ التعديل',
  'Send message': 'إرسال الرسالة',
  'Could not save the change.': 'تعذّر حفظ التعديل.',
  'Could not delete the message.': 'تعذّر حذف الرسالة.',
  'Someone': 'شخص ما',

  // Under the user's newest message.
  'Sent': 'تم الإرسال',
  'Seen': 'تمت المشاهدة',
  'Seen by everyone': 'شاهدها الجميع',
  'Seen by {name}': 'تمت المشاهدة بواسطة {name}',
  'Seen by {first} and {second}': 'تمت المشاهدة بواسطة {first} و{second}',

  // In the chat list, under a name.
  'You: {text}': 'أنت: {text}',
  '{name}: {text}': '{name}: {text}',

  // ── What happened to a group (a line in the middle of the chat) ────────────
  'You created the group “{group}”': 'أنت أنشأت المجموعة «{group}»',
  '{actor} created the group “{group}”': 'تم إنشاء المجموعة «{group}» بواسطة {actor}',
  'You added {name}': 'أنت أضفت {name}',
  '{actor} added you': 'تمت إضافتك بواسطة {actor}',
  '{actor} added {name}': 'تمت إضافة {name} بواسطة {actor}',
  'You removed {name}': 'أنت أزلت {name}',
  '{actor} removed you': 'تمت إزالتك بواسطة {actor}',
  '{actor} removed {name}': 'تمت إزالة {name} بواسطة {actor}',
  'You left the group': 'أنت غادرت المجموعة',
  '{actor} left the group': 'غادر {actor} المجموعة',
  'You renamed the group to “{group}”': 'أنت غيّرت اسم المجموعة إلى «{group}»',
  '{actor} renamed the group to “{group}”': 'تم تغيير اسم المجموعة إلى «{group}» بواسطة {actor}',

  // ── The record of a call (a line in the middle of the chat) ────────────────
  'Video call · {length}': 'مكالمة فيديو · {length}',
  'Voice call · {length}': 'مكالمة صوتية · {length}',
  'Video call declined': 'مكالمة فيديو مرفوضة',
  'Voice call declined': 'مكالمة صوتية مرفوضة',
  'Missed video call': 'مكالمة فيديو فائتة',
  'Missed voice call': 'مكالمة صوتية فائتة',
  'Video call · no one joined': 'مكالمة فيديو · لم ينضم أحد',
  'Voice call · no one joined': 'مكالمة صوتية · لم ينضم أحد',
  'Video call · no answer': 'مكالمة فيديو · بلا رد',
  'Voice call · no answer': 'مكالمة صوتية · بلا رد',

  // ── The members of a group ─────────────────────────────────────────────────
  'Back to the members': 'رجوع إلى الأعضاء',
  'Back to the messages': 'رجوع إلى الرسائل',
  'Group@@this group': 'المجموعة',
  'Add people': 'إضافة أشخاص',
  'All of your friends are already in this group.': 'كل أصدقائك أعضاء في هذه المجموعة بالفعل.',
  'Group name': 'اسم المجموعة',
  'Rename group': 'إعادة تسمية المجموعة',
  'Admin': 'مشرف',
  'Actions for {name}': 'إجراءات {name}',
  'Actions': 'إجراءات',
  'Remove {name} from the group?': 'إزالة {name} من المجموعة؟',
  'Make admin': 'تعيين مشرفًا',
  'Remove from group': 'إزالة من المجموعة',
  'Leave “{name}”? You will stop getting its messages.': 'مغادرة «{name}»؟ لن تصلك رسائلها بعد ذلك.',
  'Stay': 'البقاء',
  'Leave group': 'مغادرة المجموعة',
  'Could not add them. Try again.': 'تعذّرت إضافتهم. حاول مرة أخرى.',
  'Could not rename the group. Try again.': 'تعذّرت إعادة تسمية المجموعة. حاول مرة أخرى.',
  'Could not make {name} an admin.': 'تعذّر تعيين {name} مشرفًا.',
  'Could not remove {name}.': 'تعذّرت إزالة {name}.',
  'Could not leave the group. Try again.': 'تعذّرت مغادرة المجموعة. حاول مرة أخرى.',

  // ── Picking friends, and "New group" ───────────────────────────────────────
  'Chosen people': 'الأشخاص المختارون',
  'Take out {name}': 'استبعاد {name}',
  'Take out': 'استبعاد',
  'You have no friends to add yet.': 'ليس لديك أصدقاء لإضافتهم بعد.',
  'Weekend trip': 'رحلة نهاية الأسبوع',
  'People · {n} chosen': 'الأشخاص · تم اختيار {n}',
  'Add friends on the People page first. A group is made of your friends.':
    'أضف أصدقاء من صفحة «الأشخاص» أولًا، فالمجموعة تتكوّن من أصدقائك.',
  'Give the group a name.': 'اكتب اسمًا للمجموعة.',
  'A group needs at least two of your friends.': 'تحتاج المجموعة إلى اثنين من أصدقائك على الأقل.',
  'Pick at least two friends.': 'اختر صديقين على الأقل.',
  'Creating…': 'جارٍ الإنشاء…',
  'Create group': 'إنشاء المجموعة',
  'Could not create the group. Try again.': 'تعذّر إنشاء المجموعة. حاول مرة أخرى.',

  // ── A call between two people ──────────────────────────────────────────────
  'Starting…': 'جارٍ البدء…',
  'Ringing…': 'يرنّ…',
  'Connecting…': 'جارٍ الاتصال…',
  'Incoming video call': 'مكالمة فيديو واردة',
  'Incoming voice call': 'مكالمة صوتية واردة',
  'Incoming video call from {name}': 'مكالمة فيديو واردة من {name}',
  'Incoming voice call from {name}': 'مكالمة صوتية واردة من {name}',
  'Call with {name}': 'مكالمة مع {name}',
  'Mute microphone': 'كتم الميكروفون',
  'Unmute microphone': 'إلغاء كتم الميكروفون',
  'Mute': 'كتم',
  'Unmute': 'إلغاء الكتم',
  'Turn camera on': 'تشغيل الكاميرا',
  'Turn camera off': 'إيقاف الكاميرا',
  'Camera on': 'تشغيل الكاميرا',
  'Camera off': 'إيقاف الكاميرا',
  'Hang up': 'إنهاء المكالمة',
  'Cancel call': 'إلغاء المكالمة',

  // ── A group call ───────────────────────────────────────────────────────────
  '{name} is calling {group}': 'مكالمة من {name} في {group}',
  'Video call in {group}': 'مكالمة فيديو في {group}',
  'Voice call in {group}': 'مكالمة صوتية في {group}',
  'Dismiss@@a ringing call': 'تجاهل',
  'Call in {group}': 'مكالمة في {group}',
  'People in the call': 'المشاركون في المكالمة',
  'Could not connect': 'تعذّر الاتصال',
  'Leave call': 'مغادرة المكالمة',
  'Joining…': 'جارٍ الانضمام…',
  'Waiting for the others to join…': 'في انتظار انضمام الآخرين…'
};

export const AR_CHAT_PLURALS: PluralDictionary = {
  // Under the name of a group call, with its clock: "3 people · 2:05".
  '{n} people · {time}': {
    zero: 'لا أحد · {time}', one: 'شخص واحد · {time}', two: 'شخصان · {time}', few: '{n} أشخاص · {time}',
    many: '{n} شخصًا · {time}', other: '{n} شخص · {time}'
  },
  'Call in progress · {n} people': {
    zero: 'مكالمة جارية', one: 'مكالمة جارية · شخص واحد', two: 'مكالمة جارية · شخصان',
    few: 'مكالمة جارية · {n} أشخاص', many: 'مكالمة جارية · {n} شخصًا', other: 'مكالمة جارية · {n} شخص'
  },
  'Call in progress · full ({n} people)': {
    zero: 'مكالمة جارية · مكتملة العدد', one: 'مكالمة جارية · مكتملة العدد (شخص واحد)',
    two: 'مكالمة جارية · مكتملة العدد (شخصان)', few: 'مكالمة جارية · مكتملة العدد ({n} أشخاص)',
    many: 'مكالمة جارية · مكتملة العدد ({n} شخصًا)', other: 'مكالمة جارية · مكتملة العدد ({n} شخص)'
  },
  'Video call · {length} · {n} people': {
    zero: 'مكالمة فيديو · {length}', one: 'مكالمة فيديو · {length} · شخص واحد',
    two: 'مكالمة فيديو · {length} · شخصان', few: 'مكالمة فيديو · {length} · {n} أشخاص',
    many: 'مكالمة فيديو · {length} · {n} شخصًا', other: 'مكالمة فيديو · {length} · {n} شخص'
  },
  'Voice call · {length} · {n} people': {
    zero: 'مكالمة صوتية · {length}', one: 'مكالمة صوتية · {length} · شخص واحد',
    two: 'مكالمة صوتية · {length} · شخصان', few: 'مكالمة صوتية · {length} · {n} أشخاص',
    many: 'مكالمة صوتية · {length} · {n} شخصًا', other: 'مكالمة صوتية · {length} · {n} شخص'
  },
  '{n} people are typing…': {
    zero: 'لا أحد يكتب', one: 'شخص واحد يكتب…', two: 'شخصان يكتبان…', few: '{n} أشخاص يكتبون…',
    many: '{n} شخصًا يكتبون…', other: '{n} شخص يكتبون…'
  },
  'Seen by {n} people': {
    zero: 'تم الإرسال', one: 'تمت المشاهدة بواسطة شخص واحد', two: 'تمت المشاهدة بواسطة شخصين',
    few: 'تمت المشاهدة بواسطة {n} أشخاص', many: 'تمت المشاهدة بواسطة {n} شخصًا', other: 'تمت المشاهدة بواسطة {n} شخص'
  },
  // On the button of "Add people" once more than one friend is ticked.
  'Add {n} people': {
    zero: 'إضافة', one: 'إضافة شخص واحد', two: 'إضافة شخصين', few: 'إضافة {n} أشخاص',
    many: 'إضافة {n} شخصًا', other: 'إضافة {n} شخص'
  }
};
