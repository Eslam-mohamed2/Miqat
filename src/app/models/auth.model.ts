export interface LoginRequest {
    email: string;
    password: string;
}

export interface RegisterRequest {
    fullName: string;
    email: string;
    password: string;
    phoneNumber: string;
    country: string;
    timeZone: string;
}

export interface VerifyOtpRequest {
    email: string;
    purpose: string;
}

export interface ForgotPasswordRequest {
    email: string;
}

export interface ResetPasswordRequest {
    email: string;
    purpose: string;
}

export interface ChangePasswordRequest {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
}

export interface AuthResponse {
    token: string;
    refreshToken?: string;
    user?: User;
}

export interface User {
    id: string;
    fullName: string;
    email: string;
    phoneNumber?: string;
    country?: string;
    timeZone?: string;
    avatar?: string;
}