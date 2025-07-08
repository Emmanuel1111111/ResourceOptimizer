import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatBadgeModule } from '@angular/material/badge';
import { MatTabsModule } from '@angular/material/tabs';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialogModule } from '@angular/material/dialog';
import { MatListModule } from '@angular/material/list';
import { MatChip, MatChipsModule } from '@angular/material/chips';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatNativeDateModule } from '@angular/material/core';
import { ResourceManagementService } from '../resource-management.service';
import { AuthService } from '../service.service';
import {
  CheckOverlapResponse,
  SuggestRoomsResponse,
  InjectScheduleResponse,
  ReallocateResponse,
  ConflictInfo,
  SuggestedRoom
} from '../../Environ'



@Component({
  selector: 'app-executive-booking',
  templateUrl: './executive-booking.component.html',
  styleUrls: ['./executive-booking.component.css']
})
export class ExecutiveBookingComponent implements OnInit {
  activeTab: string = 'check-overlap';
  loading: boolean = false;
  results: any = null;
  form: FormGroup;
  timeOptions: string[] = [];
  dailyUtilization: any[] = [];
  allSchedules: any[] = [];

  constructor(
    private fb: FormBuilder,
    private resourceService: ResourceManagementService,
    private authService: AuthService,
    private snackBar: MatSnackBar
  ) {
    this.form = this.fb.group({
      roomId: [''],
      date: [''],
      startTime: [''],
      endTime: [''],
      day: [{ value: '', disabled: true }],
      scheduleId: [''],
      course: [''],
      department: [''],
      lecturer: [''],
      level: [''],
      program: ['']
    });
  }

  ngOnInit() {
    this.timeOptions = this.getTimeOptions();
    
    // Only update day based on date for check-overlap tab
    this.form.get('date')?.valueChanges.subscribe(date => {
      if (date && this.activeTab === 'check-overlap') {
        const dateObj = new Date(date);
        const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
        this.form.patchValue({ day: dayName });
      }
    });
    
    // Initialize by setting up the first tab (check-overlap)
    this.form.get('day')?.disable();
  }

  executeOperation(operation: string) {
    this.loading = true;
    const { roomId, date, startTime, endTime, day, scheduleId, course, department, lecturer, level, program } = this.form.value;

    // Validate time and date formats
    if ((startTime && !this.resourceService.validateTimeFormat(startTime)) || (endTime && !this.resourceService.validateTimeFormat(endTime))) {
      this.snackBar.open('Invalid time format. Please use HH:MM.', 'Close', { duration: 3000 });
      this.loading = false;
      return;
    }
    if (date && !this.resourceService.validateDateFormat(date)) {
      this.snackBar.open('Invalid date format. Please use YYYY-MM-DD.', 'Close', { duration: 3000 });
      this.loading = false;
      return;
    }

    switch (operation) {
      case 'check_overlap':
        if (!roomId || !date || !startTime || !endTime) {
          this.snackBar.open('Please fill in all required fields.', 'Close', { duration: 3000 });
          this.loading = false;
          return;
        }
        this.resourceService.checkOverlap(roomId, date, startTime, endTime).subscribe({
          next: (response: CheckOverlapResponse) => {
            this.results = response;
            this.loading = false;
          },
          error: (error) => {
            this.snackBar.open(error.message || 'Failed to check conflicts.', 'Close', { duration: 3000 });
            this.loading = false;
          }
        });
        break;

      case 'suggest_rooms':
        if (!startTime || !endTime || !day) {
          this.snackBar.open('Please fill in day, start time, and end time.', 'Close', { duration: 3000 });
          this.loading = false;
          return;
        }
        this.resourceService.suggestRooms(date, startTime, endTime, day, department).subscribe({
          next: (response: SuggestRoomsResponse) => {
            this.results = response;
            this.loading = false;
          },
          error: (error) => {
            this.snackBar.open(error.message || 'Failed to fetch room suggestions.', 'Close', { duration: 3000 });
            this.loading = false;
          }
        });
        break;

      case 'inject_schedule':
        if (!roomId || !date || !startTime || !endTime || !day) {
          this.snackBar.open('Please fill in all required fields.', 'Close', { duration: 3000 });
          this.loading = false;
          return;
        }
        this.resourceService.injectSchedule(roomId, date, startTime, endTime, day, { course, department, lecturer, level, program }).subscribe({
          next: (response: InjectScheduleResponse) => {
            this.results = response;
            this.snackBar.open(`Schedule added successfully! ID: ${response.schedule_id}`, 'Close', { duration: 3000 });
            this.loading = false;
            
            // Check if the response includes refreshed data
            if (response.refreshed_data) {
              console.log('Received refreshed data from backend:', response.refreshed_data);
              // Update the component data with the refreshed data
              if (response.refreshed_data.daily_utilization) {
                this.dailyUtilization = response.refreshed_data.daily_utilization;
              }
              
              // Update the results to include the refreshed data
              this.results = {
                ...this.results,
                refreshed_data: {
                  daily_utilization: this.dailyUtilization,
                  all_schedules: []  // We'll fetch this separately
                }
              };
              
              // Still fetch all schedules to ensure we have the latest data
              this.fetchAllSchedules(roomId);
            } else {
              // If no refreshed data, fetch it manually
              this.refreshData(roomId);
            }
          },
          error: (error) => {
            this.snackBar.open(error.message || 'Failed to add schedule.', 'Close', { duration: 3000 });
            this.loading = false;
          }
        });
        break;

      case 'reallocate':
        if (!scheduleId || !roomId || !startTime || !endTime || !day) {
          this.snackBar.open('Please fill in all required fields.', 'Close', { duration: 3000 });
          this.loading = false;
          return;
        }
        
        // Create new schedule object with optional date
        const newSchedule = {
          room_id: roomId,
          start_time: startTime,
          end_time: endTime,
          day: day,
          course: course || 'CSM 477', // Default to CSM 477 if not provided
          department: department || 'Computer Science', // Default to Computer Science if not provided
          year: level || '4', // Default to 4 if not provided
          status: 'Booked' // Default status
        };
        
        // Only add date if it's provided
        if (date) {
          Object.assign(newSchedule, { date });
        }
        
        this.resourceService.reallocateSchedule(scheduleId, newSchedule).subscribe({
          next: (response: ReallocateResponse) => {
            this.results = response;
            this.snackBar.open('Schedule reallocated successfully!', 'Close', { duration: 3000 });
            this.loading = false;
            
            // Refresh data after successful reallocation
            this.refreshData(roomId);
          },
          error: (error) => {
            this.snackBar.open(error.message || 'Failed to reallocate schedule.', 'Close', { duration: 3000 });
            this.loading = false;
          }
        });
        break;
    }
  }

  // Method to refresh data after operations
  refreshData(roomId: string) {
    // First try to get day-based schedules
    this.authService.getDayBasedSchedules(roomId).subscribe({
      next: (data) => {
        console.log('Day-based Schedules Data after operation:', data);
        if (data.daily_utilization && data.daily_utilization.length > 0) {
          // Update the daily utilization data
          this.dailyUtilization = data.daily_utilization;
          
          // Also fetch the latest individual schedules
          this.fetchAllSchedules(roomId);
        } else {
          // Fall back to regular refresh if no day-based data
          this.fallbackToRegularRefresh(roomId);
        }
      },
      error: (err) => {
        console.error('Error getting day-based schedules after operation:', err);
        // Fall back to regular refresh on error
        this.fallbackToRegularRefresh(roomId);
      }
    });
  }
  
  // Fallback method to use the original refresh endpoint
  fallbackToRegularRefresh(roomId: string) {
    this.authService.refreshAggregatedData(roomId).subscribe({
      next: (data) => {
        console.log('Refreshed Utilization Data after operation (fallback):', data);
        // Update the daily utilization data
        this.dailyUtilization = data.daily_utilization;
        
        // Also fetch the latest individual schedules
        this.fetchAllSchedules(roomId);
      },
      error: (err) => {
        console.error('Error refreshing utilization data after operation:', err);
        this.snackBar.open('Operation was successful, but failed to refresh data. Please reload the page.', 'Close', { duration: 5000 });
      }
    });
  }
  
  // Fetch all schedules for a room
  fetchAllSchedules(roomId: string) {
    this.authService.getRoomSchedules(roomId).subscribe({
      next: (response) => {
        console.log('All Schedules Response after operation:', response);
        this.allSchedules = response.schedules;
        
        // Update the results to include the refreshed data
        if (this.results) {
          this.results = {
            ...this.results,
            refreshed_data: {
              daily_utilization: this.dailyUtilization,
              all_schedules: this.allSchedules
            }
          };
        }
      },
      error: (err) => {
        console.error('Error fetching schedules after operation:', err);
      }
    });
  }

  getCurrentDate(): string {
    return new Date().toISOString().split('T')[0];
  }

  getTimeOptions(): string[] {
    const times: string[] = [];
    for (let hour = 8; hour <= 18; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        times.push(timeString);
      }
    }
    return times;
  }

  onTabChange(index: number) {
    const tabs = ['check-overlap', 'suggest_rooms', 'inject-schedule', 'reallocate'];
    this.activeTab = tabs[index];
    this.results = null; // Reset results when switching tabs
    
    // Reset form when switching tabs
    this.form.reset();
    
    // Handle day field differently based on active tab
    if (this.activeTab === 'suggest_rooms') {
      // For suggest_rooms, day is a required field that users must select
      // Enable the day field
      this.form.get('day')?.enable();
    } else if (this.activeTab === 'check-overlap') {
      // For check-overlap, day is derived from date
      const date = this.form.get('date')?.value;
      if (date) {
        const dateObj = new Date(date);
        const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
        this.form.patchValue({ day: dayName });
      }
      // Make day readonly
      this.form.get('day')?.disable();
    }
  }
}