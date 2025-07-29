export interface AdminUser {
  id: string;
  username: string;
  email: string;
  role: 'admin' | 'super_admin' | 'viewer' | 'resource_manager';
  permissions: AdminPermission[];
  lastLogin: Date;
  mfaEnabled: boolean;
  department?: string;
  firstName?: string;
  lastName?: string;
  avatar?: string;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
  loginAttempts: number;
  lockedUntil?: Date;
}

export interface AdminPermission {
  resource: string;
  actions: string[];
  conditions?: Record<string, any>;
}

export interface LoginRequest {
  username: string;
  password: string;
  mfaCode?: string;
  rememberDevice?: boolean;
  deviceFingerprint?: string;
}

export interface LoginResponse {
  user: AdminUser;
  token: string;
  refreshToken: string;
  expiresIn: number;
  permissions: AdminPermission[];
  requiresMFA: boolean;
  mfaQrCode?: string;
}

export interface SecurityContext {
  ipAddress: string;
  userAgent: string;
  deviceFingerprint: string;
  location?: {
    country: string;
    city: string;
  };
}

export interface AdminActivityLog {
  id: string;
  adminId: string;
  action: string;
  resource: string;
  details: Record<string, any>;
  timestamp: Date;
  ipAddress: string;
  userAgent: string;
  success: boolean;
  errorMessage?: string;
}

export interface SessionInfo {
  id: string;
  adminId: string;
  token: string;
  createdAt: Date;
  lastActivity: Date;
  expiresAt: Date;
  ipAddress: string;
  userAgent: string;
  deviceInfo: string;
  isActive: boolean;
}

export interface RateLimitInfo {
  attempts: number;
  lastAttempt: Date;
  isBlocked: boolean;
  blockedUntil?: Date;
} 