
import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import {MatCardModule} from '@angular/material/card';
import {MatButtonModule} from '@angular/material/button';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { AdminDashboardComponent } from './admin-dashboard/admin-dashboard.component';
import { ExecutiveBookingComponent } from './executive-booking/executive-booking.component';
import { AiInsightsComponent } from './ai-insights/ai-insights.component';
import { MatChipsModule } from '@angular/material/chips'
import { ResourceListComponent } from './resource-list/resource-list.component';
import { NotificationComponent } from './notification/notification.component';
import {MatChip} from '@angular/material/chips';
import { MatChipListbox } from '@angular/material/chips';
import { AdjustSchedulesComponent } from './adjust-schedules/adjust-schedules.component';
import { FormsModule } from '@angular/forms';
import { MatFormField } from '@angular/material/form-field';
import { MatLabel } from '@angular/material/form-field';
import { MatTooltip } from '@angular/material/tooltip';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { MatTableModule } from '@angular/material/table';
import {MatInputModule} from '@angular/material/input';
import { MatInput } from '@angular/material/input';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { LoginPageComponent } from './login-page/login-page.component';
import {MatTab} from '@angular/material/tabs';
import { MatTabsModule } from '@angular/material/tabs';
import { ReactiveFormsModule } from '@angular/forms';
import { MAT_DATE_FORMATS, MatOption } from '@angular/material/core';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressBar } from '@angular/material/progress-bar';



import { MatListModule, MatNavList } from '@angular/material/list';

@NgModule({
  declarations: [
    AppComponent,
    AdminDashboardComponent,
    ExecutiveBookingComponent,
    AiInsightsComponent,
    ResourceListComponent,
    NotificationComponent,
  
    LoginPageComponent,
    AdjustSchedulesComponent
  ],
  imports: [
    MatLabel,
    MatFormField,
    MatChip,
    FormsModule,
    BrowserModule,
    AppRoutingModule,
    MatCardModule,
    MatButtonModule,
    CommonModule,
    MatIconModule,
    MatToolbarModule,
    MatOption,
    MatChip,
    MatChipListbox,
    MatChipsModule,
    HttpClientModule,
    MatTooltip,
    MatTableModule,
    MatInput,
    MatInputModule,
    MatProgressSpinner,
    MatTab,
    MatTabsModule,
    ReactiveFormsModule,
    MatNavList,
    MatProgressBarModule,
    MatProgressBar
    
   
  
    
  ],
  providers: [
    provideAnimationsAsync()
    
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
