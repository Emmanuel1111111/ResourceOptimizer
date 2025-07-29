import { Injectable } from '@angular/core';
import { CanActivate, CanActivateChild, ActivatedRouteSnapshot, RouterStateSnapshot, Router } from '@angular/router';
import { Observable, of } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';
import { AdminAuthService } from '../services/admin-auth.service';
import { SecurityService } from '../services/security.service';

@Injectable({
  providedIn: 'root'
})
export class AdminGuard implements CanActivate, CanActivateChild {
  
  constructor(
    private adminAuth: AdminAuthService,
    private security: SecurityService,
    private router: Router
  ) {}

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<boolean> | Promise<boolean> | boolean {
    return this.checkAdminAccess(route, state);
  }

  canActivateChild(
    childRoute: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<boolean> | Promise<boolean> | boolean {
    return this.checkAdminAccess(childRoute, state);
  }

  private checkAdminAccess(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<boolean> {
    // Check if user is authenticated
    if (!this.adminAuth.isAuthenticated()) {
      this.redirectToLogin(state.url);
      return of(false);
    }

    // Check if token is expired
    if (this.security.isTokenExpired()) {
      this.adminAuth.logout().subscribe(() => {
        this.redirectToLogin(state.url, 'Session expired. Please login again.');
      });
      return of(false);
    }

    // Verify admin role
    return this.adminAuth.currentUser$.pipe(
      map(user => {
        if (!user) {
          this.redirectToLogin(state.url);
          return false;
        }

        // Check if user has admin role
        if (!this.adminAuth.isAdmin()) {
          this.router.navigate(['/unauthorized'], {
            queryParams: { 
              message: 'Admin access required',
              returnUrl: state.url 
            }
          });
          return false;
        }

        // Check specific permissions if required
        const requiredPermissions = route.data['permissions'] as string[];
        const requiredRole = route.data['role'] as string;
        const requiredRoles = route.data['roles'] as string[];

        if (requiredRole && !this.adminAuth.hasRole(requiredRole)) {
          this.router.navigate(['/admin/insufficient-privileges'], {
            queryParams: { 
              required: requiredRole,
              current: user.role,
              returnUrl: state.url 
            }
          });
          return false;
        }

        if (requiredRoles && !this.adminAuth.hasAnyRole(requiredRoles)) {
          this.router.navigate(['/admin/insufficient-privileges'], {
            queryParams: { 
              required: requiredRoles.join(','),
              current: user.role,
              returnUrl: state.url 
            }
          });
          return false;
        }

        if (requiredPermissions && requiredPermissions.length > 0) {
          const hasAllPermissions = requiredPermissions.every(permission => {
            const [resource, action] = permission.split(':');
            return this.adminAuth.hasPermission(resource, action);
          });

          if (!hasAllPermissions) {
            this.router.navigate(['/admin/insufficient-privileges'], {
              queryParams: { 
                permissions: requiredPermissions.join(','),
                returnUrl: state.url 
              }
            });
            return false;
          }
        }

        // Log successful access
        this.logAccess(route, user.id, true);
        return true;
      }),
      catchError(error => {
        console.error('Admin guard error:', error);
        this.redirectToLogin(state.url, 'Authentication error. Please try again.');
        return of(false);
      })
    );
  }

  private redirectToLogin(returnUrl: string, message?: string): void {
    const queryParams: any = { returnUrl };
    if (message) {
      queryParams.message = message;
    }
    
    this.router.navigate(['/admin/login'], { queryParams });
  }

  private logAccess(route: ActivatedRouteSnapshot, adminId: string, success: boolean): void {
    // Log admin access attempts for security auditing
    const logData = {
      adminId,
      route: route.routeConfig?.path || 'unknown',
      timestamp: new Date().toISOString(),
      success,
      ip: 'unknown', // This would come from the server in a real implementation
      userAgent: navigator.userAgent
    };

    // Send to backend for logging (fire and forget)
    // This would typically be handled by an interceptor or service
    console.log('Admin access log:', logData);
  }
}

// Additional guard for super admin access
@Injectable({
  providedIn: 'root'
})
export class SuperAdminGuard implements CanActivate {
  
  constructor(
    private adminAuth: AdminAuthService,
    private router: Router
  ) {}

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<boolean> | Promise<boolean> | boolean {
    
    if (!this.adminAuth.isAuthenticated()) {
      this.router.navigate(['/admin/login'], {
        queryParams: { returnUrl: state.url }
      });
      return false;
    }

    if (!this.adminAuth.isSuperAdmin()) {
      this.router.navigate(['/admin/insufficient-privileges'], {
        queryParams: { 
          required: 'super_admin',
          message: 'Super administrator access required'
        }
      });
      return false;
    }

    return true;
  }
}

// Permission-based guard
@Injectable({
  providedIn: 'root'
})
export class PermissionGuard implements CanActivate {
  
  constructor(
    private adminAuth: AdminAuthService,
    private router: Router
  ) {}

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<boolean> | Promise<boolean> | boolean {
    
    const requiredPermission = route.data['permission'] as string;
    
    if (!requiredPermission) {
      console.error('PermissionGuard: No permission specified in route data');
      return true; // Allow access if no permission specified
    }

    if (!this.adminAuth.isAuthenticated()) {
      this.router.navigate(['/admin/login'], {
        queryParams: { returnUrl: state.url }
      });
      return false;
    }

    const [resource, action] = requiredPermission.split(':');
    
    if (!this.adminAuth.hasPermission(resource, action)) {
      this.router.navigate(['/admin/insufficient-privileges'], {
        queryParams: { 
          permission: requiredPermission,
          returnUrl: state.url
        }
      });
      return false;
    }

    return true;
  }
} 