import { Component, OnInit, ViewChild, ElementRef, AfterViewInit, OnDestroy } from '@angular/core';
import { AuthService } from '../service.service';
import { RoomAvailabilityRespone, WeeklyUtilization, Room, DailyUtilization, CurrentSchedule } from '../../Environ';
import { Chart } from 'chart.js';
import * as AFrame from 'aframe';
import { gsap } from 'gsap';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { NgModule } from '@angular/core';
import { library } from '@fortawesome/fontawesome-svg-core';
import { faHome, faChartBar, faCalendar } from '@fortawesome/free-solid-svg-icons';
import { Router, ActivatedRoute } from '@angular/router';
import { UserInfo } from '../../Environ';


// Register Chart.js components
import { registerables } from 'chart.js';
Chart.register(...registerables);

@Component({
  selector: 'app-adjust-schedules',
  templateUrl: './adjust-schedules.component.html',
  styleUrls: ['./adjust-schedules.component.css'],
})
export class AdjustSchedulesComponent implements OnInit, AfterViewInit, OnDestroy {
  userId= localStorage.getItem('userId')
  error_masssage!: string;
  user!: UserInfo;
  dailyUtilization: DailyUtilization[] = [];
  currentTimeMatches: CurrentSchedule[] = [];
  filteredRooms: Room[] = [];
  selectedRoom: Room | null = null;
  searchQuery: string = '';
  chatMessages: { sender: string; text: string }[] = [];
  chatInput: string = '';
  isMobile: boolean = /Mobi|Android/i.test(navigator.userAgent);
  displayedColumns: string[] = [
    'Room ID',
    'Course',
    'Status',
    'Current Schedule',
    'Department',
    'Year',
    'New Schedule',
    'Action',
  ];
  utilizationColumns: string[] = [
    'Day',
    'Room ID',
    'Daily Utilization',
    'Time Slot',
    'Courses',
    'Department',
    'Status',
    'Year',
  ];
  isLoading: boolean = false;
  weekly_summary: WeeklyUtilization[] = [];
  sidebarCollapsed: boolean = false;
  private searchSubject = new Subject<string>();
  isOpened:Boolean=false
  User!:UserInfo
  @ViewChild('barCanvas') barCanvas!: ElementRef<HTMLCanvasElement>;
  private chart: Chart<'bar'> | null = null;

  constructor(private service: AuthService, private router: Router, private route: ActivatedRoute) {
    this.searchSubject
      .pipe(
        debounceTime(1000),
        distinctUntilChanged())
      .subscribe((data) => {
        this.fetchSchedules(data);
      });
  }

  ngOnInit() {
    this.fetchSchedules('SCB-GF1');
    this.setupAR();
    this.chatInput = '';
     this.service.getUsers(this.userId).subscribe({
      next: (data)=>{
        this.user= data.find((x:any)=> x.user_id===this.userId)
        console.log(this.user );
        
        
      },
      error: (error)=>{
        console.log(`Error ${error}`);
        
      }
     })
   

    

  
  }

  ngAfterViewInit() {
    gsap.from('.room-card', { opacity: 0, y: 50, duration: 3, stagger: 0.1 });
    gsap.from('.fancy-card', { opacity: 0, y: 20, duration: 3, stagger: 0.2 });
    gsap.from('.conveyor ', { opacity: 0, y: 20, duration: 3, stagger: 0.1 });
      this.initializeBarGraph();
   
  }

  ngOnDestroy() {
    if (this.chart) {
      this.chart.destroy();
    }
  }

  get filteredDailyUtilization(): DailyUtilization[] {
    return this.dailyUtilization.filter(
      (d) => d['Room ID'] === this.selectedRoom?.['Room ID']
    );
  }

  fetchSchedules(roomId: string) {
    this.isLoading = true;
    this.error_masssage = '';
    this.service.getAvailableRooms(roomId).subscribe({
      next: (data: RoomAvailabilityRespone) => {
        console.log('API Response:', data);
        this.dailyUtilization = data.daily_utilization;
        this.weekly_summary = data.weekly_summary;
    
       
        this.currentTimeMatches = data.current_time_matches.map((s) => ({
          ...s,
          newStart: s.Start,
          newEnd: s.End,
          
          
        }));
        this.filteredRooms = [data.room_status];
        this.selectedRoom = data.room_status;
        
        
      
        this.isLoading = false;
        console.log('Filtered Rooms:', this.dailyUtilization);
        
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
  }



  getUtilizationClass(utilization: number): string {
    if (utilization > 80) return 'high-utilization';
    if (utilization > 50) return 'medium-utilization';
    return 'low-utilization';
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
}