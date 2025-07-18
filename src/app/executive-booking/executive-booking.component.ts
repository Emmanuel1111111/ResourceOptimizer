import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
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
  styleUrls: ['./executive-booking.component.css'],
  encapsulation: ViewEncapsulation.None
})
export class ExecutiveBookingComponent implements OnInit {
  activeTab: string = 'check-overlap';
  loading: boolean = false;
  results: any = null;
  form: FormGroup;
  timeOptions: string[] = [];
  dailyUtilization: any[] = [];
  allSchedules: any[] = [];
  
  // Room suggestion pagination and filtering
  filteredRooms: any[] = [];
  displayedRooms: any[] = [];
  roomSearchQuery: string = '';
  roomSortOption: string = 'room_id';
  currentPage: number = 1;
  roomsPerPage: number = 8;
  totalPages: number = 1;
  
  // Room selection modal
  showRoomSelectionModal: boolean = false;
  selectedRoom: any = null;
  injectScheduleForm: FormGroup;
  injectLoading: boolean = false;
  availableTimeSlots: any[] = [];
  endTimeOptions: string[] = [];
  
  // Database connection status
  dbConnectionError: boolean = false;
  dbErrorMessage: string = '';
  showTroubleshootingGuide: boolean = false;
  
  // Day options for dropdowns
  dayOptions: string[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
   tabs = ['Check Overlap', 'Suggest Rooms', 'Inject Schedule', 'Reallocate'];
  reallocateForm: FormGroup;

  constructor(
    private fb: FormBuilder,
    private resourceService: ResourceManagementService,
    private authService: AuthService,
    private snackBar: MatSnackBar
  ) {
     
    this.form = this.fb.group({
      roomId: ['', Validators.required],
      date: [''],
      startTime: ['', Validators.required],
      endTime: ['', Validators.required],
      day: ['', Validators.required], 
      scheduleId: [''],
      course: [''],
      department: [''],
      lecturer: [''],
      level: [''],
      program: ['']
    });
    
    this.injectScheduleForm = this.fb.group({
      roomId: ['', Validators.required],
      date: [''],
      startTime: ['', Validators.required],
      endTime: ['', Validators.required],
      day: ['', Validators.required],
      course: ['', Validators.required],
      department: ['', Validators.required],
      lecturer: [''],
      level: ['', Validators.required]
    });
    
    this.reallocateForm = this.fb.group({
      roomId: ['', Validators.required],
      day: [''],
      date: [''],
      startTime: [''],
      endTime: [''],
      course: [''],
      department: [''],
      year: [''],
      status: [''],
      lecturer: ['']
    });
    
    this.timeOptions = this.getTimeOptions();
  }

  ngOnInit() {
    
    this.activeTab = 'Check Overlap'; // Default active tab
    
    
    
    this.checkDatabaseStatus();
  }
  
 
  checkDatabaseStatus() {
    this.authService.checkDatabaseStatus().subscribe({
      next: (response: {status: string, message: string, connection_type: string, error_details?: string}) => {
        if (response.status === 'warning') {
          this.dbConnectionError = true;
          this.dbErrorMessage = response.message;
          if (response.error_details) {
            this.dbErrorMessage += ' - ' + response.error_details;
          }
          
          this.snackBar.open(
            'Warning: ' + response.message + ' - Some features may not work correctly.',
            'Dismiss',
            { duration: 10000 }
          );
        } else if (response.status === 'error') {
          this.dbConnectionError = true;
          this.dbErrorMessage = response.message;
          if (response.error_details) {
            this.dbErrorMessage += ' - ' + response.error_details;
          }
          
          this.snackBar.open(
            'Error: ' + response.message + ' - Please contact system administrator.',
            'Dismiss',
            { duration: 10000 }
          );
        } else {
          // Success - clear any error state
          this.dbConnectionError = false;
        }
      },
      error: (error: any) => {
        console.error('Failed to check database status:', error);
        this.dbConnectionError = true;
        this.dbErrorMessage = 'Unable to connect to the server. Please check your network connection.';
        this.snackBar.open(
          this.dbErrorMessage,
          'Dismiss',
          { duration: 10000 }
        );
      }
    });
  }
  
  // Retry database connection
  retryDatabaseConnection() {
    this.loading = true;
    this.checkDatabaseStatus();
    
    
    setTimeout(() => {
      this.loading = false;
    }, 1500);
  }

  executeOperation(operation: string) {
    this.loading = true;
    const { roomId, date, startTime, endTime, day, scheduleId, course, department, lecturer, level, program } = this.form.value;

   
    if ((startTime && !this.resourceService.validateTimeFormat(startTime)) || (endTime && !this.resourceService.validateTimeFormat(endTime))) {
      this.snackBar.open('Invalid time format. Please use HH:MM.', 'Close', { duration: 3000 });
      this.loading = false;
      return;
    }
    
    // Validate day is provided for all operations
    if (!day) {
      this.snackBar.open('Day is required for all operations.', 'Close', { duration: 3000 });
      this.loading = false;
      return;
    }

    // First check database status before proceeding with operation
    this.authService.checkDatabaseStatus().subscribe({
      next: (response: {status: string, message: string, connection_type: string}) => {
        if (response.status === 'error') {
          this.snackBar.open(
            'Database error: ' + response.message + ' - Operation cannot be performed.',
            'Dismiss',
            { duration: 5000 }
          );
          this.loading = false;
          return;
        }
        
        
        this.performOperation(operation, roomId, date, startTime, endTime, day, scheduleId, course, department, lecturer, level, program);
      },
      error: (error: any) => {
        console.error('Failed to check database status:', error);
        this.snackBar.open(
          'Unable to connect to the server. Please check your network connection.',
          'Dismiss',
          { duration: 5000 }
        );
        this.loading = false;
      }
    });
  }
  

  performOperation(operation: string, roomId: string, date: string, startTime: string, endTime: string, 
                   day: string, scheduleId: string, course: string, department: string, 
                   lecturer: string, level: string, program: string) {
    if (operation === 'reallocate') {
      const formValue = this.reallocateForm.value;
      // Build new_schedule dynamically
      const new_schedule: any = {};
      const roomId = formValue.roomId;
      if (!roomId) {
        this.snackBar.open('Room ID is required.', 'Close', { duration: 3000 });
        this.loading = false;
        return;
      }
      if (formValue.day) new_schedule.day = formValue.day;
      if (formValue.date) new_schedule.date = formValue.date;
      if (formValue.startTime) new_schedule.start_time = formValue.startTime;
      if (formValue.endTime) new_schedule.end_time = formValue.endTime;
      if (formValue.course) new_schedule.course = formValue.course;
      if (formValue.department) new_schedule.department = formValue.department;
      if (formValue.year) new_schedule.year = formValue.year;
      if (formValue.status) new_schedule.status = formValue.status;
      if (formValue.lecturer) new_schedule.lecturer = formValue.lecturer;
      this.loading = true;
      this.resourceService.reallocateSchedule(roomId, new_schedule).subscribe({
        next: (response: any) => {
          this.results = response;
          this.snackBar.open('Reallocation request sent!', 'Close', { duration: 3000 });
          this.loading = false;
        },
        error: (error) => {
          this.handleApiError(error, 'Failed to reallocate schedule');
        }
      });
      return;
    }
    switch (operation) {
      case 'check_overlap':
        if (!roomId || !startTime || !endTime || !day) {
          this.snackBar.open('Please fill in all required fields: Room ID, Day, Start Time, End Time.', 'Close', { duration: 3000 });
          this.loading = false;
          return 
        }
        
        
        this.resourceService.checkOverlap(roomId, date || this.getCurrentDate(), startTime, endTime, day).subscribe({
          next: (response: CheckOverlapResponse) => {
            this.results = response;
            this.loading = false;
            
            
            console.log('Check overlap response:', this.results);
          },
          error: (error) => {
            this.handleApiError(error, 'Failed to check conflicts');
          }
        });
        break;

      case 'suggest_rooms':
        if (!startTime || !endTime || !day) {
          this.snackBar.open('Please fill in day, start time, and end time.', 'Close', { duration: 3000 });
          this.loading = false;
          return;
        }
        
        // Date is optional for suggest_rooms
        this.resourceService.suggestRooms(date || null, startTime, endTime, day, roomId).subscribe({
          next: (response: SuggestRoomsResponse) => {
            this.results = response;
            
            // Initialize pagination for room suggestions
            this.filteredRooms = [...(response.suggested_rooms || [])];
            this.initializePagination();
            
            this.loading = false;
          },
          error: (error) => {
            this.handleApiError(error, 'Failed to fetch room suggestions');
          }
        });
        break;

      case 'inject_schedule':
        if (!roomId || !startTime || !endTime || !day) {
          this.snackBar.open('Please fill in all required fields: Room ID, Day, Start Time, End Time.', 'Close', { duration: 3000 });
          this.loading = false;
          return;
        }
        
        // Use injectSchedule but make date optional
        this.resourceService.injectSchedule(
          roomId, 
          date || this.getCurrentDate(), 
          startTime, 
          endTime, 
          day, 
          { 
            course: course || '', 
            department: department || '', 
            lecturer: lecturer || '', 
            year: level || '' // Correctly map level form control to year field
          }
        ).subscribe({
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
            this.handleApiError(error, 'Failed to add schedule');
          }
        });
        break;
    }
  }

  // Helper method to handle API errors
  handleApiError(error: any, defaultMessage: string) {
    console.error('API Error:', error);
    
    // Check if error is a database connection issue
    if (error.error && error.error.error && error.error.error.includes('Database connection is not available')) {
      this.dbConnectionError = true;
      this.dbErrorMessage = 'Database connection error. Please contact system administrator.';
      this.snackBar.open(this.dbErrorMessage, 'Dismiss', { duration: 5000 });
    } else {
      const errorMsg = error.error?.error || error.message || defaultMessage;
      this.snackBar.open(errorMsg, 'Close', { duration: 3000 });
    }
    
    this.loading = false;
    this.injectLoading = false;
  }


  refreshData(roomId: string) {
  
    this.authService.getDayBasedSchedules(roomId).subscribe({
      next: (data) => {
        console.log('Day-based Schedules Data after operation:', data);
        if (data.daily_utilization && data.daily_utilization.length > 0) {
  
          this.dailyUtilization = data.daily_utilization;
          
        
          this.fetchAllSchedules(roomId);
        } else {
         
          this.fallbackToRegularRefresh(roomId);
        }
      },
      error: (err) => {
        console.error('Error getting day-based schedules after operation:', err);
   
        this.fallbackToRegularRefresh(roomId);
      }
    });
  }
  

  fallbackToRegularRefresh(roomId: string) {
    this.authService.refreshAggregatedData(roomId).subscribe({
      next: (data) => {
        console.log('Refreshed Utilization Data after operation (fallback):', data);
        
        this.dailyUtilization = data.daily_utilization;
        
        
        this.fetchAllSchedules(roomId);
      },
      error: (err) => {
        console.error('Error refreshing utilization data after operation:', err);
        this.snackBar.open('Operation was successful, but failed to refresh data. Please reload the page.', 'Close', { duration: 5000 });
      }
    });
  }
  
 
  fetchAllSchedules(roomId: string) {
    this.authService.getRoomSchedules(roomId).subscribe({
      next: (response) => {
        console.log('All Schedules Response after operation:', response);
        this.allSchedules = response.schedules;
        
 
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
    
   
    for (let hour = 7; hour <= 19; hour++) {
      
      times.push(`${hour.toString().padStart(2, '0')}:00`);
      
    
      times.push(`${hour.toString().padStart(2, '0')}:30`);
      
   
      times.push(`${hour.toString().padStart(2, '0')}:15`);
      times.push(`${hour.toString().padStart(2, '0')}:45`);
      
      
      if (hour < 19) {
        times.push(`${hour.toString().padStart(2, '0')}:55`);
        times.push(`${hour.toString().padStart(2, '0')}:25`);
      }
    }
    
    
    return times.sort();
  }

  onTabChange(index: number) {
    
    this.activeTab = this.tabs[index];
    console.log('Tab changed to:', this.activeTab);
    this.results = null; 
    
    this.form.reset();
    // Show snackbar when Reallocate tab is activated
    if (this.activeTab === 'Reallocate') {
      this.snackBar.open(
        'Only fields you fill in will be updated. Leave blank to keep existing values.',
        'Dismiss',
        { duration: 10000, verticalPosition: 'top' }
      );
    }
  }
  

  // Room suggestion pagination methods
  initializePagination() {
    this.currentPage = 1;
    this.totalPages = Math.ceil(this.filteredRooms.length / this.roomsPerPage);
    this.updateDisplayedRooms();
  }
  
  updateDisplayedRooms() {
    const startIndex = (this.currentPage - 1) * this.roomsPerPage;
    const endIndex = Math.min(startIndex + this.roomsPerPage, this.filteredRooms.length);
    this.displayedRooms = this.filteredRooms.slice(startIndex, endIndex);
  }
  
  changePage(page: number) {
    if (page < 1 || page > this.totalPages) {
      return;
    }
    
    this.currentPage = page;
    this.updateDisplayedRooms();
  }
  
  getPageNumbers(): number[] {
    const pages: number[] = [];
    const maxVisiblePages = 5;
    
    if (this.totalPages <= maxVisiblePages) {
      
      for (let i = 1; i <= this.totalPages; i++) {
        pages.push(i);
      }
    } else {
     
      pages.push(1);
      
 
      let startPage = Math.max(2, this.currentPage - 1);
      let endPage = Math.min(this.totalPages - 1, this.currentPage + 1);
      
    
      if (this.currentPage <= 2) {
        endPage = 3;
      } else if (this.currentPage >= this.totalPages - 1) {
        startPage = this.totalPages - 2;
      }
      
     
      if (startPage > 2) {
        pages.push(-1); 
      }
      
      // Add middle pages
      for (let i = startPage; i <= endPage; i++) {
        pages.push(i);
      }
      
      // Add ellipsis if needed
      if (endPage < this.totalPages - 1) {
        pages.push(-2); // -2 represents ellipsis
      }
      
      // Always show last page
      pages.push(this.totalPages);
    }
    
    return pages;
  }
  
  showAllRooms() {
    this.displayedRooms = [...this.filteredRooms];
  }
  
  filterRooms() {
    if (!this.results || !this.results.suggested_rooms) {
      return;
    }
    
    
    if (this.roomSearchQuery.trim() === '') {
      this.filteredRooms = [...this.results.suggested_rooms];
    } else {
      const query = this.roomSearchQuery.toLowerCase();
      this.filteredRooms = this.results.suggested_rooms.filter((room: any) => {
        return room.room_id.toLowerCase().includes(query) || 
               (room.department && room.department.toLowerCase().includes(query));
      });
    } 
    
    // Apply sorting
    this.sortRooms();
    
    // Reset pagination
    this.initializePagination();
  }
  
  sortRooms() {
    switch (this.roomSortOption) {
      case 'room_id':
        this.filteredRooms.sort((a, b) => a.room_id.localeCompare(b.room_id));
        break;
      case 'free_slots':
        this.filteredRooms.sort((a, b) => {
          // Sort by total free time (descending)
          const aFreeTime = a.free_slots.reduce((total: number, slot: any) => {
            const start = this.timeToMinutes(slot.start);
            const end = this.timeToMinutes(slot.end);
            return total + (end - start);
          }, 0);
          
          const bFreeTime = b.free_slots.reduce((total: number, slot: any) => {
            const start = this.timeToMinutes(slot.start);
            const end = this.timeToMinutes(slot.end);
            return total + (end - start);
          }, 0);
          
          return bFreeTime - aFreeTime; // Descending order
        });
        break;
      case 'department':
        this.filteredRooms.sort((a, b) => {
          const aDept = a.department || 'Unknown';
          const bDept = b.department || 'Unknown';
          return aDept.localeCompare(bDept);
        });
        break;
    }
    
    this.updateDisplayedRooms();
  }
  
  timeToMinutes(timeStr: string): number {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  }
  
  // Room selection and inject schedule methods
  selectRoom(room: any) {
    this.selectedRoom = room;
    
    // Set up the inject schedule form with room details
    this.injectScheduleForm.patchValue({
      roomId: room.room_id,
      day: this.form.get('day')?.value || '',
      date: this.getCurrentDate()
    });
    
    // Set available time slots from the selected room
    this.availableTimeSlots = [...room.free_slots];
    
    // Show the modal
    this.showRoomSelectionModal = true;
  }
  
  closeRoomSelectionModal() {
    this.showRoomSelectionModal = false;
    this.selectedRoom = null;
    this.injectScheduleForm.reset();
    this.endTimeOptions = [];
  }
  
  updateEndTimeOptions() {
    const selectedStartTime = this.injectScheduleForm.get('startTime')?.value;
    if (!selectedStartTime) {
      this.endTimeOptions = [];
      return;
    }
    
    // Find the selected time slot
    const selectedSlot = this.availableTimeSlots.find(slot => slot.start === selectedStartTime);
    if (!selectedSlot) {
      this.endTimeOptions = [];
      return;
    }
    
    // Generate possible end times after the start time
    const startMinutes = this.timeToMinutes(selectedStartTime);
    const endMinutes = this.timeToMinutes(selectedSlot.end);
    
    // Create end time options in 15-minute increments
    const endTimes: string[] = [];
    for (let mins = startMinutes + 15; mins <= endMinutes; mins += 15) {
      const hours = Math.floor(mins / 60);
      const minutes = mins % 60;
      endTimes.push(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`);
    }
    
    // Add the slot end time if it's not already included
    if (!endTimes.includes(selectedSlot.end)) {
      endTimes.push(selectedSlot.end);
    }
    
    this.endTimeOptions = endTimes.sort();
    
    // Reset end time if it's no longer valid
    const currentEndTime = this.injectScheduleForm.get('endTime')?.value;
    if (currentEndTime && !this.endTimeOptions.includes(currentEndTime)) {
      this.injectScheduleForm.get('endTime')?.setValue('');
    }
  }
  
  injectScheduleForSelectedRoom() {
    if (this.injectScheduleForm.invalid) {
      this.snackBar.open('Please fill in all required fields.', 'Close', { duration: 3000 });
      return;
    }
    
    this.injectLoading = true;
    
    const formValue = this.injectScheduleForm.value;
    
    this.resourceService.injectSchedule(
      formValue.roomId,
      formValue.date || this.getCurrentDate(),
      formValue.startTime,
      formValue.endTime,
      formValue.day,
      {
        course: formValue.course || '',
        department: formValue.department || '',
        lecturer: formValue.lecturer || '',
        year: formValue.level || ''
      }
    ).subscribe({
      next: (response: InjectScheduleResponse) => {
        this.results = response;
        this.snackBar.open(`Schedule added successfully! ID: ${response.schedule_id}`, 'Close', { duration: 3000 });
        this.injectLoading = false;
        this.closeRoomSelectionModal();
        
        // Refresh data
        this.refreshData(formValue.roomId);
        
        // Switch to inject-schedule tab to show the result
        this.onTabChange(2); // 2 is the index for inject-schedule tab
      },
      error: (error) => {
        this.handleApiError(error, 'Failed to add schedule');
      }
    });
  }
}