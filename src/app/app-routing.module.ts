import { NgModule } from '@angular/core'
import { RouterModule, Routes } from '@angular/router';
import { AdminDashboardComponent } from './admin-dashboard/admin-dashboard.component';
import { AiInsightsComponent } from './ai-insights/ai-insights.component';
import { ExecutiveBookingComponent } from './executive-booking/executive-booking.component';
import { RouterOutlet } from '@angular/router';
import { NotificationComponent } from './notification/notification.component';
import { ResourceListComponent } from './resource-list/resource-list.component';
import { AdjustSchedulesComponent } from './adjust-schedules/adjust-schedules.component';
import { LoginPageComponent } from './login-page/login-page.component';
import { canActivate} from './guard/auth.guard';

const routes: Routes = [
  {path: '', redirectTo: 'login-page', pathMatch: 'full'},
  {path: 'admin-dashboard', component: AdminDashboardComponent, canActivate: [canActivate]},  
  {path: 'executive-booking', component: ExecutiveBookingComponent},
    {path:'ai-insights', component:AiInsightsComponent, canActivate:[canActivate]},
    {path:'notification', component:NotificationComponent   , canActivate:[canActivate]},
    {path:'resource-list', component:ResourceListComponent , canActivate:[canActivate]},
    {path:'adjust-schedules/:id', component:AdjustSchedulesComponent, canActivate:[canActivate]},
    {path:'adjust-schedules', component:AdjustSchedulesComponent, canActivate:[canActivate]},
    {path:'login-page', component:LoginPageComponent},
    {path:'**', redirectTo: 'login-page' ,} 
   
]

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
