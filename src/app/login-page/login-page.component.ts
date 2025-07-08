import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { MatTabChangeEvent } from '@angular/material/tabs';
import { AuthService } from '../service.service';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { timer, Observable, tap, debounce } from 'rxjs';

@Component({
  selector: 'app-login-page',
  templateUrl: './login-page.component.html',
  styleUrls: ['./login-page.component.scss']
})
export class LoginPageComponent implements OnInit {
  Profile!: FormGroup;
  SignUpProfile!: FormGroup;
  
  isloading = false;
  hidePassword = true;
  hideSignupPassword = true;
  hideConfirmPassword = true;
  
  errorMessage = '';
  successMessage = '';

  constructor(private fb: FormBuilder, private auth:AuthService, private router:Router) {}

  ngOnInit(): void {
    this.initializeForms();
  }

  private initializeForms(): void {
    
    this.Profile = this.fb.group({
      username: ['', [Validators.required, Validators.minLength(3)]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      rememberMe: [false]
    });

    
    this.SignUpProfile = this.fb.group({
      username: ['', [
        Validators.required, 
        Validators.minLength(3),
        
      ]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [
        Validators.required, 
        Validators.minLength(8),
        this.passwordStrengthValidator
      ]],
      confirmPassword: ['', [Validators.required]],
     
    }, { validators: this.passwordMatchValidator });

    
    this.SignUpProfile.get('password')?.valueChanges.subscribe(() => {
      this.SignUpProfile.get('confirmPassword')?.updateValueAndValidity();
    });
  }

  
  private passwordStrengthValidator(control: AbstractControl): ValidationErrors | null {
    const value = control.value;
    if (!value) {
      return null;
    }

    const hasUpperCase = /[A-Z]/.test(value);
    const hasLowerCase = /[a-z]/.test(value);
    const hasNumeric = /[0-9]/.test(value);
    const hasSpecialChar = /[#?!@$%^&*-]/.test(value);

    const passwordValid = hasUpperCase && hasLowerCase && hasNumeric;

    if (!passwordValid) {
      return { pattern: true };
    }

    return null;
  }

 
  private passwordMatchValidator(group: AbstractControl): ValidationErrors | null {
    const password = group.get('password');
    const confirmPassword = group.get('confirmPassword');

    if (!password || !confirmPassword) {
      return null;
    }

    if (password.value !== confirmPassword.value) {
      confirmPassword.setErrors({ passwordMismatch: true });
      return { passwordMismatch: true };
    } else {
      
      const errors = confirmPassword.errors;
      if (errors) {
        delete errors['passwordMismatch'];
        confirmPassword.setErrors(Object.keys(errors).length ? errors : null);
      }
    }

    return null;
  }

  
  getPasswordStrengthPercentage(): number {
    const password = this.SignUpProfile.get('password')?.value || '';
    let strength = 0;

    if (password.length >= 8) strength += 25;
    if (/[a-z]/.test(password)) strength += 25;
    if (/[A-Z]/.test(password)) strength += 25;
    if (/[0-9]/.test(password)) strength += 25;
    if (/[#?!@$%^&*-]/.test(password)) strength += 25;

    return Math.min(strength, 100);
  }

  getPasswordStrengthClass(): string {
    const strength = this.getPasswordStrengthPercentage();
    if (strength < 50) return 'weak';
    if (strength < 75) return 'medium';
    return 'strong';
  }

  getPasswordStrengthText(): string {
    const strength = this.getPasswordStrengthPercentage();
    if (strength < 50) return 'Weak';
    if (strength < 75) return 'Medium';
    return 'Strong';
  }

 
  async logIn(): Promise<void> {
    if (this.Profile.valid) {
      this.isloading = true;
      this.clearMessages();

      try {
        const loginData = {
          username: this.Profile.get('username')?.value,
          password: this.Profile.get('password')?.value,
          rememberMe: this.Profile.get('rememberMe')?.value
        };

        
        console.log('Login data:', loginData);
        
      
        await this.simulateApiCall();
        
    
        
        this.auth.login(loginData.username, loginData.password, loginData.rememberMe).subscribe({
          next: (response) => {
            console.log('logIn response:', response);
            const token = response.token || '';
            const Id = response.Id;
            localStorage.setItem('token', token);
            localStorage.setItem('userId', Id);
            this.successMessage = 'Login successful!';

            debounceTime(2500).pipe(
              tap(() => {
                this.router.navigate(['/admin-dashboard']);
              })
            ).subscribe();
            console.log('userId:', Id);
            console.log('Api response', response);
            
          },
          error: (error: any) => {
            this.errorMessage = 'Login failed. Please check your credentials and try again.';
            console.error('Login error:', error);
            this.isloading=false
          },
          complete: () => {
            this.isloading = false;
          }
        });
      } catch (error: any) {
        this.errorMessage = 'Login failed. Please check your credentials and try again.';
        console.error('Login error:', error);
        this.isloading = false;
      }
    } else {
      this.markFormGroupTouched(this.Profile);
    }
  }

  async SignUp(): Promise<void> {
    if (this.SignUpProfile.valid) {
      this.isloading = true;
      this.clearMessages();

      try {
        const signupData = {
          username: this.SignUpProfile.get('username')?.value,
          email: this.SignUpProfile.get('email')?.value,
          password: this.SignUpProfile.get('password')?.value
        };

        console.log('Signup data:', signupData);

        await this.simulateApiCall();

        this.auth.signup(signupData.username, signupData.email, signupData.password).subscribe({
          next: (response) => {
            console.log('SignUp response:', response);
            const token = response.token || '';
            const Id = response.Id;
            localStorage.setItem('token', token);
            localStorage.setItem('userId', Id);
            this.successMessage = 'Signup successful!, Redirecting to dashboard...';
            this.router.navigate(['/admin-dashboard']);
            console.log('userId:', Id);
            console.log('Api response', response);

            debounceTime(5000).pipe(
              tap(() => {
                this.router.navigate(['/admin-dashboard']);
              })
            ).subscribe();
            
            
          },
          error: (error: any) => {
            this.errorMessage = 'Signup failed. Please try again.';
            console.error('Signup error:', error);
            this.isloading = false;
          },
          complete: () => {
            this.isloading = false;
          }
        });
      } catch (error) {
        this.errorMessage = 'Registration failed. Please try again.';
        console.error('Signup error:', error);
        this.isloading = false;
      }
    } else {
      this.markFormGroupTouched(this.SignUpProfile);
    }
  }

  
  async socialLogin(provider: 'facebook' | 'google'): Promise<void> {
    this.isloading = true;
    this.clearMessages();

    try {
      console.log(`Initiating ${provider} login...`);
      
      
      
      await this.simulateApiCall();
      
      this.successMessage = `${provider.charAt(0).toUpperCase() + provider.slice(1)} login successful!`;
      
    } catch (error) {
      this.errorMessage = `${provider.charAt(0).toUpperCase() + provider.slice(1)} login failed. Please try again.`;
      console.error(`${provider} login error:`, error);
    } finally {
      this.isloading = false;
    }
  }


  onTabChange(event: MatTabChangeEvent): void {
    this.clearMessages();
    console.log('Tab changed to:', event.tab.textLabel);
  }

  forgotPassword(event: Event): void {
    event.preventDefault();
    console.log('Forgot password clicked');
    
  }

  openTerms(event: Event): void {
    event.preventDefault();
    console.log('Terms & conditions clicked');
    
  }

  openPrivacyPolicy(event: Event): void {
    event.preventDefault();
    console.log('Privacy policy clicked');
    
  }


  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      control?.markAsTouched();

      if (control instanceof FormGroup) {
        this.markFormGroupTouched(control);
      }
    });
  }

  private clearMessages(): void {
    this.errorMessage = '';
    this.successMessage = '';
  }

  private simulateApiCall(): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve();
      }, 2000); 
    });
  }
}

function debounceTime(delay:number): Observable<number>{
 return  timer(delay)

}
