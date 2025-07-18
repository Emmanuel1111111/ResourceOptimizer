import { Component, OnInit, ViewChild, ElementRef, AfterViewInit, OnDestroy } from '@angular/core';
import { AuthService } from '../service.service';
import { RoomAvailabilityRespone, WeeklyUtilization, Room, DailyUtilization, CurrentSchedule } from '../../Environ';
import { Chart } from 'chart.js/auto';
import * as AFrame from 'aframe';
import { gsap } from 'gsap';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { NgModule } from '@angular/core';
import { library } from '@fortawesome/fontawesome-svg-core';
import { faHome, faChartBar, faCalendar } from '@fortawesome/free-solid-svg-icons';
import { Router, ActivatedRoute } from '@angular/router';
import { UserInfo } from '../../Environ';  
import { registerables } from 'chart.js';
Chart.register(...registerables);

@Component({
  selector: 'app-adjust-schedules',
  templateUrl: './adjust-schedules.component.html',
  styleUrls: ['./adjust-schedules.component.css'],
})
export class AdjustSchedulesComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('barCanvas') barCanvas!: ElementRef<HTMLCanvasElement>;
  private chart: Chart<'bar'> | null = null;
  
  
  selectedRoom: any = null;
  rooms: any[] = [];
  availableRooms: any[] = [];
  filteredRooms: any[] = [];
  dailyUtilization: any[] = [];
  filteredDailyUtilization: any[] = [];
  weekly_summary: any[] = [];
  allSchedules: any[] = [];
  utilizationColumns: string[] = ['Day', 'Room ID', 'Daily Utilization', 'Time Slot', 'Courses', 'Department', 'Status', 'Year'];
  scheduleColumns: string[] = ['Day', 'Course', 'Time', 'Department', 'Year', 'Status'];
  currentTimeMatches: any[] = [];
  isLoading: boolean = false;
  isLoadingSchedules: boolean = false;
  error_masssage: string = '';
  scheduleError: string = '';
  searchQuery: string = '';
  user: any =''
  isOpened: boolean = false;
  userId: string = localStorage.getItem('userId') || '';
  chatMessages: { sender: string; text: string }[] = [];
  chatInput: string = '';
  isMobile: boolean = /Mobi|Android/i.test(navigator.userAgent);
  displayedColumns: string[] = [
    'Room ID',
    'Course',
    'Time',
    'Year',
    'Department',
  ];
  sidebarCollapsed: boolean = false;
  private searchSubject = new Subject<string>();

  private dayOrder: { [key: string]: number } = {
    'Monday': 1,
    'Tuesday': 2,
    'Wednesday': 3,
    'Thursday': 4,
    'Friday': 5
  };

  constructor(private service: AuthService, private router: Router, private route: ActivatedRoute) {
    this.searchSubject
      .pipe(
        debounceTime(1000),
        distinctUntilChanged())
      .subscribe((data) => {
        this.fetchSchedules(data);
      });
  }

  ngOnInit(): void {
    // Initialize user with default values to prevent undefined errors
    this.user = { username: 'User' };
    
    this.service.getUsers().subscribe({
      next: (data:any) => {
        if (Array.isArray(data) && data.length > 0) {
          const foundUser = data.find((x:any) => x.user_id === this.userId);
          if (foundUser) {
            this.user = foundUser;
          }
        }
        console.log('User Info:', this.user);
      },
      error: (err) => {
        console.error('Error fetching user info:', err);
       
        if (err.status !== 401 && err.status !== 422) {
          this.error_masssage = 'Failed to load user information. Please try again.';
        }
      }
    });

    this.service.getAvailableRooms().subscribe({
      next: (data) => {
        this.rooms = data.rooms;
        this.availableRooms = data.rooms; 
        this.filteredRooms = data.rooms; 
        if (this.rooms.length > 0 && !this.selectedRoom) {
          this.selectedRoom = this.rooms[0];
          this.loadRoomData();
        }
      },
      error: (err) => {
        console.error('Error fetching rooms:', err);
        this.error_masssage = 'Failed to load rooms. Please try again.';
      }
    });
    this.fetchSchedules('SCB-TF34')
  }

  ngAfterViewInit() {
    gsap.from('.room-card', { opacity: 0, y: 50, duration: 3, stagger: 0.1 });
    gsap.from('.fancy-card', { opacity: 0, y: 20, duration: 3, stagger: 0.2 });
    gsap.from('.conveyor ', { opacity: 0, y: 20, duration: 3, stagger: 0.1 });
      
   
  }

  ngOnDestroy() {
    if (this.chart) {
      this.chart.destroy();
    }
  }

  fetchSchedules(roomId: string) {
    this.isLoading = true;
    this.error_masssage = '';
    this.service.getAvailableRooms(roomId).subscribe({
      next: (data: RoomAvailabilityRespone) => {
        console.log('API Response:', data);
        this.dailyUtilization = data.daily_utilization;
        this.weekly_summary = data.weekly_summary;
    
       
        this.currentTimeMatches = data.current_time_matches;
        this.filteredRooms = [data.room_status];
        this.selectedRoom = data.room_status;
        
        this.initializeBarGraph();
        this.filterDailyUtilization();
        this.fetchAllSchedules(roomId);
      
        this.isLoading = false;
        console.log('Daily Utilization:', this.dailyUtilization);
        console.log('Current Lecture:', this.currentTimeMatches);
        
        
      },
      error: (err) => {
        console.log(`Error fetching schedules ${err}`);
        this.error_masssage = `Failed to load room data for `+ this.searchQuery;
        this.isLoading = false;
        this.chart?.destroy();
        this.dailyUtilization = [];
      },
    });
  }

  searchRoom() {
    if (this.searchQuery?.trim()) {
      this.searchSubject.next(this.searchQuery);
    }
    if(this.error_masssage.length > 0){
      this.chart?.destroy();
    }
  }

  filterRooms() {
    if (!this.searchQuery) {
      this.filteredRooms = this.filteredRooms;
    }
  }

  selectRoom(room: Room) {
    this.selectedRoom = room;
    gsap.to('.room-card', { scale: 1, duration: 0.3 });
    gsap.to('.room-card.active', { scale: 1.1, duration: 0.3 });
    gsap.to('.utilization-table tr', { opacity: 1, x: 0, duration: 0.5, stagger: 0.1 });
    this.updateBarGraph();
    
   
    this.fetchAllSchedules(room['Room ID']);
    this.refreshUtilizationData(room['Room ID']);
  }

  getUtilizationClass(utilization: number): string {
    if (utilization > 80) return 'high-utilization';
    if (utilization > 50) return 'medium-utilization';
    return 'low-utilization';
  }

  
  private sortTimeSlots(a: string, b: string): number {
    const getHours = (timeSlot: string): number => {
      const match = timeSlot.match(/(\d+):(\d+)\s*-\s*(\d+):(\d+)/);
      if (match) {
        return parseInt(match[1]);
      }
      return 0;
    };
    
    return getHours(a) - getHours(b);
  }

  initializeBarGraph() {
    if (this.chart) {
      this.chart.destroy();
    }
    const barData = this.dailyUtilization.reduce((acc, d) => {
      acc[d.Day] = (acc[d.Day] || 0) + d.Daily_Utilization;
      return acc;
    }, {} as { [key: string]: number });
    const labels = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const values = labels.map((day) => barData[day] || 0);
    console.log(values);
    
    this.chart = new Chart(this.barCanvas.nativeElement, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: `Daily Room Demand (%) for ` + this.selectedRoom?.['Room ID'],
            data: values,
            backgroundColor: [
              'rgba(255, 51, 51, 0.7)', // Monday: Red
              'rgba(255, 152, 0, 0.7)', // Tuesday: Orange
              'rgba(51, 204, 51, 0.7)', // Wednesday: Green
              'rgba(0, 247, 255, 0.7)', // Thursday: Cyan
              'rgba(255, 0, 255, 0.7)', // Friday: Pink
            ],
            borderColor: [
              'rgba(255, 51, 51, 1)',
              'rgba(255, 152, 0, 1)',
              'rgba(51, 204, 51, 1)',
              'rgba(0, 247, 255, 1)',
              'rgba(255, 0, 255, 1)',
            ],
            borderWidth: 1,
            barThickness: 40,
          },
        ],
      },
      options: {
        responsive: true,
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Utilization (%)',
              color: 'var(--text-primary)',
              font: { family: 'Inter', size: 14 },
            },
            grid: { color: 'rgba(255, 255, 255, 0.1)' },
            ticks: { color: 'var(--text-secondary)' },
          },
          x: {
            title: {
              display: true,
              text: 'Day',
              color: 'var(--text-primary)',
              font: { family: 'Inter', size: 14 },
            },
            grid: { display: false },
            ticks: { color: 'var(--text-secondary)' },
          },
        },
        plugins: {
          legend: {
            labels: { color: 'var(--text-primary)', font: { family: 'Inter', size: 12 } },
          },
          tooltip: {
            backgroundColor: 'var(--glass-bg)',
            titleColor: 'var(--primary)',
            bodyColor: 'var(--text-primary)',
            borderColor: 'var(--primary)',
            borderWidth: 1,
            cornerRadius: 8,
            padding: 12,
          },
        },
      },
    });
  }

  updateBarGraph() {
    if (!this.chart) return;
    const barData = this.dailyUtilization
      .filter((d) => !this.selectedRoom || d['Room ID'] === this.selectedRoom['Room ID'])
      .reduce((acc, d) => {
        acc[d.Day] = (acc[d.Day] || 0) + d.Daily_Utilization;
        return acc;
      }, {} as { [key: string]: number });
    const labels = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const values = labels.map((day) => barData[day] || 0);
    this.chart.data.datasets[0].data = values;
    this.chart.update();
  }

  toggleSidebar() {
    this.sidebarCollapsed = !this.sidebarCollapsed;
  }

  sendChat() {
    if (this.chatInput.trim()) {
      this.chatMessages.push({ sender: 'You', text: this.chatInput });
      this.service.predictUtilization(this.searchQuery).subscribe({
        next: (response: any) => {
          const suggestion = response.suggestedRoom || 'SCB-GF1';
          this.chatMessages.push({
            sender: 'AI',
            text: `Try ${suggestion} for "${this.chatInput}"!`,
          });
          this.fetchSchedules(suggestion);
        },
        error: () => {
          this.chatMessages.push({
            sender: 'AI',
            text: 'Sorry, no rooms match your query. Try another!',
          });
        },
      });
      this.chatInput = '';
    }
  }

sideBar(){
  this.isOpened=!this.isOpened

}

  setupAR() {
    if (this.isMobile) {
      console.log('AR mode setup for QR code detection');
    }
  }

  enterARMode() {
    console.log('Entering AR mode');
  }

  saveSchedule(schedule: CurrentSchedule) {
    this.service.updateSchedule(schedule).subscribe({
      next: () => {
        console.log('Schedule updated:', schedule);
        alert('Schedule updated!');
      },
      error: (err) => console.error('Error updating schedule:', err),
    });
  }

  saveChanges() {
    console.log('Saving all changes');
    this.currentTimeMatches.forEach((s) => this.saveSchedule(s));
  }

  cancelChanges() {
    this.currentTimeMatches.forEach((s) => {
      
    });
  }

  // New method to fetch all schedules for a room
  fetchAllSchedules(roomId: string) {
    this.isLoadingSchedules = true;
    this.scheduleError = '';
    
    this.service.getRoomSchedules(roomId).subscribe({
      next: (response) => {
        console.log('All Schedules Response:', response);
      
        this.allSchedules = response.schedules.sort((a: any, b: any) => {
          // First sort by day
          const dayDiff = (this.dayOrder[a.Day] || 99) - (this.dayOrder[b.Day] || 99);
          if (dayDiff !== 0) return dayDiff;
          
          // Then sort by time slot
          return this.sortTimeSlots(a.Start, b.Start);
        });
        this.isLoadingSchedules = false;
      },
      error: (err) => {
        console.error('Error fetching schedules:', err);
        this.scheduleError = 'Failed to load schedules. Please try again.';
        this.isLoadingSchedules = false;
      }
    });
  }

  // Method to refresh utilization data
  refreshUtilizationData(roomId: string) {
    this.isLoading = true;
    this.error_masssage = '';
    
    // Try the day-based schedules endpoint first
    this.service.getDayBasedSchedules(roomId).subscribe({
      next: (data) => {
        console.log('Day-based Schedules Data:', data);
        if (data.daily_utilization && data.daily_utilization.length > 0) {
          // Update the component data with day-based data
          this.dailyUtilization = data.daily_utilization;
          
          // Filter for the selected room
          this.filterDailyUtilization();
          
          // Also fetch the latest individual schedules
          this.fetchAllSchedules(roomId);
          
          // Update the graph
          this.updateBarGraph();
          
          this.isLoading = false;
        } else {
          // Fall back to regular refresh if no day-based data
          this.fallbackToRegularRefresh(roomId);
        }
      },
      error: (err) => {
        console.error('Error getting day-based schedules:', err);
        // Fall back to regular refresh on error
        this.fallbackToRegularRefresh(roomId);
      }
    });
  }
  

  fallbackToRegularRefresh(roomId: string) {
    this.service.refreshAggregatedData(roomId).subscribe({
      next: (data) => {
        console.log('Refreshed Utilization Data (fallback):', data);
      
        this.dailyUtilization = data.daily_utilization;
        this.weekly_summary = data.weekly_summary;
        
        this.filterDailyUtilization();
        
        
        this.fetchAllSchedules(roomId);
        
        // Update the graph
        this.updateBarGraph();
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Error refreshing utilization data:', err);
        this.error_masssage = 'Failed to refresh utilization data. Please try again.';
        this.isLoading = false;
      }
    });
  }
  

  showSnackBar(message: string, isError: boolean = false) {
    
    console.log(`${isError ? 'ERROR: ' : ''}${message}`);
  }


  onRoomChange() {
    if (this.selectedRoom) {
      this.loadRoomData();
    }
  }

 
  loadRoomData() {
    if (this.selectedRoom && this.selectedRoom['Room ID']) {
      this.refreshUtilizationData(this.selectedRoom['Room ID']);
      this.fetchAllSchedules(this.selectedRoom['Room ID']);
    }
  }

 
  filterDailyUtilization() {
    if (this.selectedRoom && this.dailyUtilization) {
     
      this.filteredDailyUtilization = this.dailyUtilization
        .filter(d => d['Room ID'] === this.selectedRoom?.['Room ID'])
        .sort((a: any, b: any) => {
         
          const dayDiff = (this.dayOrder[a.Day] || 99) - (this.dayOrder[b.Day] || 99);
          if (dayDiff !== 0) return dayDiff;
          
          
          return this.sortTimeSlots(a.Time_Slot, b.Time_Slot);
        });
    } else {
      this.filteredDailyUtilization = [];
    }
  }
}