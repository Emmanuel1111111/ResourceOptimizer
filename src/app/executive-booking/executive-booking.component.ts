import { Component, OnInit, ViewEncapsulation, ChangeDetectorRef } from '@angular/core';
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
  showConflictedRooms: boolean = false;
  
  // Room selection modal
  showRoomSelectionModal: boolean = false;
  selectedRoom: any = null;
  injectScheduleForm: FormGroup;
  injectLoading: boolean = false;
  availableTimeSlots: any[] = [];
  endTimeOptions: string[] = [];
  

  scheduleSearchForm: FormGroup;
  foundSchedules: ExistingSchedule[] = [];
  selectedSchedule: ExistingSchedule | null = null;
  scheduleSearchLoading: boolean = false;
  showMultipleSchedulesModal: boolean = false;
  multipleScheduleOptions: any[] = [];
  
 
  dbConnectionError: boolean = false;
  dbErrorMessage: string = '';
  showTroubleshootingGuide: boolean = false;
  
  
  dayOptions: string[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
   tabs = ['Check Overlap', 'Suggest Rooms', 'Inject Schedule', 'Reallocate'];

  constructor(
    private fb: FormBuilder,
    private resourceService: ResourceManagementService,
    private authService: AuthService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private cdr: ChangeDetectorRef
  ) {
     
    this.form = this.fb.group({
      roomId: ['', Validators.required],
      date: [''],
      startTime: [''], 
      endTime: [''], 
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
    this.updateFormValidators(); 
    

    this.snackBar.open(
      'Day-based scheduling is prioritized. Date is used as fallback only.',
      'Got it',
      { duration: 5000, verticalPosition: 'top' }
    );
  }

  
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
            id: schedule._id || (schedule['Room ID'] + '_' + schedule.Start + '_' + schedule.Course), // Use MongoDB _id if available, fallback to composite
            room_id: schedule['Room ID'],
            course: schedule.Course || 'Unknown',
            day: schedule.Day || 'Unknown',
            start: schedule.Start || '',
            end: schedule.End || '',
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


  selectScheduleForReallocation(schedule: ExistingSchedule) {
    this.selectedSchedule = schedule;

 
    this.form.patchValue({
      scheduleId: schedule.room_id, // Use the actual room_id from the selected schedule
      roomId: '', // Clear the new room ID field (user will enter new room if needed)
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
  

  retryDatabaseConnection() {
    this.loading = true;
    this.checkDatabaseStatus();
    
    
    setTimeout(() => {
      this.loading = false;
    }, 1500);
  }

  executeOperation(operation: string) {
    this.loading = true;
    const { roomId, date, startTime, endTime, day, scheduleId, course, department, lecturer, level} = this.form.value;

   
    if ((startTime && !this.resourceService.validateTimeFormat(startTime)) || (endTime && !this.resourceService.validateTimeFormat(endTime))) {
      this.snackBar.open('Invalid time format. Please use HH:MM.', 'Close', { duration: 3000 });
      this.loading = false;
      return;
    }
    
   
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
      this.loading = true;
    this.results = null;

    const roomData = { room_id: roomId, date, start: startTime, end: endTime, day };
    
    console.log(`Performing ${operation} operation with data:`, roomData);

    switch (operation) {
      case 'check_overlap':
        this.resourceService.checkOverlap(roomId, date, startTime, endTime, day).subscribe({
          next: (response) => {
          this.results = response;
            this.processOverlapAnalysis(response);
            this.handleBookingOperation(operation, roomData, response);
            this.snackBar.open('Overlap check completed successfully!', 'Close', { duration: 3000 });
        },
        error: (error) => {
            this.handleApiError(error, 'Failed to check overlap');
          },
          complete: () => {
            this.loading = false;
          }
        });
        break;

      case 'suggest_rooms':
        // Reset room display state before new request
        this.resetRoomDisplay();

        this.resourceService.suggestRooms(date, startTime, endTime, day).subscribe({
          next: (response) => {
            this.results = response;
            this.handleBookingOperation(operation, roomData, response);

            // CRITICAL FIX: Initialize room display arrays immediately after API response
            this.initializeRoomDisplay();

            // Enhanced success messaging based on results
            if (response['status'] === 'warning') {
              this.snackBar.open(response['message'] || 'Warning occurred', 'Close', {
                duration: 5000,
                panelClass: ['warning-snackbar']
              });
            } else if (response['total_available'] === 0) {
              this.snackBar.open('No available rooms found for the requested time slot', 'Close', {
                duration: 4000,
                panelClass: ['warning-snackbar']
              });
            } else {
              this.snackBar.open(
                `Found ${response['total_available'] || 0} available rooms!`,
                'Close',
                { duration: 3000 }
              );
            }
          },
          error: (error) => {
            this.handleApiError(error, 'Failed to suggest rooms');
          },
          complete: () => {
          this.loading = false;
          }
        });
        break;

      case 'inject_schedule':
        this.resourceService.injectSchedule(roomId, date, startTime, endTime, day, {
          course: course,
          department: department,
          lecturer: lecturer,
          level: level
        }).subscribe({
          next: (response: InjectScheduleResponse) => {
            this.results = response;
            this.snackBar.open(`Schedule added successfully! ID: ${response.schedule_id}`, 'Close', { duration: 3000 });
            this.injectLoading = false;
            this.closeRoomSelectionModal();
            
            // Refresh data
            this.refreshData(roomId);
            
            // Switch to inject-schedule tab to show the result
            this.onTabChange(2); // 2 is the index for inject-schedule tab
          },
          error: (error) => {
            this.handleApiError(error, 'Failed to add schedule');
          }
        });
        break;

      case 'reallocate':
        // Include original schedule details for unique identification
        const originalScheduleDetails = this.selectedSchedule ? {
          original_day: this.selectedSchedule.day,
          original_start_time: this.selectedSchedule.start,
          original_end_time: this.selectedSchedule.end,
          original_course: this.selectedSchedule.course
        } : {};

        // Build new schedule object with only non-empty fields
        const newSchedule: any = {};
        if (roomId) newSchedule.room_id = roomId;
        if (date) newSchedule.date = date;
        if (startTime) newSchedule.start_time = startTime;
        if (endTime) newSchedule.end_time = endTime;
        if (day) newSchedule.day = day;

        // Add other fields from the form if they have values
        if (course) newSchedule.course = course;
        if (department) newSchedule.department = department;
        if (lecturer) newSchedule.lecturer = lecturer;
        if (level) newSchedule.year = level;

        this.resourceService.reallocateSchedule(scheduleId, newSchedule, originalScheduleDetails).subscribe({
          next: (response) => {
            this.results = response;
            this.handleBookingOperation(operation, roomData, response);
            this.snackBar.open('Schedule reallocated successfully!', 'Close', { duration: 3000 });
          },
          error: (error) => {
            this.handleApiError(error, 'Failed to reallocate schedule');
          },
          complete: () => {
            this.loading = false;
          }
        });
        break;

      default:
          this.loading = false;
        this.snackBar.open('Unknown operation', 'Close', { duration: 3000 });
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
  

  // CRITICAL FIX: Initialize room display after API response
  initializeRoomDisplay() {
    console.log('🔄 Initializing room display after API response...');

    // Reset search query to show all rooms initially
    this.roomSearchQuery = '';

    // Populate filteredRooms with all suggested rooms
    if (this.results && this.results.suggested_rooms) {
      this.filteredRooms = [...this.results.suggested_rooms];
      console.log(`📋 Populated filteredRooms with ${this.filteredRooms.length} rooms`);
    } else {
      this.filteredRooms = [];
      console.log('⚠️ No suggested rooms found in API response');
    }

    // Apply initial sorting
    this.sortRooms();

    // Initialize pagination and display
    this.initializePagination();

    // Force Angular change detection to update the view
    this.cdr.detectChanges();

    console.log(`✅ Room display initialized: ${this.displayedRooms.length} rooms ready for display`);
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

    console.log(`📄 Page ${this.currentPage}/${this.totalPages}: Displaying rooms ${startIndex + 1}-${endIndex} of ${this.filteredRooms.length} total`);
    console.log(`🎯 DisplayedRooms array now contains ${this.displayedRooms.length} rooms:`,
                this.displayedRooms.map(r => r.room_id));
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
    console.log('🔍 Filtering rooms with query:', this.roomSearchQuery);

    if (!this.results || !this.results.suggested_rooms) {
      console.log('⚠️ No results or suggested_rooms available for filtering');
      this.filteredRooms = [];
      this.displayedRooms = [];
      return;
    }
    
    if (this.roomSearchQuery.trim() === '') {
      this.filteredRooms = [...this.results.suggested_rooms];
      console.log(`📋 Showing all ${this.filteredRooms.length} rooms (no filter)`);
    } else {
      const query = this.roomSearchQuery.toLowerCase();
      this.filteredRooms = this.results.suggested_rooms.filter((room: any) => {
        return room.room_id.toLowerCase().includes(query) || 
               (room.department && room.department.toLowerCase().includes(query));
      });
      console.log(`🔍 Filtered to ${this.filteredRooms.length} rooms matching "${query}"`);
    } 
    
    // Apply sorting
    this.sortRooms();
    
    // Reset pagination
    this.initializePagination();
  }
  
  sortRooms() {
    console.log(`🔄 Sorting ${this.filteredRooms.length} rooms by: ${this.roomSortOption}`);

    switch (this.roomSortOption) {
      case 'room_id':
        this.filteredRooms.sort((a, b) => a.room_id.localeCompare(b.room_id));
        break;
      case 'free_slots':
        this.filteredRooms.sort((a, b) => {
          // Sort by total free time (descending)
          const aFreeTime = a.free_slots ? a.free_slots.reduce((total: number, slot: any) => {
            const start = this.timeToMinutes(slot.start);
            const end = this.timeToMinutes(slot.end);
            return total + (end - start);
          }, 0) : 0;
          
          const bFreeTime = b.free_slots ? b.free_slots.reduce((total: number, slot: any) => {
            const start = this.timeToMinutes(slot.start);
            const end = this.timeToMinutes(slot.end);
            return total + (end - start);
          }, 0) : 0;
          
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
    console.log(`✅ Sorting complete. DisplayedRooms updated with ${this.displayedRooms.length} rooms`);
  }
  
  timeToMinutes(timeStr: string): number {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  }

  // TrackBy function for better *ngFor performance
  trackByRoomId(index: number, room: any): string {
    return room.room_id || index.toString();
  }

  // Reset room display state
  resetRoomDisplay() {
    console.log('🔄 Resetting room display state...');
    this.filteredRooms = [];
    this.displayedRooms = [];
    this.roomSearchQuery = '';
    this.currentPage = 1;
    this.totalPages = 1;
    this.showConflictedRooms = false;
    console.log('✅ Room display state reset');
  }

  // Debug method to check room display state
  debugRoomDisplay() {
    console.log('🔍 DEBUG: Room Display State');
    console.log('Results:', this.results);
    console.log('Suggested Rooms:', this.results?.suggested_rooms);
    console.log('Filtered Rooms:', this.filteredRooms);
    console.log('Displayed Rooms:', this.displayedRooms);
    console.log('Current Page:', this.currentPage);
    console.log('Total Pages:', this.totalPages);
    console.log('Search Query:', this.roomSearchQuery);

    // Force re-initialization if we have results but no displayed rooms
    if (this.results?.suggested_rooms?.length > 0 && this.displayedRooms.length === 0) {
      console.log('🔧 Forcing room display re-initialization...');
      this.initializeRoomDisplay();
    }
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

  // Enhanced processing for overlap analysis results
  processOverlapAnalysis(response: any): void {
    // Add visual indicators for overlap severity
    if (response.overlap_analysis?.overlapping_pairs) {
      response.overlap_analysis.overlapping_pairs.forEach((pair: any) => {
        pair.severity_color = this.getSeverityColor(pair.conflict_severity);
        pair.severity_icon = this.getSeverityIcon(pair.conflict_severity);
      });
    }
    
    // Process utilization status
    if (response.utilization_analysis) {
      const utilization = response.utilization_analysis;
      utilization.status_color = this.getUtilizationColor(utilization.utilization_percentage);
      utilization.status_icon = this.getUtilizationIcon(utilization.utilization_percentage);
    }
    
    // Sort free slots by duration for better display
    if (response.free_time_analysis?.free_slots) {
      response.free_time_analysis.free_slots.sort((a: any, b: any) => {
        const aDuration = this.timeToMinutes(a.end) - this.timeToMinutes(a.start);
        const bDuration = this.timeToMinutes(b.end) - this.timeToMinutes(b.start);
        return bDuration - aDuration; // Sort by duration descending
      });
    }
  }
  
  createAnalysisSummary(response: any): string {
    const schedule = response.schedule_summary;
    const overlap = response.overlap_analysis;
    const utilization = response.utilization_analysis;
    
    let summary = `📊 Analysis: ${schedule?.total_schedules || 0} schedules`;
    
    if (overlap?.has_overlaps) {
      summary += ` | 🚨 ${overlap.total_conflicts} conflicts`;
    } else {
      summary += ` | ✅ No conflicts`;
    }
    
    if (utilization?.utilization_percentage !== undefined) {
      summary += ` | 📈 ${utilization.utilization_percentage}% utilized`;
    }
    
    return summary;
  }
  
  getSeverityColor(severity: string): string {
    switch (severity?.toLowerCase()) {
      case 'high': return '#dc3545'; // Red
      case 'medium': return '#fd7e14'; // Orange  
      case 'low': return '#ffc107'; // Yellow
      default: return '#6c757d'; // Gray
    }
  }
  
  getSeverityIcon(severity: string): string {
    switch (severity?.toLowerCase()) {
      case 'high': return '🚨';
      case 'medium': return '⚠️';
      case 'low': return '⚡';
      default: return 'ℹ️';
    }
  }
  
  getUtilizationColor(percentage: number): string {
    if (percentage >= 85) return '#dc3545'; // Red - over-utilized
    if (percentage >= 65) return '#28a745'; // Green - optimal
    if (percentage >= 40) return '#ffc107'; // Yellow - moderate
    return '#17a2b8'; // Blue - under-utilized
  }
  
  getUtilizationIcon(percentage: number): string {
    if (percentage >= 85) return '🔴';
    if (percentage >= 65) return '🟢';
    if (percentage >= 40) return '🟡';
    return '🔵';
  }
  
  // Helper method to format time ranges nicely
  formatTimeRange(start: string, end: string): string {
    return `${start}–${end}`;
  }
  
  // Helper method to get conflict count for a specific course
  getConflictCount(courseName: string): number {
    if (!this.results?.overlap_analysis?.overlapping_pairs) return 0;
    
    return this.results.overlap_analysis.overlapping_pairs.filter((pair: any) => 
      pair.schedule1.course === courseName || pair.schedule2.course === courseName
    ).length;
  }

  // Update form validators based on active tab
  updateFormValidators() {
    const startTimeControl = this.form.get('startTime');
    const endTimeControl = this.form.get('endTime');
    
    if (this.activeTab === 'Check Overlap') {
      // For check overlap, times are optional (comprehensive analysis)
      startTimeControl?.clearValidators();
      endTimeControl?.clearValidators();
    } else {
      // For other operations, times are required
      startTimeControl?.setValidators([Validators.required]);
      endTimeControl?.setValidators([Validators.required]);
    }
    
    // Update validity
    startTimeControl?.updateValueAndValidity();
    endTimeControl?.updateValueAndValidity();
  }

  // Override setActiveTab to update validators
  setActiveTab(tab: string) {
    this.activeTab = tab;
    this.updateFormValidators();
    
 
    this.results = null;
    this.filteredRooms = [];
    this.foundSchedules = [];
    this.selectedSchedule = null;
    this.showRoomSelectionModal = false;
    this.showMultipleSchedulesModal = false;
    
    // Reset form for clean state
    this.form.reset();
    this.form.patchValue({
      roomId: '',
      date: '',
      startTime: '',
      endTime: '',
      day: '',
      scheduleId: '',
      course: '',
      department: '',
      lecturer: '',
      level: '',
      program: ''
    });
  }

  private createNotification(type: string, title: string, message: string, data: any = {}): void {
    // Create notification for admin users
    const notificationData = {
      type: type,
      title: title,
      message: message,
      data: data
    };

    // Send notification to backend
    this.resourceService.createNotification(notificationData).subscribe({
      next: (response) => {
        console.log('Notification created:', response);
      },
      error: (error) => {
        console.error('Error creating notification:', error);
      }
    });
  }

  private handleBookingOperation(operation: string, roomData: any, result: any): void {
    let notificationType = '';
    let notificationTitle = '';
    let notificationMessage = '';

    switch (operation) {
      case 'check_overlap':
        notificationType = 'booking_created';
        notificationTitle = 'Overlap Check Completed';
        notificationMessage = `Overlap analysis completed for ${roomData.room_id}`;
        break;
      case 'suggest_rooms':
        notificationType = 'booking_updated';
        notificationTitle = 'Room Suggestions Generated';
        notificationMessage = `Room suggestions generated for ${result.suggested_rooms?.length || 0} rooms`;
        break;
      case 'inject_schedule':
        notificationType = 'booking_created';
        notificationTitle = 'Schedule Injected';
        notificationMessage = `Schedule successfully injected for ${roomData.room_id}`;
        break;
      case 'reallocate':
        notificationType = 'booking_updated';
        notificationTitle = 'Schedule Reallocated';
        notificationMessage = `Schedule reallocated for ${roomData.room_id}`;
        break;
    }

    if (notificationType) {
      this.createNotification(notificationType, notificationTitle, notificationMessage, {
        room_id: roomData.room_id,
        operation: operation,
        result: result
      });
    }
  }
}