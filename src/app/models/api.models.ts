/**
 * Envelope the API wraps every payload in.
 * Confirmed on error responses (`{"success":false,"message":"...","data":null,"errors":null}`).
 */
export interface ApiResponse<T> {
  success: boolean;
  message: string | null;
  data: T | null;
  errors: Record<string, string[]> | string[] | null;
}

/** Shape returned by paged endpoints such as GET /api/Group/{groupId}/members. */
export interface PagedResult<T> {
  items: T[];
  pageIndex?: number;
  pageSize?: number;
  totalCount?: number;
}

export interface LoginRequest { email: string; password?: string; }
export interface RegisterRequest { fullName: string; email: string; password?: string; phoneNumber: string; country: string; timeZone: string; }
export interface RefreshTokenRequest { token?: string; refreshToken: string; }
export interface VerifyOtpDto { email: string; code: string; purpose: OtpPurpose; }
export interface ForgotPasswordDto { email: string; }
export interface ResetPasswordDto { email: string; token: string; newPassword: string; confirmPassword: string; }
export interface ChangePasswordDto { currentPassword: string; newPassword: string; confirmPassword: string; }
export interface ResendOtpDto { email: string; purpose: OtpPurpose; }
export interface GoogleLoginDto { token: string; }

/** Values the API's OTP endpoints accept for `purpose`. */
export type OtpPurpose = 'EmailVerification' | 'PasswordReset';

/** Token payload returned by the auth endpoints, once unwrapped from the envelope. */
export interface AuthTokens {
  accessToken?: string;
  refreshToken?: string;
  /** Some endpoints name the access token `token` instead. */
  token?: string;
}

export interface UserDto {
  id: string; fullName: string; email: string; phoneNumber: string; profilePictureUrl: string;
  dateOfBirth: string; gender: string; country: string; timeZone: string; role: string;
  isActive: boolean; isVerified: boolean; createdAt: string;
  /** Short "about me" text. Absent on older API builds. */
  bio?: string | null;
}

export interface UpdateProfileDto {
  fullName: string; phoneNumber: string | null; country: string | null;
  timeZone: string | null; gender: string | null; dateOfBirth: string | null;
  bio?: string | null;
}

/** A row from GET /api/User/contacts: someone this user can pick (a friend or a teammate). */
export interface ContactDto {
  id: string; fullName: string; email: string; profilePictureUrl?: string | null;
  isFriend: boolean; isTeammate: boolean;
  /** "Friend", "Teammate" or "Friend and teammate". */
  relationship?: string;
}

/** GET / PUT /api/User/me/preferences. */
export interface UserPreferencesDto {
  pushNotifications: boolean; emailNotifications: boolean; weeklySummary: boolean;
}

export interface TaskDto {
  id: string; title: string; description: string; status: string; priority: string; dueDate: string;
  tags: string; recurrence: string; recurrenceEndDate: string; userId: string; ownerName: string;
  assignedToUserId: string; assignedToUserName: string; groupId: string; groupName: string; createdAt: string;
  // Sent by current API builds; absent on older ones, so everything below is optional.
  startDate?: string | null; completedAt?: string | null; updatedAt?: string | null;
  ownerProfilePictureUrl?: string | null; assignedToUserProfilePictureUrl?: string | null;
  groupColor?: string | null; commentCount?: number; isOverdue?: boolean;
  /** Checklist lines on the task, and how many of them are ticked. */
  subtaskCount?: number; completedSubtaskCount?: number;
  /** True while a task this one depends on is not finished. */
  isBlocked?: boolean;
}

/**
 * `description`, `color` and `ownerName` are optional because the API declares
 * them `nullable: true` — they are plain `string?` on the server DTO. The counts
 * are not: they are non-nullable `int`, so they always arrive.
 */
export interface GroupDto {
  id: string; name: string; description?: string; color?: string; ownerId: string; ownerName?: string;
  memberCount: number; taskCount: number; createdAt: string;
  /** Completed subset of taskCount, for the progress bar. */
  completedTaskCount?: number;
  /** Comments and replies in the project's discussion. Absent on an API build without discussions. */
  commentCount?: number;
  /** The caller owns the project. */
  isOwner?: boolean;
}

/**
 * Single source of truth for notifications. `title`/`message` are optional because
 * the API does not declare a response schema for them.
 */
export interface NotificationDto {
  id: string; isRead: boolean; createdAt: string; type?: string; title?: string; message?: string;
  recipientUserId?: string;
  /** Anchor within the linked task when the notification is about a comment. */
  linkedCommentId?: string | null;
  /** Who caused it. Null for system-generated notifications. */
  triggeredByUserId?: string | null;
  triggeredByUserName?: string | null;
  triggeredByUserProfilePictureUrl?: string | null;
  /** What it points at, so the row can navigate somewhere useful. */
  linkedEntityId?: string | null;
  /** "Group" | "TaskItem" | "Friendship" */
  linkedEntityType?: string | null;
  /** The task title or project name, so the row can say what it is about. */
  linkedEntityName?: string | null;
}

/**
 * A row from GET /api/Group/{id}/members. Note it is NOT a UserDto: the person's
 * id arrives as `userId`, and there is no `id`/`name`/`avatar` field.
 */
export interface MemberDto {
  userId: string;
  fullName: string;
  email: string;
  profilePictureUrl?: string | null;
  joinedAt: string;
}

/** A comment in a task's discussion thread. */
export interface CommentDto {
  id: string;
  content: string;
  taskId: string;
  authorId: string;
  authorName?: string | null;
  authorProfilePictureUrl?: string | null;
  createdAt: string;
  updatedAt?: string | null;
}

/**
 * A comment in a project's discussion. Like a task comment, plus: it can answer
 * another comment (`parentId`, one level deep) and it says what the caller may do.
 */
export interface GroupCommentDto {
  id: string;
  content: string;
  groupId: string;
  /** The comment this one answers; null for a comment of its own. */
  parentId?: string | null;
  authorId: string;
  authorName?: string | null;
  authorProfilePictureUrl?: string | null;
  createdAt: string;
  updatedAt?: string | null;
  isEdited?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  /** The id this app gave the comment before it was saved; only on the answer to a post and on the live event. */
  clientId?: string | null;
}

/** A page of a discussion: comments oldest first, each followed by its replies. */
export interface GroupCommentPage {
  comments: GroupCommentDto[];
  /** There are older comments: ask again with `before` = the first comment of this page. */
  hasMore: boolean;
  /** Comments and replies in the whole discussion. */
  total: number;
}

/**
 * Someone the current user may @mention on a given task.
 *
 * `hasAccess` is the interesting field: when it is false the person is a friend
 * who cannot see the task yet, and mentioning them will grant them access — so
 * the composer has to say so before the comment is posted, not after.
 */
export interface MentionableUserDto {
  userId: string;
  fullName: string;
  email: string;
  profilePictureUrl?: string | null;
  /** "Task owner" | "Assignee" | "Project owner" | "Project member" | "Friend" */
  relationship: string;
  hasAccess: boolean;
}

/** Values the API's NotificationType enum serialises to. */
export type NotificationTypeName =
  | 'TaskAssigned' | 'TaskCompleted' | 'TaskDueSoon' | 'GroupInvite'
  | 'MentionedInTask' | 'FriendRequestSent' | 'FriendRequestAccepted' | 'UserBlocked';

/** `entityType` arrives as the numeric enum value or its name, depending on serializer config. */
/**
 * Note the API does NOT send the name of the thing you were mentioned in — only
 * `entityType` + `entityId`. `entityName` is resolved client-side by looking the
 * id up against the tasks and projects already loaded.
 */
export interface MentionDto {
  id: string; isRead: boolean; entityType?: number | string; entityId?: string; createdAt: string;
  mentionedByUserId?: string;
  mentionedByUserName?: string;
  mentionedByUserProfilePictureUrl?: string | null;
  mentionedUserId?: string;
  /** Filled in locally; never present on the wire. */
  entityName?: string;
}

export interface ParseMentionsRequest { text: string; }
export interface CreateMentionsRequest { mentionedUserIds: string[]; entityType: number; entityId: string; }

/**
 * The API returns the counterpart's name and picture as flat fields, not as
 * nested `sender`/`receiver` objects. The nested ones are kept optional because
 * some responses have carried them, but nothing should rely on them.
 */
export interface FriendshipDto {
  id: string; senderId: string; receiverId: string; status: string; createdAt: string;
  updatedAt?: string | null;
  senderName?: string; senderProfilePictureUrl?: string | null;
  receiverName?: string; receiverProfilePictureUrl?: string | null;
  sender?: UserDto; receiver?: UserDto; friendUser?: UserDto;
  /**
   * The other person, whichever side they are on. Sent by current API builds so
   * the client does not have to work out which of sender / receiver is "them".
   */
  friendId?: string; friendName?: string; friendEmail?: string;
  friendProfilePictureUrl?: string | null;
  /** True when the signed-in user sent the request. */
  sentByMe?: boolean;
}

/** A person as listed inside another user's profile (mutual friends). */
export interface ProfilePersonDto {
  id: string; fullName: string; email?: string; profilePictureUrl?: string | null; country?: string | null;
}

/** GET /api/User/{id}/profile: a user plus how they relate to the signed-in user. */
export interface UserProfileDto {
  user: UserDto;
  isMe: boolean;
  friendship?: FriendshipStatusDto;
  friendsCount: number;
  mutualFriendsCount: number;
  mutualFriends: ProfilePersonDto[];
  /** Projects both people are on. Missing on an API build from before it was added. */
  sharedProjects?: SharedProjectDto[];
}

export interface SharedProjectDto {
  id: string;
  name: string;
  color?: string | null;
  taskCount: number;
}

export interface FriendshipStatusDto { status: string; id: string | null; }

// ── Calendar: events, calendars, the feed ────────────────────────────────────

/** What a calendar item is. Also the first URL segment of its reminders and attachments. */
export type CalendarItemKind = 'Task' | 'Event';
export type RecurrencePattern = 'None' | 'Daily' | 'Weekly' | 'Monthly' | 'Yearly';
export type AttendeeStatus = 'Pending' | 'Accepted' | 'Tentative' | 'Declined';
export type DayOfWeekName = 'Sunday' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday';
export type CalendarViewName = 'Month' | 'Week' | 'Day' | 'Agenda';

export interface AttendeeDto {
  userId: string; fullName?: string | null; profilePictureUrl?: string | null;
  status: AttendeeStatus; respondedAt?: string | null;
}

export interface EventDto {
  id: string; title: string; description?: string | null; location?: string | null;
  startsAt: string; endsAt: string; isAllDay: boolean;
  recurrence: RecurrencePattern; recurrenceInterval: number; recurrenceEndDate?: string | null;
  calendarId: string; calendarName?: string | null; color?: string | null;
  groupId?: string | null; groupName?: string | null;
  ownerId: string; ownerName?: string | null; ownerProfilePictureUrl?: string | null;
  /** True when the signed-in user created the event and may change it. */
  isOwner: boolean;
  /** The signed-in user's answer when they are invited; null for their own events. */
  myResponse?: AttendeeStatus | null;
  attendees: AttendeeDto[];
  createdAt: string; updatedAt?: string | null;
}

/** POST / PUT /api/Event. PUT replaces the whole event. */
export interface SaveEventDto {
  title: string; description?: string | null; location?: string | null;
  startsAt: string; endsAt: string; isAllDay: boolean;
  recurrence: RecurrencePattern; recurrenceInterval: number; recurrenceEndDate?: string | null;
  /** Left out: the user's default calendar. */
  calendarId?: string | null;
  groupId?: string | null;
  /** Create only. */
  attendeeIds?: string[];
  /** Create only. Left out, the default reminder from the calendar settings is added. */
  reminderMinutes?: number[];
}

/** Changes or skips one date of a repeating event. */
export interface SaveOccurrenceDto {
  /** Which date: the `occurrenceStart` the feed gave it. */
  occurrenceStart: string;
  cancelled: boolean;
  startsAt?: string | null; endsAt?: string | null; title?: string | null; location?: string | null;
}

export interface UserCalendarDto {
  id: string; name: string; color: string;
  /** New events go here when no calendar is chosen. It cannot be deleted. */
  isDefault: boolean;
  /** Hidden calendars are left out of the feed. */
  isVisible: boolean;
  eventCount: number; createdAt: string; updatedAt?: string | null;
}

export interface SaveCalendarDto { name?: string; color?: string; isVisible?: boolean; }

/** GET / PUT /api/Calendar/settings. PUT replaces all of them. */
export interface CalendarSettingsDto {
  weekStartsOn: DayOfWeekName; defaultView: CalendarViewName; use24HourClock: boolean;
  /** "HH:mm" on the user's own clock. */
  workDayStart: string; workDayEnd: string; workDays: DayOfWeekName[];
  defaultEventMinutes: number;
  /** null for "no reminder". */
  defaultReminderMinutes: number | null;
  /** Read-only here: it is part of the profile. */
  timeZone?: string | null;
}

/** One thing on the calendar on one date (GET /api/Calendar/feed). */
export interface CalendarItemDto {
  kind: CalendarItemKind;
  /** Id of the event or task. A repeating item has the same id on every date. */
  id: string;
  title: string; start: string; end: string; isAllDay: boolean; location?: string | null;
  isRecurring: boolean;
  /** For a repeating item: when the series placed this date. */
  occurrenceStart?: string | null;
  color?: string | null; calendarId?: string | null; calendarName?: string | null;
  groupId?: string | null; groupName?: string | null;
  // Events only
  isOwner: boolean; myResponse?: AttendeeStatus | null; attendeeCount: number;
  // Tasks only
  status?: string | null; priority?: string | null; isOverdue: boolean;
}

export interface ImportResultDto { calendarId: string; imported: number; updated: number; skipped: number; }

// ── Import from Google Calendar (read in the browser; not Miqat API payloads) ─

/** One calendar of the user's Google account, as the import's chooser lists it. */
export interface GoogleCalendar {
  id: string; name: string;
  /** Google's own colour for it, as hex; '' when it has none. */
  color: string;
  /** The account's main calendar. */
  primary: boolean;
}

/** Events are read between these two moments; null leaves that side open. */
export interface GoogleImportPeriod { from: Date | null; to: Date | null; }

/** What the import is doing right now, for one Google calendar. */
export interface GoogleImportProgress {
  calendarId: string;
  step: 'reading' | 'saving' | 'done';
  /** Events read from Google so far, events being saved, or events saved. */
  events: number;
  /** With 'done': what importing this calendar did. */
  result?: GoogleCalendarImportResult;
}

/** What importing one Google calendar did. */
export interface GoogleCalendarImportResult {
  id: string; name: string;
  /** The Miqat calendar colour it was given. */
  color: string;
  added: number; updated: number;
  /** Cancelled in Google, or not readable. */
  skipped: number;
  /** Titles of repeating events whose rule Miqat keeps more simply than Google. */
  simplified: string[];
  /** Titles of events brought in as one series per weekday. */
  split: string[];
  /** Why this calendar (or the rest of it) was not imported; null when it was. */
  error: string | null;
}

/** Kept in this browser: when the user last imported from Google. */
export interface GoogleLastImport {
  at: string; calendars: number; events: number;
  /** Google calendar id → the Miqat calendar it went into, so a renamed one is found again. */
  targets?: Record<string, string>;
}

// ── Reminders, attachments (tasks and events) ────────────────────────────────

export interface ReminderDto {
  id: string; itemKind: CalendarItemKind; itemId: string; itemTitle?: string | null;
  minutesBefore: number;
  /** When it fires next; null when nothing is ahead. */
  remindAt?: string | null;
  lastSentAt?: string | null;
}

export interface AttachmentDto {
  id: string; itemKind: CalendarItemKind; itemId: string;
  fileName: string; contentType: string; sizeBytes: number;
  uploadedByUserId: string; uploadedByName?: string | null; createdAt: string;
  /** Relative address; it needs the usual Authorization header, so it is not a plain link. */
  downloadUrl: string;
}

// ── Subtasks and dependencies ────────────────────────────────────────────────

export interface SubtaskDto {
  id: string; taskId: string; title: string; isDone: boolean; position: number;
  completedAt?: string | null; createdAt: string;
}

export interface SaveSubtaskDto { title?: string; isDone?: boolean; position?: number; }

/** A task as it appears in a list of links: enough to show and to open it. */
export interface TaskLinkDto { id: string; title: string; status: string; dueDate?: string | null; isDone: boolean; }

export interface TaskDependenciesDto {
  /** Tasks that have to be finished before this one. */
  blockedBy: TaskLinkDto[];
  /** Tasks that wait for this one. */
  blocks: TaskLinkDto[];
  isBlocked: boolean;
}

// ── Scheduling ───────────────────────────────────────────────────────────────

/** A stretch of time, in UTC. */
export interface TimeSlotDto { start: string; end: string; }

/** When one person is busy. Only the times are shared, never what the events are. */
export interface UserAvailabilityDto { userId: string; fullName?: string | null; timeZone: string; busy: TimeSlotDto[]; }

export interface SuggestTimesDto {
  attendeeIds: string[]; durationMinutes: number;
  from?: string | null; to?: string | null;
  maxResults?: number; workingHoursOnly?: boolean;
}

// ── Devices (Web Push) ───────────────────────────────────────────────────────

export interface DeviceDto { id: string; name: string; lastSeenAt: string; createdAt: string; }
export interface RegisterDeviceDto { endpoint: string; p256dh: string; auth: string; name?: string; }
/** `isConfigured` is false when the server has no push keys. */
export interface PushKeyDto { isConfigured: boolean; publicKey?: string | null; }

// ── Search, overview, blocked people ─────────────────────────────────────────

export interface SearchEventDto {
  id: string; title: string; location?: string | null; startsAt: string; endsAt: string;
  isAllDay: boolean; isRecurring: boolean; isOwner: boolean;
}

export interface SearchProjectDto { id: string; name: string; description?: string | null; color?: string | null; ownerId: string; }

/** GET /api/Search?query= : one list per kind of thing. `events` is absent on older builds. */
export interface SearchResultsDto {
  query: string; tasks: TaskDto[]; projects: SearchProjectDto[]; users: UserDto[]; events?: SearchEventDto[];
}

/** GET /api/User/me/summary. */
export interface UserSummaryDto {
  tasks: {
    total: number; pending: number; inProgress: number; onHold: number; completed: number; cancelled: number;
    overdue: number; dueToday: number; dueThisWeek: number; completedThisWeek: number; assignedToMe: number;
  };
  projects: number; friends: number; pendingFriendRequests: number;
  unreadNotifications: number; unreadMentions: number; boards: number; timeZone?: string | null;
}
