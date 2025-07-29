import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  
  constructor() {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    // Get the admin token directly from sessionStorage to avoid circular dependency
    const token = sessionStorage.getItem('admin_token');
    
    // If we have a token, add it to the request
    if (token && this.shouldAddToken(req.url)) {
      const authReq = req.clone({
        headers: req.headers.set('Authorization', `Bearer ${token}`)
      });
      return next.handle(authReq);
    }
    
    return next.handle(req);
  }

  private shouldAddToken(url: string): boolean {
    // Don't add token to logout or login endpoints
    if (url.includes('/logout') || url.includes('/login')) {
      return false;
    }
    
    // Add token to admin API calls
    return url.includes('/api/admin/') || 
           url.includes('/api/manage_resources') ||
           url.includes('/api/current_utilization') ||
           url.includes('/api/predict');
  }
} 