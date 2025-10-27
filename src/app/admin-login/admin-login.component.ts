import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject, timer } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators';
import { AdminAuthService } from '../services/admin-auth.service';
import { SecurityService } from '../services/security.service';

interface SecurityIndicator {
  type: 'success' | 'warning' | 'error';
  message: string;
  icon: string;
}

@Component({
  selector: 'app-admin-login',
  templateUrl: './admin-login.component.html',
  styleUrls: ['./admin-login.component.css']
})
export class AdminLoginComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  
  adminLoginForm!: FormGroup;
  mfaForm!: FormGroup;
  
  // UI State
  isLoading = false;
  showMFAStep = false;
  hidePassword = true;
  
  // Messages
  errorMessage = '';
  successMessage = '';
  securityIndicators: SecurityIndicator[] = [];
  
  // Rate limiting
  remainingAttempts = 5;
  isBlocked = false;
  blockTimeRemaining = 0;
  
  // MFA
  mfaEnabled = false;
  qrCodeUrl = '';
  backupCodes: string[] = [];
  
  // Security info
  lastLoginInfo = '';
  suspiciousActivity = false;

  constructor(
    private fb: FormBuilder,
    private adminAuth: AdminAuthService,
    private security: SecurityService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.initializeForms();
    this.checkSecurityStatus();
    this.loadLastLoginInfo();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initializeForms(): void {
    this.adminLoginForm = this.fb.group({
      username: ['', [
        Validators.required,
        this.adminUsernameValidator
      ]],
      password: ['', [
        Validators.required,
        Validators.minLength(12),
        this.strongPasswordValidator
      ]],
      rememberDevice: [false]
    });

    this.mfaForm = this.fb.group({
      mfaCode: ['', [
        Validators.required,
        Validators.pattern(/^\d{6}$/)
      ]]
    });

    // Real-time validation feedback
    this.adminLoginForm.get('username')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.updateSecurityIndicators());
      
    this.adminLoginForm.get('password')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.updateSecurityIndicators());
  }

  /**
   * Custom Validators
   */
  private adminUsernameValidator(control: AbstractControl): ValidationErrors | null {
    const value = control.value;
    if (!value) return null;

    // Admin usernames must start with "admin."
    if (!value.startsWith('admin.')) {
      return { invalidAdminFormat: true };
    }

    // Check for valid characters
    if (!/^admin\.[a-zA-Z0-9._-]+$/.test(value)) {
      return { invalidCharacters: true };
    }

    return null;
  }

  private strongPasswordValidator(control: AbstractControl): ValidationErrors | null {
    const value = control.value;
    if (!value) return null;

    const validation = this.security.validateStrongPassword(value);
    return validation.isValid ? null : { weakPassword: validation.errors };
  }

  /**
   * Security Status Checking
   */
  private checkSecurityStatus(): void {
    // Check if coming from a failed login attempt
    const failedAttempt = this.route.snapshot.queryParams['failed'];
    if (failedAttempt) {
      this.errorMessage = 'Previous login attempt failed. Please try again.';
    }

    // Check for suspicious activity
    this.detectSuspiciousActivity();
  }

  private detectSuspiciousActivity(): void {
    // Simple suspicious activity detection
    const lastFailedAttempts = localStorage.getItem('admin_failed_attempts');
    if (lastFailedAttempts) {
      const attempts = JSON.parse(lastFailedAttempts);
      if (attempts.length > 3) {
        this.suspiciousActivity = true;
        this.securityIndicators.push({
          type: 'warning',
          message: 'Multiple recent failed login attempts detected',
          icon: 'warning'
        });
      }
    }
  }

  private loadLastLoginInfo(): void {
    const lastLogin = localStorage.getItem('admin_last_login');
    if (lastLogin) {
      const loginData = JSON.parse(lastLogin);
      this.lastLoginInfo = `Last login: ${new Date(loginData.timestamp).toLocaleString()}`;
    }
  }

  private updateSecurityIndicators(): void {
    this.securityIndicators = [];
    
    const username = this.adminLoginForm.get('username')?.value;
    const password = this.adminLoginForm.get('password')?.value;

    // Username validation feedback
    if (username) {
      if (!username.startsWith('admin.')) {
        this.securityIndicators.push({
          type: 'error',
          message: 'Admin usernames must start with "admin."',
          icon: 'error'
        });
      } else {
        this.securityIndicators.push({
          type: 'success',
          message: 'Valid admin username format',
          icon: 'check_circle'
        });
      }
    }

    // Password strength feedback
    if (password) {
      const validation = this.security.validateStrongPassword(password);
      if (!validation.isValid) {
        this.securityIndicators.push({
          type: 'warning',
          message: `Password requirements: ${validation.errors.join(', ')}`,
          icon: 'info'
        });
      } else {
        this.securityIndicators.push({
          type: 'success',
          message: 'Strong password',
          icon: 'security'
        });
      }
    }
  }

  /**
   * Login Process
   */
  onLogin(): void {
  if (this.adminLoginForm.invalid) {
    this.markFormGroupTouched(this.adminLoginForm);
    return;
  }

  this.isLoading = true;
  this.clearMessages();

  const { username, password, rememberDevice } = this.adminLoginForm.value;

  this.adminAuth.loginAdmin({ username, password, rememberDevice }).subscribe({
    next: (response) => {
      console.log('Login success:', response);
      if (response?.requiresMFA) {
     
        this.showMFAStep = true;
        this.mfaEnabled = true;
        if (response.mfaQrCode) this.qrCodeUrl = response.mfaQrCode;
      } else {
      
        this.handleSuccessfulLogin();
      }
    },
    error: (error) => {
      console.log('LOGIN ERROR:', error);
      this.handleLoginError(error);
      this.isLoading = false;
    },
    complete: () => {
      this.isLoading = false;
    }
  });
}

  /**
   * MFA Verification
   */
  async onMFAVerify(): Promise<void> {
    if (this.mfaForm.invalid) {
      this.markFormGroupTouched(this.mfaForm);
      return;
    }

    this.isLoading = true;
    const { username, password, rememberDevice } = this.adminLoginForm.value;
    const { mfaCode } = this.mfaForm.value;

    try {
      await this.adminAuth.loginWithMFA(username, password, mfaCode, rememberDevice).toPromise();
      this.handleSuccessfulLogin();
    } catch (error: any) {
      this.handleLoginError(error);
    } finally {
      this.isLoading = false;
    }
  }

  private handleSuccessfulLogin(): void {
    console.log('🔍 handleSuccessfulLogin called');
    
    // Store successful login info
    localStorage.setItem('admin_last_login', JSON.stringify({
      timestamp: new Date().toISOString(),
      username: this.adminLoginForm.get('username')?.value
    }));

    // Clear failed attempts
    localStorage.removeItem('admin_failed_attempts');

    this.successMessage = 'Login successful! Redirecting to admin dashboard...';
    console.log('🔍 Success message set, starting timer...');
    
    timer(1500).subscribe(() => {
      console.log('🔍 Timer completed, navigating...');
      const returnUrl = this.route.snapshot.queryParams['returnUrl'] || '/admin/dashboard';
      console.log('🔍 Navigating to:', returnUrl);
      this.router.navigate([returnUrl]);
    });
  }

  private handleLoginError(error: any): void {
    // Record failed attempt
    const failedAttempts = JSON.parse(localStorage.getItem('admin_failed_attempts') || '[]');
    failedAttempts.push({
      timestamp: new Date().toISOString(),
      username: this.adminLoginForm.get('username')?.value
    });
    localStorage.setItem('admin_failed_attempts', JSON.stringify(failedAttempts.slice(-10))); // Keep last 10

    if (error.message.includes('locked') || error.message.includes('blocked')) {
      this.isBlocked = true;
      this.startBlockTimer();
    }

    this.errorMessage = error.message || 'Login failed. Please check your credentials.';
    this.showMFAStep = false;
  }

  private startBlockTimer(): void {
    this.blockTimeRemaining = 300; // 5 minutes
    const timer$ = timer(0, 1000).pipe(takeUntil(this.destroy$));
    
    timer$.subscribe(() => {
      this.blockTimeRemaining--;
      if (this.blockTimeRemaining <= 0) {
        this.isBlocked = false;
      }
    });
  }

  /**
   * Utility Methods
   */
  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      control?.markAsTouched();
    });
  }

  private clearMessages(): void {
    this.errorMessage = '';
    this.successMessage = '';
  }

  /**
   * UI Helpers
   */
  getErrorMessage(controlName: string, formGroup: FormGroup = this.adminLoginForm): string {
    const control = formGroup.get(controlName);
    if (!control?.errors || !control.touched) return '';

    const errors = control.errors;

    if (errors['required']) return `${controlName} is required`;
    if (errors['minlength']) return `${controlName} must be at least ${errors['minlength'].requiredLength} characters`;
    if (errors['invalidAdminFormat']) return 'Admin username must start with "admin."';
    if (errors['invalidCharacters']) return 'Username contains invalid characters';
    if (errors['pattern']) return 'Invalid format';
    if (errors['weakPassword']) return `Password must meet all security requirements`;

    return 'Invalid input';
  }

  formatBlockTime(): string {
    const minutes = Math.floor(this.blockTimeRemaining / 60);
    const seconds = this.blockTimeRemaining % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  /**
   * Password Recovery
   */
  onForgotPassword(): void {
    const username = this.adminLoginForm.get('username')?.value;
    if (!username) {
      this.errorMessage = 'Please enter your admin username first';
      return;
    }

    this.isLoading = true;
    this.adminAuth.requestPasswordReset(username)
      .pipe(finalize(() => this.isLoading = false))
      .subscribe({
        next: () => {
          this.successMessage = 'Password reset instructions sent to your registered email';
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to send password reset email';
        }
      });
  }
} 