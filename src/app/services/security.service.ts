import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, timer } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { AdminUser, RateLimitInfo, SecurityContext, SessionInfo } from '../interfaces/admin.interface';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class SecurityService {
  private loginAttempts = new Map<string, RateLimitInfo>();
  private securityContextSubject = new BehaviorSubject<SecurityContext | null>(null);
  private sessionsSubject = new BehaviorSubject<SessionInfo[]>([]);
  
  public securityContext$ = this.securityContextSubject.asObservable();
  public sessions$ = this.sessionsSubject.asObservable();

  constructor(private http: HttpClient) {
    this.initializeSecurityContext();
    this.setupTokenRefreshTimer();
  }

  /**
   * Rate Limiting Implementation
   */
  checkRateLimit(username: string): boolean {
    const attempts = this.loginAttempts.get(username);
    
    if (!attempts) {
      return true;
    }

    // Check if account is currently blocked
    if (attempts.isBlocked && attempts.blockedUntil) {
      if (new Date() < attempts.blockedUntil) {
        return false;
      } else {
        // Unblock account
        this.resetRateLimit(username);
        return true;
      }
    }

    // Check attempt limits
    const maxAttempts = 5;
    const timeWindow = 15 * 60 * 1000; // 15 minutes
    const timeDiff = Date.now() - attempts.lastAttempt.getTime();

    if (attempts.attempts >= maxAttempts && timeDiff < timeWindow) {
      // Block account
      this.blockAccount(username);
      return false;
    }

    // Reset attempts if time window passed
    if (timeDiff >= timeWindow) {
      this.resetRateLimit(username);
    }

    return true;
  }

  recordLoginAttempt(username: string, success: boolean): void {
    const existing = this.loginAttempts.get(username);
    
    if (success) {
      this.resetRateLimit(username);
      return;
    }

    const attempts = existing?.attempts || 0;
    this.loginAttempts.set(username, {
      attempts: attempts + 1,
      lastAttempt: new Date(),
      isBlocked: false
    });
  }

  private blockAccount(username: string): void {
    this.loginAttempts.set(username, {
      attempts: 5,
      lastAttempt: new Date(),
      isBlocked: true,
      blockedUntil: new Date(Date.now() + 30 * 60 * 1000) // 30 minutes
    });
  }

  private resetRateLimit(username: string): void {
    this.loginAttempts.delete(username);
  }

  /**
   * Secure Token Management
   */
  storeSecureToken(token: string, refreshToken: string, expiresIn: number): void {
    const encryptedToken = this.encryptToken(token);
    const encryptedRefreshToken = this.encryptToken(refreshToken);
    
    // Use sessionStorage for security (cleared when browser closes)
    sessionStorage.setItem('admin_token', encryptedToken);
    sessionStorage.setItem('admin_refresh_token', encryptedRefreshToken);
    sessionStorage.setItem('token_expires_at', (Date.now() + expiresIn * 1000).toString());
    
    this.setupTokenRefreshTimer();
  }

  getSecureToken(): string | null {
    const encryptedToken = sessionStorage.getItem('admin_token');
    if (!encryptedToken) return null;
    
    return this.decryptToken(encryptedToken);
  }

  getRefreshToken(): string | null {
    const encryptedToken = sessionStorage.getItem('admin_refresh_token');
    if (!encryptedToken) return null;
    
    return this.decryptToken(encryptedToken);
  }

  clearTokens(): void {
    sessionStorage.removeItem('admin_token');
    sessionStorage.removeItem('admin_refresh_token');
    sessionStorage.removeItem('token_expires_at');
    sessionStorage.removeItem('admin_user');
  }

  isTokenExpired(): boolean {
    const expiresAt = sessionStorage.getItem('token_expires_at');
    if (!expiresAt) return true;
    
    return Date.now() > parseInt(expiresAt);
  }

  /**
   * Token Encryption/Decryption (Simple implementation)
   */
  private encryptToken(token: string): string {
    // In production, use proper encryption library
    return btoa(token + ':' + Date.now());
  }

  private decryptToken(encryptedToken: string): string {
    try {
      const decoded = atob(encryptedToken);
      return decoded.split(':')[0];
    } catch {
      return '';
    }
  }

  /**
   * Security Context
   */
  private initializeSecurityContext(): void {
    const context: SecurityContext = {
      ipAddress: this.getClientIP(),
      userAgent: navigator.userAgent,
      deviceFingerprint: this.generateDeviceFingerprint()
    };
    
    this.securityContextSubject.next(context);
  }

  private getClientIP(): string {
    // In production, get from server
    return 'unknown';
  }

  private generateDeviceFingerprint(): string {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillText('Device fingerprint', 2, 2);
    }
    
    const fingerprint = [
      navigator.userAgent,
      navigator.language,
      screen.width + 'x' + screen.height,
      new Date().getTimezoneOffset(),
      canvas.toDataURL()
    ].join('|');
    
    return btoa(fingerprint).slice(0, 32);
  }

  /**
   * Token Refresh Timer
   */
  private setupTokenRefreshTimer(): void {
    const expiresAt = sessionStorage.getItem('token_expires_at');
    if (!expiresAt) return;
    
    const expirationTime = parseInt(expiresAt);
    const refreshTime = expirationTime - (5 * 60 * 1000); // Refresh 5 minutes before expiry
    const timeUntilRefresh = refreshTime - Date.now();
    
    if (timeUntilRefresh > 0) {
      timer(timeUntilRefresh).subscribe(() => {
        this.refreshToken();
      });
    }
  }

  refreshToken(): Observable<any> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }
    
    return this.http.post('/api/admin/refresh-token', { refreshToken });
  }

  /**
   * Session Management
   */
  getActiveSessions(): Observable<SessionInfo[]> {
    return this.http.get<SessionInfo[]>('/api/admin/sessions');
  }

  terminateSession(sessionId: string): Observable<any> {
    return this.http.delete(`/api/admin/sessions/${sessionId}`);
  }

  terminateAllSessions(): Observable<any> {
    return this.http.delete('/api/admin/sessions/all');
  }

  /**
   * Multi-Factor Authentication
   */
  generateMFAQrCode(): Observable<{ qrCode: string; secret: string }> {
    return this.http.post<{ qrCode: string; secret: string }>('/api/admin/mfa/generate', {});
  }

  enableMFA(mfaCode: string, secret: string): Observable<{ backupCodes: string[] }> {
    return this.http.post<{ backupCodes: string[] }>('/api/admin/mfa/enable', {
      mfaCode,
      secret
    });
  }

  verifyMFA(mfaCode: string): Observable<boolean> {
    return this.http.post<boolean>('/api/admin/mfa/verify', { mfaCode });
  }

  disableMFA(password: string, mfaCode: string): Observable<any> {
    return this.http.post('/api/admin/mfa/disable', { password, mfaCode });
  }

  /**
   * Security Utilities
   */
  validateStrongPassword(password: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (password.length < 12) {
      errors.push('Password must be at least 12 characters long');
    }
    
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }
    
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }
    
    if (!/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    }
    
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
} 