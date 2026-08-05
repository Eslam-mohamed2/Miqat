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
}

export interface UpdateProfileDto {
  fullName: string; phoneNumber: string | null; country: string | null;
  timeZone: string | null; gender: string | null; dateOfBirth: string | null;
}

export interface TaskDto {
  id: string; title: string; description: string; status: string; priority: string; dueDate: string;
  tags: string; recurrence: string; recurrenceEndDate: string; userId: string; ownerName: string;
  assignedToUserId: string; assignedToUserName: string; groupId: string; groupName: string; createdAt: string;
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
  /** What it points at, so the row can navigate somewhere useful. */
  linkedEntityId?: string | null;
  /** "Group" | "TaskItem" | "Friendship" */
  linkedEntityType?: string | null;
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
}

export interface FriendshipStatusDto { status: string; id: string | null; }
