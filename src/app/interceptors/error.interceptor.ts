import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { Router } from '@angular/router';

@Injectable()
export class ErrorInterceptor implements HttpInterceptor {
  
  constructor(private router: Router) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    return next.handle(req).pipe(
      catchError((error: HttpErrorResponse) => {
        if (error.status === 401) {
          // Unauthorized - likely token expired or invalid
          this.handleUnauthorized();
        } else if (error.status === 403) {
          // Forbidden - insufficient permissions
          this.handleForbidden();
        } else if (error.status === 429) {
          // Rate limited
          this.handleRateLimited(error);
        }
        
        return throwError(() => error);
      })
    );
  }

  private handleUnauthorized(): void {
    // Prevent infinite loops - don't logout if already on login page
    if (this.router.url.includes('/login')) {
      return;
    }
    
    // Clear tokens manually to avoid circular dependency
    sessionStorage.removeItem('admin_token');
    sessionStorage.removeItem('admin_refresh_token');
    sessionStorage.removeItem('admin_user');
    sessionStorage.removeItem('token_expires_at');
    
    // Redirect to login
    this.router.navigate(['/admin/login'], {
      queryParams: { 
        message: 'Session expired. Please login again.',
        returnUrl: this.router.url 
      }
    });
  }

  private handleForbidden(): void {
    // Redirect to insufficient privileges page
    this.router.navigate(['/admin/insufficient-privileges']);
  }

  private handleRateLimited(error: HttpErrorResponse): void {
    // Handle rate limiting
    console.warn('Rate limited:', error.message);
    // Could show a snackbar or notification here
  }
} 