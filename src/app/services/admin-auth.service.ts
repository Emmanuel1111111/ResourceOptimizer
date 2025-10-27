import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable, throwError, of } from 'rxjs';
import { catchError, tap, map, switchMap } from 'rxjs/operators';
import { Router } from '@angular/router';
import { AdminUser, LoginRequest, LoginResponse, AdminPermission, AdminActivityLog } from '../interfaces/admin.interface';
import { SecurityService } from './security.service';
import { environment } from '../../environments/environment';
import{ timeout} from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class AdminAuthService {
  private currentUserSubject = new BehaviorSubject<AdminUser | null>(null);
  private isAuthenticatedSubject = new BehaviorSubject<boolean>(false);
  private permissionsSubject = new BehaviorSubject<AdminPermission[]>([]);
  
  public currentUser$ = this.currentUserSubject.asObservable();
  public isAuthenticated$ = this.isAuthenticatedSubject.asObservable();
  public permissions$ = this.permissionsSubject.asObservable();

  private readonly apiUrl = 'https://resourceoptimizer.onrender.com'; 

  constructor(
    private http: HttpClient,
    private router: Router,
    private securityService: SecurityService
  ) {
    this.initializeAuth();
  }

  /**
   * Initialize authentication state from stored tokens
   */
  private initializeAuth(): void {
    const token = this.securityService.getSecureToken();
    const userStr = sessionStorage.getItem('admin_user');
    
    if (token && !this.securityService.isTokenExpired() && userStr) {
      try {
        const user = JSON.parse(userStr) as AdminUser;
        this.setCurrentUser(user);
        this.validateTokenWithServer().subscribe({
          error: () => this.logout()
        });
      } catch {
        this.logout();
      }
    }
  }

  /**
   * Admin Login with Enhanced Security
   */
  loginAdmin(loginRequest: LoginRequest): Observable<LoginResponse> {
    // Check rate limiting
    if (!this.securityService.checkRateLimit(loginRequest.username)) {
      return throwError(() => new Error('Account temporarily locked due to too many failed attempts. Please try again later.'));
    }

    // Validate admin username format
    if (!this.isValidAdminUsername(loginRequest.username)) {
      return throwError(() => new Error('Invalid admin username format. Admin usernames must start with "admin."'));
    }

    // Simplified request without security context for now
    return this.http.post<LoginResponse>(`${this.apiUrl}/admin/login`, loginRequest).pipe(
      timeout(10000), // 10 seconds timeout
      tap(response => {
      
        this.handleSuccessfulLogin(response);
        this.logActivity('admin_login', 'authentication', { success: true });
      }),
      catchError(error => {
       
        this.logActivity('admin_login_failed', 'authentication', { 
          success: false, 
          error: error.message,
          username: loginRequest.username 
        });
        return throwError(() => error);
      })
    );
  }

  /**
   * Multi-Factor Authentication Login
   */
  loginWithMFA(username: string, password: string, mfaCode: string, rememberDevice = false): Observable<LoginResponse> {
    const loginRequest: LoginRequest = {
      username,
      password,
      mfaCode,
      rememberDevice
    };

    return this.loginAdmin(loginRequest);
  }

  /**
   * Handle successful login response
   */
  private handleSuccessfulLogin(response: LoginResponse): void {
    console.log('🔍 AdminAuthService handleSuccessfulLogin called with:', response);
    
    // Store tokens securely
    this.securityService.storeSecureToken(
      response.token,
      response.refreshToken,
      response.expiresIn
    );

    // Store user data
    sessionStorage.setItem('admin_user', JSON.stringify(response.user));
    console.log('🔍 User data stored in sessionStorage');
    
    // Update subjects
    this.setCurrentUser(response.user);
    this.permissionsSubject.next(response.permissions);
    console.log('🔍 Subjects updated, user authenticated');
  }

  /**
   * Set current user and authentication state
   */
  private setCurrentUser(user: AdminUser | null): void {
    this.currentUserSubject.next(user);
    this.isAuthenticatedSubject.next(!!user);
  }

  /**
   * Logout
   */
  logout(): Observable<any> {
    const token = this.securityService.getSecureToken();
    
    return this.http.post(`${this.apiUrl}/admin/logout`, { token }).pipe(
      timeout(10000), // 10 seconds timeout
      tap(() => {
        this.logActivity('admin_logout', 'authentication', { success: true });
      }),
      catchError(() => of(null)), // Ignore logout errors
      tap(() => {
        this.cleanupSession();
        this.router.navigate(['/admin/login']);
      })
    );
  }

  /**
   * Clean up session data
   */
  private cleanupSession(): void {
    this.securityService.clearTokens();
    sessionStorage.removeItem('admin_user');
    this.setCurrentUser(null);
    this.permissionsSubject.next([]);
  }

  /**
   * Validate token with server
   */
  private validateTokenWithServer(): Observable<AdminUser> {
    const token = this.securityService.getSecureToken();
    if (!token) {
      return throwError(() => new Error('No token available'));
    }

    const headers = new HttpHeaders().set('Authorization', `Bearer ${token}`);
    
    return this.http.get<AdminUser>(`${this.apiUrl}/admin/validate`, { headers }).pipe(
      timeout(10000), // 10 seconds timeout
      tap(user => this.setCurrentUser(user)),
      catchError(() => {
        this.cleanupSession();
        return throwError(() => new Error('Token validation failed'));
      })
    );
  }

  /**
   * Role and Permission Checking
   */
  hasRole(role: string): boolean {
    const user = this.currentUserSubject.value;
    return user?.role === role;
  }

  hasPermission(resource: string, action: string): boolean {
    const user = this.currentUserSubject.value;
    if (!user) return false;

    // Super admin has all permissions
    if (user.role === 'super_admin') {
      return true;
    }

    const permissions = this.permissionsSubject.value;
    return permissions.some(permission => 
      permission.resource === resource && 
      permission.actions.includes(action)
    );
  }
  

  hasAnyRole(roles: string[]): boolean {
    const user = this.currentUserSubject.value;
    return user ? roles.includes(user.role) : false;
  }

  isAdmin(): boolean {
    return this.hasAnyRole(['admin', 'super_admin']);
  }

  isSuperAdmin(): boolean {
    return this.hasRole('super_admin');
  }

  /**
   * Admin-specific validations
   */
  private isValidAdminUsername(username: string): boolean {
   
    return /^admin\.[a-zA-Z0-9._-]+$/.test(username);
  }

  
  private logActivity(action: string, resource: string, details: any): void {
    const user = this.currentUserSubject.value;
    if (!user) return;

    const logEntry: Partial<AdminActivityLog> = {
      adminId: user.id,
      action,
      resource,
      details,
      timestamp: new Date(),
      success: details.success !== false
    };

   
    this.http.post(`${this.apiUrl}/admin/activity-log`, logEntry).subscribe({
      error: () => {} 
    });
  }

  /**
   * Password Management
   */
  changePassword(currentPassword: string, newPassword: string, mfaCode?: string): Observable<any> {
    const user = this.currentUserSubject.value;
    if (!user) {
      return throwError(() => new Error('Not authenticated'));
    }

    const validation = this.securityService.validateStrongPassword(newPassword);
    if (!validation.isValid) {
      return throwError(() => new Error(`Password validation failed: ${validation.errors.join(', ')}`));
    }

    return this.http.post(`${this.apiUrl}/admin/change-password`, {
      currentPassword,
      newPassword,
      mfaCode
    }).pipe(
      timeout(10000), // 10 seconds timeout
      tap(() => {
        this.logActivity('password_changed', 'security', { success: true });
      }),
      catchError(error => {
        this.logActivity('password_change_failed', 'security', { 
          success: false, 
          error: error.message 
        });
        return throwError(() => error);
      })
    );
  }

  /**
   * Account Recovery
   */
  requestPasswordReset(username: string): Observable<any> {
    if (!this.isValidAdminUsername(username)) {
      return throwError(() => new Error('Invalid admin username format'));
    }

    return this.http.post(`${this.apiUrl}/admin/password-reset/request`, { username }).pipe(
      tap(() => {
        this.logActivity('password_reset_requested', 'security', { 
          success: true, 
          username 
        });
      })
    );
  }

  resetPassword(token: string, newPassword: string): Observable<any> {
    const validation = this.securityService.validateStrongPassword(newPassword);
    if (!validation.isValid) {
      return throwError(() => new Error(`Password validation failed: ${validation.errors.join(', ')}`));
    }

    return this.http.post(`${this.apiUrl}/admin/password-reset/confirm`, {
      token,
      newPassword
    });
  }

  /**
   * Utility Methods
   */
  getCurrentUser(): AdminUser | null {
    return this.currentUserSubject.value;
  }

  getCurrentUserId(): string | null {
    return this.currentUserSubject.value?.id || null;
  }

  isAuthenticated(): boolean {
    return this.isAuthenticatedSubject.value && !this.securityService.isTokenExpired();
  }

  getAuthToken(): string | null {
    return this.securityService.getSecureToken();
  }

  /**
   * Session Management
   */
  extendSession(): Observable<any> {
    return this.securityService.refreshToken().pipe(
      tap((response: any) => {
        this.securityService.storeSecureToken(
          response.token,
          response.refreshToken,
          response.expiresIn
        );
      })
    );
  }

  terminateAllOtherSessions(): Observable<any> {
    return this.securityService.terminateAllSessions().pipe(
      tap(() => {
        this.logActivity('sessions_terminated', 'security', { success: true });
      })
    );
  }
} 