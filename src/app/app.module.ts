import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';

// Angular Material Modules
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatSortModule } from '@angular/material/sort';
import { MatDialogModule } from '@angular/material/dialog';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatRadioModule } from '@angular/material/radio';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatStepperModule } from '@angular/material/stepper';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatBadgeModule } from '@angular/material/badge';

// Components
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { LoginPageComponent } from './login-page/login-page.component';
import { AdminLoginComponent } from './admin-login/admin-login.component';
import { AdminDashboardComponent } from './admin-dashboard/admin-dashboard.component';
import { ResourceListComponent } from './resource-list/resource-list.component';
import { ExecutiveBookingComponent } from './executive-booking/executive-booking.component';
import { AdjustSchedulesComponent } from './adjust-schedules/adjust-schedules.component';
import { AiInsightsComponent } from './ai-insights/ai-insights.component';
import { NotificationComponent } from './notification/notification.component';
import { UnauthorizedComponent, InsufficientPrivilegesComponent } from './app-routing.module';

// Services
import { AuthService } from './service.service';
import { AdminAuthService } from './services/admin-auth.service';
import { SecurityService } from './services/security.service';
import { ResourceManagementService } from './resource-management.service';
import { NotificationService } from './services/notification.service';

// Guards
import { canActivate } from './guard/auth.guard';
import { AdminGuard, SuperAdminGuard, PermissionGuard } from './guards/admin.guard';

// Interceptors
import { AuthInterceptor } from './interceptors/auth.interceptor';
import { ErrorInterceptor } from './interceptors/error.interceptor';

@NgModule({
  declarations: [
    AppComponent,
    LoginPageComponent,
    AdminLoginComponent,
    AdminDashboardComponent,
    ResourceListComponent,
    ExecutiveBookingComponent,
    AdjustSchedulesComponent,
    AiInsightsComponent,
    NotificationComponent,
    UnauthorizedComponent,
    InsufficientPrivilegesComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    BrowserAnimationsModule,
    FormsModule,
    ReactiveFormsModule,
    HttpClientModule,
    
    // Angular Material Modules
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatSidenavModule,
    MatListModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatDialogModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    MatProgressBarModule,
    MatTabsModule,
    MatCheckboxModule,
    MatRadioModule,
    MatSlideToggleModule,
    MatMenuModule,
    MatTooltipModule,
    MatChipsModule,
    MatAutocompleteModule,
    MatStepperModule,
    MatExpansionModule,
    MatBadgeModule
  ],
  providers: [
    AuthService,
    AdminAuthService,
    SecurityService,
    ResourceManagementService,
    NotificationService,
    AdminGuard,
    SuperAdminGuard,
    PermissionGuard,
    // Temporarily disabled to test circular dependency
    // {
    //   provide: HTTP_INTERCEPTORS,
    //   useClass: AuthInterceptor,
    //   multi: true
    // },
    // {
    //   provide: HTTP_INTERCEPTORS,
    //   useClass: ErrorInterceptor,
    //   multi: true
    // }
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
