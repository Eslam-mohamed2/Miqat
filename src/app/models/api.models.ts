export interface LoginRequest { email: string; password?: string; }
export interface RegisterRequest { fullName: string; email: string; password?: string; phoneNumber: string; country: string; timeZone: string; }
export interface RefreshTokenRequest { refreshToken: string; }
export interface VerifyOtpDto { email: string; code: string; purpose: string; }
export interface ForgotPasswordDto { email: string; }
export interface ResetPasswordDto { email: string; token: string; newPassword: string; confirmPassword: string; }
export interface ChangePasswordDto { currentPassword: string; newPassword: string; confirmPassword: string; }
export interface ResendOtpDto { email: string; purpose: string; }
export interface GoogleLoginDto { token: string; }

export interface UserDto {
  id: string; fullName: string; email: string; phoneNumber: string; profilePictureUrl: string;
  dateOfBirth: string; gender: string; country: string; timeZone: string; role: string;
  isActive: boolean; isVerified: boolean; createdAt: string;
}

export interface UpdateProfileDto {
  fullName: string; phoneNumber: string; country: string;
  timeZone: string; gender: string; dateOfBirth: string;
}

export interface TaskDto {
  id: string; title: string; description: string; status: string; priority: string; dueDate: string;
  tags: string; recurrence: string; recurrenceEndDate: string; userId: string; ownerName: string;
  assignedToUserId: string; assignedToUserName: string; groupId: string; groupName: string; createdAt: string;
}

export interface GroupDto {
  id: string; name: string; description: string; color: string; ownerId: string; ownerName: string;
  memberCount: number; taskCount: number; createdAt: string;
}

export interface NotificationDto {
  id: string; isRead: boolean; createdAt: string; type?: string; title?: string; message?: string;
}

export interface MentionDto {
  id: string; isRead: boolean; entityType: number; entityId: string; createdAt: string;
  mentionedByUserName?: string; entityName?: string;
}

export interface ParseMentionsRequest { text: string; }
export interface CreateMentionsRequest { mentionedUserIds: string[]; entityType: number; entityId: string; }

export interface FriendshipDto { 
  id: string; senderId: string; receiverId: string; status: string; createdAt: string;
  sender: UserDto; receiver: UserDto; friendUser: UserDto;
}
