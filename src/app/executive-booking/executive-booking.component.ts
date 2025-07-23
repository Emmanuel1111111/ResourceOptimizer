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
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
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

// Interface for schedule search results
interface ExistingSchedule {
  id: string;
  room_id: string;
  course: string;
  day: string;
  start: string;
  end: string;
  lecturer: string;
  department: string;
  date?: string;
}



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
  
  // Reallocate functionality
  scheduleSearchForm: FormGroup;
  foundSchedules: ExistingSchedule[] = [];
  selectedSchedule: ExistingSchedule | null = null;
  scheduleSearchLoading: boolean = false;
  showMultipleSchedulesModal: boolean = false;
  multipleScheduleOptions: any[] = [];
  
  // Database connection status
  dbConnectionError: boolean = false;
  dbErrorMessage: string = '';
  showTroubleshootingGuide: boolean = false;
  
  // Day options for dropdowns (Day-based scheduling priority)
  dayOptions: string[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
   tabs = ['Check Overlap', 'Suggest Rooms', 'Inject Schedule', 'Reallocate'];

  constructor(
    private fb: FormBuilder,
    private resourceService: ResourceManagementService,
    private authService: AuthService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {
    // Main operation form (day-based priority)
    this.form = this.fb.group({
      roomId: ['', Validators.required],
      date: [''], // Optional - fallback for day-based scheduling
      startTime: ['', Validators.required],
      endTime: ['', Validators.required],
      day: ['', Validators.required], // Required - day-based scheduling priority
      scheduleId: [''],
      course: [''],
      department: [''],
      lecturer: [''],
      level: [''],
      program: ['']
    });
    
    // Enhanced inject schedule form
    this.injectScheduleForm = this.fb.group({
      roomId: ['', Validators.required],
      date: [''], // Optional
      startTime: ['', Validators.required],
      endTime: ['', Validators.required],
      day: ['', Validators.required], // Required
      course: ['', Validators.required],
      department: ['', Validators.required],
      lecturer: [''],
      level: ['', Validators.required]
    });
    
    // Schedule search form for reallocate
    this.scheduleSearchForm = this.fb.group({
      searchQuery: [''],
      roomId: [''],
      day: [''],
      course: ['']
    });
    
    this.timeOptions = this.getTimeOptions();
  }

  ngOnInit() {
    this.activeTab = 'Check Overlap';
    this.checkDatabaseStatus();
    
    // Show day-based scheduling info
    this.snackBar.open(
      'Day-based scheduling is prioritized. Date is used as fallback only.',
      'Got it',
      { duration: 5000, verticalPosition: 'top' }
    );
  }

  // Enhanced search for existing schedules (for reallocate operation)
  searchExistingSchedules() {
    const { searchQuery, roomId, day, course } = this.scheduleSearchForm.value;
    
    if (!searchQuery && !roomId && !day && !course) {
      this.foundSchedules = [];
      return;
    }

    this.scheduleSearchLoading = true;
    
    this.resourceService.searchSchedules(searchQuery, roomId, day, course).subscribe({
      next: (response: any) => {
        if (response.schedules) {
          this.foundSchedules = response.schedules.map((schedule: any) => ({
            id: schedule['Room ID'] + '_' + schedule.Start + '_' + schedule.Course,
            room_id: schedule['Room ID'],
            course: schedule.Course || 'Unknown',
            day: schedule.Day || 'Unknown',
            start: schedule.Start || '',
            end: schedule.End || '',
            // Fixed: Use 'Instructor' field from database, not 'Lecturer'
            lecturer: schedule.Instructor || 'Unknown',
            department: schedule.Department || 'Unknown',
            date: schedule.Date
          }));
        } else {
          this.foundSchedules = [];
        }
        this.scheduleSearchLoading = false;
      },
      error: (error) => {
        this.handleApiError(error, 'Failed to search schedules');
        this.scheduleSearchLoading = false;
      }
    });
  }

  // Select schedule for reallocation
  selectScheduleForReallocation(schedule: ExistingSchedule) {
    this.selectedSchedule = schedule;
    
    // Pre-populate form with current schedule details
    this.form.patchValue({
      roomId: '', // New room ID to be filled by user
      day: schedule.day,
      startTime: schedule.start,
      endTime: schedule.end,
      course: schedule.course,
      lecturer: schedule.lecturer,
      department: schedule.department
    });
    
    this.snackBar.open(
      `Selected schedule: ${schedule.course} in ${schedule.room_id}`,
      'Continue',
      { duration: 3000 }
    );
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
        
        
        this.performOperation(operation, roomId, date, startTime, endTime, day, scheduleId, course, department, lecturer, level);
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
                   lecturer: string, level: string) {
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
        // Enhanced validation for suggest_rooms
        if (!startTime || !endTime || !day) {
          this.snackBar.open('Please fill in day, start time, and end time.', 'Close', { duration: 3000 });
          this.loading = false;
          return;
        }
        
        // Validate time formats
        const timePattern = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
        if (!timePattern.test(startTime)) {
          this.snackBar.open('Invalid start time format. Use HH:MM (e.g., 09:00)', 'Close', { duration: 4000 });
          this.loading = false;
          return;
        }
        
        if (!timePattern.test(endTime)) {
          this.snackBar.open('Invalid end time format. Use HH:MM (e.g., 11:00)', 'Close', { duration: 4000 });
          this.loading = false;
          return;
        }
        
        // Validate that end time is after start time
        const startMinutes = this.timeToMinutes(startTime);
        const endMinutes = this.timeToMinutes(endTime);
        
        if (endMinutes <= startMinutes) {
          this.snackBar.open('End time must be after start time.', 'Close', { duration: 4000 });
          this.loading = false;
          return;
        }
        
        // Validate reasonable duration (minimum 15 minutes, maximum 12 hours)
        const durationMinutes = endMinutes - startMinutes;
        if (durationMinutes < 15) {
          this.snackBar.open('Minimum booking duration is 15 minutes.', 'Close', { duration: 4000 });
          this.loading = false;
          return;
        }
        
        if (durationMinutes > 12 * 60) {
          this.snackBar.open('Maximum booking duration is 12 hours.', 'Close', { duration: 4000 });
          this.loading = false;
          return;
        }
        
        // Validate business hours (basic check - can be made configurable)
        const businessStart = this.timeToMinutes('08:00');
        const businessEnd = this.timeToMinutes('20:00');
        
        if (startMinutes < businessStart || endMinutes > businessEnd) {
          this.snackBar.open(
            `Requested time is outside typical business hours (08:00-20:00). Continuing with request...`, 
            'Close', 
            { duration: 5000 }
          );
        }
        
        // Date is optional for suggest_rooms
        this.resourceService.suggestRooms(date || null, startTime, endTime, day, roomId).subscribe({
          next: (response: SuggestRoomsResponse) => {
            this.results = response;
            
            // Enhanced processing for improved backend response
            if (response.suggested_rooms) {
              // Sort rooms by availability and total free time
              response.suggested_rooms.sort((a, b) => {
                const aTotalFree = this.calculateTotalFreeTime(a.free_slots);
                const bTotalFree = this.calculateTotalFreeTime(b.free_slots);
                return bTotalFree - aTotalFree;
              });
            }
            
            // Initialize pagination for room suggestions
            this.filteredRooms = [...(response.suggested_rooms || [])];
            this.initializePagination();
            
            // Show additional information if available
            if (response.conflicted_rooms && response.conflicted_rooms.length > 0) {
              this.snackBar.open(
                `Found ${response.total_available} available rooms. ${response.total_conflicted} rooms have conflicts.`, 
                'Close', 
                { duration: 6000 }
              );
            }
            
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
        
        // Fixed field mapping for inject schedule (day-based priority)
        this.resourceService.injectSchedule(
          roomId, 
          date || this.getCurrentDate(), 
          startTime, 
          endTime, 
          day, 
          { 
            course: course || '', 
            department: department || '', 
            lecturer: lecturer || '', // This will be mapped to 'instructor' in service
            year: level || '' // This will be mapped correctly in service
          }
        ).subscribe({
          next: (response: InjectScheduleResponse) => {
            this.results = response;
            this.snackBar.open(`Schedule added successfully! ID: ${response.schedule_id}`, 'Close', { duration: 3000 });
            this.loading = false;
            
            if (response.refreshed_data) {
              console.log('Received refreshed data from backend:', response.refreshed_data);
              if (response.refreshed_data.daily_utilization) {
                this.dailyUtilization = response.refreshed_data.daily_utilization;
              }
              
              this.results = {
                ...this.results,
                refreshed_data: {
                  daily_utilization: this.dailyUtilization,
                  all_schedules: []
                }
              };
              
              this.fetchAllSchedules(roomId);
            } else {
              this.refreshData(roomId);
            }
          },
          error: (error) => {
            this.handleApiError(error, 'Failed to add schedule');
          }
        });
        break;

      case 'reallocate':
        if (!this.selectedSchedule) {
          this.snackBar.open('Please select a schedule to reallocate first.', 'Close', { duration: 3000 });
          this.loading = false;
          return;
        }

        // Build new schedule with only filled fields (partial update support)
        const newSchedule: any = {};
        
        // Only add fields that are actually filled in the form
        if (roomId) newSchedule.room_id = roomId;
        if (date) newSchedule.date = date;
        if (startTime) newSchedule.start_time = startTime;
        if (endTime) newSchedule.end_time = endTime;
        if (day) newSchedule.day = day;
        if (course) newSchedule.course = course;
        if (department) newSchedule.department = department;
        if (lecturer) newSchedule.lecturer = lecturer;
        if (level) newSchedule.year = level;
        
        // Validate that at least one field is being updated
        if (Object.keys(newSchedule).length === 0) {
          this.snackBar.open('Please fill in at least one field to update.', 'Close', { duration: 3000 });
          this.loading = false;
          return;
        }

        const originalDetails = {
          original_day: this.selectedSchedule.day,
          original_start_time: this.selectedSchedule.start,
          original_end_time: this.selectedSchedule.end,
          original_course: this.selectedSchedule.course
        };

        this.resourceService.reallocateSchedule(this.selectedSchedule.room_id, newSchedule, originalDetails).subscribe({
          next: (response: any) => {
            this.results = response;
            this.snackBar.open('Schedule reallocated successfully!', 'Close', { duration: 3000 });
            this.loading = false;
            this.selectedSchedule = null;
            this.foundSchedules = [];
            this.scheduleSearchForm.reset();
          },
          error: (error) => {
            // Handle multiple schedule matches
            if (error.error?.matching_schedules) {
              this.showMultipleScheduleOptions(error.error.matching_schedules);
            } else {
              this.handleApiError(error, 'Failed to reallocate schedule');
            }
          }
        });
        break;
    }
  }

  // Handle multiple schedule matches
  showMultipleScheduleOptions(schedules: any[]) {
    this.multipleScheduleOptions = schedules;
    this.showMultipleSchedulesModal = true;
    this.loading = false;
  }

  selectSpecificSchedule(schedule: any) {
    this.selectedSchedule = {
      id: schedule.room_id + '_' + schedule.time + '_' + schedule.course,
      room_id: schedule.room_id,
      course: schedule.course,
      day: schedule.day,
      start: schedule.time.split('-')[0],
      end: schedule.time.split('-')[1],
      // Fixed: Use correct field mapping for lecturer
      lecturer: schedule.lecturer || 'Unknown',
      department: schedule.department || 'Unknown'
    };
    
    this.showMultipleSchedulesModal = false;
    this.snackBar.open(`Selected specific schedule: ${schedule.course}`, 'Continue', { duration: 3000 });
  }

  // Helper method to handle API errors
  handleApiError(error: any, defaultMessage: string) {
    console.error('API Error:', error);
    
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
    this.scheduleSearchLoading = false;
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
    
    // Clear reallocate-specific data when switching tabs
    if (this.activeTab !== 'Reallocate') {
      this.selectedSchedule = null;
      this.foundSchedules = [];
      this.scheduleSearchForm.reset();
    }
    
    // Show specific guidance for reallocate tab
    if (this.activeTab === 'Reallocate') {
      this.snackBar.open(
        'Step 1: Search and select the schedule to move. Step 2: Set new location and time.',
        'Got it',
        { duration: 8000, verticalPosition: 'top' }
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

  calculateTotalFreeTime(freeSlots: any[]): number {
    return freeSlots.reduce((total: number, slot: any) => {
      const start = this.timeToMinutes(slot.start);
      const end = this.timeToMinutes(slot.end);
      return total + (end - start);
    }, 0);
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