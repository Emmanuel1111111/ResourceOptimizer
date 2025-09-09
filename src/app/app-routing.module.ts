import { NgModule, Component } from '@angular/core';
import { RouterModule, Routes, PreloadAllModules } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { LoginPageComponent } from './login-page/login-page.component';
import { AdminLoginComponent } from './admin-login/admin-login.component';
import { AdminDashboardComponent } from './admin-dashboard/admin-dashboard.component';
import { ResourceListComponent } from './resource-list/resource-list.component';
import { ExecutiveBookingComponent } from './executive-booking/executive-booking.component';
import { AdjustSchedulesComponent } from './adjust-schedules/adjust-schedules.component';
import { AiInsightsComponent } from './ai-insights/ai-insights.component';
import { NotificationComponent } from './notification/notification.component';
import { canActivate } from './guard/auth.guard';
import { AdminGuard, SuperAdminGuard } from './guards/admin.guard';

// Error page components
@Component({
  selector: 'app-unauthorized',
  template: `
    <div class="error-container">
      <mat-card>
        <mat-card-header>
          <mat-icon color="warn">block</mat-icon>
          <mat-card-title>Unauthorized Access</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <p>You don't have permission to access this resource.</p>
          <button mat-button color="primary" routerLink="/login">Return to Login</button>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .error-container {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      padding: 20px;
    }
    mat-card {
      text-align: center;
      max-width: 400px;
    }
  `]
})
export class UnauthorizedComponent { }

@Component({
  selector: 'app-insufficient-privileges',
  template: `
    <div class="error-container">
      <mat-card>
        <mat-card-header>
          <mat-icon color="warn">security</mat-icon>
          <mat-card-title>Insufficient Privileges</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <p>Your current role doesn't have sufficient privileges for this action.</p>
          <p>Contact your system administrator if you believe this is an error.</p>
          <button mat-button color="primary" routerLink="/admin/dashboard">Return to Dashboard</button>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .error-container {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      padding: 20px;
    }
    mat-card {
      text-align: center;
      max-width: 400px;
    }
  `]
})
export class InsufficientPrivilegesComponent { }

const routes: Routes = [

  { path: '', redirectTo: '/login', pathMatch: 'full' },
  
  // Regular user login
  { path: 'login', component: LoginPageComponent },
  

  {
    path: 'admin',
    children: [
     
      { path: 'login', component: AdminLoginComponent },
      
      // Admin dashboard (requires admin role)
      {
        path: 'dashboard',
        component: AdminDashboardComponent,
        canActivate: [AdminGuard],
        data: { 
          roles: ['admin', 'super_admin'],
          title: 'Admin Dashboard' 
        }
      },
      
      // Resource management (requires specific permissions)
      {
        path: 'resources',
        component: ResourceListComponent,
        canActivate: [AdminGuard],
        data: { 
          permissions: ['resources:read'],
          title: 'Resource Management' 
        }
      },
      
      // Executive booking (requires booking permissions)
      {
        path: 'booking',
        component: ExecutiveBookingComponent,
        canActivate: [AdminGuard],
        data: { 
          permissions: ['booking:create', 'booking:read'],
          title: 'Executive Booking' 
        }
      },
      
      // Schedule adjustments (requires schedule permissions)
      {
        path: 'schedules',
        component: AdjustSchedulesComponent,
        canActivate: [AdminGuard],
        data: { 
          permissions: ['schedules:read', 'schedules:write'],
          title: 'Schedule Management' 
        }
      },
      
      // AI insights (requires analytics permissions)
      {
        path: 'insights',
        component: AiInsightsComponent,
        canActivate: [AdminGuard],
        data: { 
          permissions: ['analytics:read'],
          title: 'AI Insights' 
        }
      },
      
      // Notifications (admin access)
      {
        path: 'notifications',
        component: NotificationComponent,
        canActivate: [AdminGuard],
        data: { 
          title: 'Notifications' 
        }
      },
      
      // Insufficient privileges page
      {
        path: 'insufficient-privileges',
        component: InsufficientPrivilegesComponent,
        data: { title: 'Insufficient Privileges' }
      },
      
      // Default admin redirect
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' }
    ]
  },
  
  // Legacy routes for backward compatibility (redirect to admin)
  { 
    path: 'admin-dashboard', 
    redirectTo: '/admin/dashboard', 
    pathMatch: 'full' 
  },
  { 
    path: 'resource-list', 
    redirectTo: '/admin/resources', 
    pathMatch: 'full' 
  },
  { 
    path: 'executive-booking', 
    redirectTo: '/admin/booking', 
    pathMatch: 'full' 
  },
  { 
    path: 'adjust-schedules', 
    redirectTo: '/admin/schedules', 
    pathMatch: 'full' 
  },
  { 
    path: 'ai-insights', 
    redirectTo: '/admin/insights', 
    pathMatch: 'full' 
  },
  
  // Error pages
  {
    path: 'unauthorized',
    component: UnauthorizedComponent,
    data: { title: 'Unauthorized Access' }
  },
  
  // Wildcard route - must be last
  { path: '**', redirectTo: '/login' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes, {
    // Enable router preloading for better performance
    preloadingStrategy: PreloadAllModules,
    // Enable tracing for debugging (disable in production)
    enableTracing: false,
    // Scroll to top on route change
    scrollPositionRestoration: 'top'
  })],
  exports: [RouterModule]
})
export class AppRoutingModule { }
