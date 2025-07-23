import { Component, OnInit, ViewChild, ElementRef, AfterViewInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
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
import { trigger, transition, style, animate, query, stagger } from '@angular/animations';

Chart.register(...registerables);

@Component({
  selector: 'app-adjust-schedules',
  templateUrl: './adjust-schedules.component.html',
  styleUrls: ['./adjust-schedules.component.css'],
  animations: [
    trigger('fadeInUp', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(30px)' }),
        animate('600ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
      ])
    ]),
    trigger('slideInLeft', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateX(-50px)' }),
        animate('500ms ease-out', style({ opacity: 1, transform: 'translateX(0)' }))
      ])
    ]),
    trigger('slideInRight', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateX(50px)' }),
        animate('500ms ease-out', style({ opacity: 1, transform: 'translateX(0)' }))
      ])
    ]),
    trigger('slideInUp', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(50px)' }),
        animate('400ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
      ])
    ]),
    trigger('scaleIn', [
      transition(':enter', [
        style({ opacity: 0, transform: 'scale(0.8)' }),
        animate('300ms ease-out', style({ opacity: 1, transform: 'scale(1)' }))
      ])
    ])
  ]
})
export class AdjustSchedulesComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('barCanvas') barCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('utilizationCanvas') utilizationCanvas!: ElementRef<HTMLCanvasElement>;
  private chart: Chart<'bar'> | null = null;
  private utilizationChart: Chart<'line'> | null = null;
  private searchSubject = new Subject<string>();
  

  currentSection: string = 'home';
  isOpened: boolean = false;
  
  
  selectedRoom: any = null;
  rooms: any[] = [];
  availableRooms: any[] = [];
  filteredRooms: any[] = [];
  dailyUtilization: any[] = [];
  filteredDailyUtilization: any[] = [];
  weekly_summary: any[] = [];
  allSchedules: any[] = [];
  filteredSchedules: any[] = [];
  
  // Original functionality - room search results
  roomSearchResults: any = null;
  roomUtilizationData: any[] = [];
  ongoingSchedules: any[] = [];
  dailyAnalysisData: any[] = [];
  
  // Table columns - restored original
  utilizationColumns: string[] = ['Day', 'Room ID', 'Daily Utilization', 'Time Slot', 'Courses', 'Department', 'Status', 'Year'];
  scheduleColumns: string[] = ['Day', 'Course', 'Time', 'Department', 'Year', 'Status'];
  displayedColumns: string[] = ['Room ID', 'Course', 'Start', 'End', 'Department', 'Year', 'Instructor', 'Day'];
  
  // Daily analysis table columns as specified
  dailyAnalysisColumns: string[] = ['Day', 'Room', 'Utilization (%)', 'Time Slot', 'Courses', 'Department', 'Status', 'Year'];
  
  // Current time matches for live schedule
  currentTimeMatches: any[] = [];
  
  // Throttling for getCurrentTimeMatchesGlobal calls
  private lastCurrentTimeMatchesCall: number = 0;
  
  // UI state
  isLoading: boolean = false;
  isLoadingSchedules: boolean = false;
  isLoadingRoomData: boolean = false;
  isLoadingUtilization: boolean = false;
  error_masssage: string = '';
  scheduleError: string = '';
  roomSearchError: string = '';
  searchQuery: string = '';
  selectedDay: string = '';
  
  // User data
  user: any = {
    username: localStorage.getItem('username') || 'Administrator'
  };
  userId: string = localStorage.getItem('userId') || '';
  
  // Mobile detection
  isMobile: boolean = /Mobi|Android/i.test(navigator.userAgent);
  
  // Chat functionality - restored
  chatMessages: { sender: string; text: string }[] = [];
  chatInput: string = '';
  
  // API Configuration
  private apiUrl = 'http://localhost:5000'; // Backend API URL
  
  // New properties for dynamic statistics
  roomStats: any = { total: 0, available: 0, occupied: 0, departments: 0 };
  scheduleStats: any = { total: 0, today: 0, active: 0, upcoming: 0, departments: 0 };
  utilizationStats: any = { average: 0, peak: 0, low: 0, trend: 'stable' };

  constructor(
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef
  ) {
    // Initialize fontawesome icons
    library.add(faHome, faChartBar, faCalendar);
    
    // Setup search debouncing
    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged()
    ).subscribe(searchText => {
      this.performSearch(searchText);
      });
  }

  ngOnInit(): void {
    console.log('AdjustSchedulesComponent initialized');
    
    // Ensure loading states are properly initialized
    this.isLoadingUtilization = false;
    this.isLoadingSchedules = false;
    this.isLoadingRoomData = false;
    
    // Initialize FontAwesome icons
    library.add(faHome, faChartBar, faCalendar);
    
    // Set app start time for uptime calculation
    if (!localStorage.getItem('appStartTime')) {
      localStorage.setItem('appStartTime', new Date().toISOString());
    }
    
    // Load initial data
    this.loadRoomsData();
    this.loadDailyUtilization();
    this.loadWeeklySummary();
    
    // Set default section based on route or localStorage
    this.currentSection = 'home';
    
    // Load user info
    this.loadUserInfo();
    
    // Setup debounced search
    this.setupDebouncedSearch();
    
    // Add debug for current time matches
    setTimeout(() => {
      this.debugCurrentTimeMatches();
    }, 2000);  // Wait for initial data to load
  }

  // Setup debounced search functionality
  private setupDebouncedSearch(): void {
    this.searchSubject.pipe(
      debounceTime(300), // Wait 300ms after user stops typing
      distinctUntilChanged() // Only emit if value is different from previous
    ).subscribe(searchTerm => {
      console.log('Debounced search triggered:', searchTerm);
      this.performSearch(searchTerm);
    });
  }

  ngAfterViewInit(): void {
    this.initializeChart();
    this.setupAutoRefresh();
  }

  ngOnDestroy(): void {
    if (this.chart) {
      this.chart.destroy();
    }
    if (this.utilizationChart) {
      this.utilizationChart.destroy();
    }
    this.searchSubject.complete();
  }

  // Initialization methods
  private initializeComponent(): void {
    
    this.currentSection = 'home';
    
    // Load user info
    this.loadUserInfo();
  }

  private loadUserInfo(): void {
   
    const username = localStorage.getItem('username') || 'admin';
    const userId = localStorage.getItem('userId') || 'cd4c9a7d-7dc1-4de8-9e0b-10a903cccb62';
    const userRole = localStorage.getItem('userRole') || 'Administrator';
    const userEmail = localStorage.getItem('userEmail') || 'admin@resourceoptimizer.com';
    const userDepartment = localStorage.getItem('userDepartment') || 'IT Administration';
    const loginTime = localStorage.getItem('loginTime') || '7/19/25, 8:40 AM';
    
  
    this.user = {
      username: username,
      userId: userId,
      role: userRole,
      email: userEmail,
      department: userDepartment,
      loginTime: loginTime,
      isAdmin: true,
      displayName: this.formatDisplayName(username),
      initials: this.getInitials(username),
     
      fullName: username !== 'admin' ? username : 'System Administrator',
      permissions: ['read', 'write', 'admin', 'manage_resources'],
      lastLogin: loginTime,
      sessionActive: true,
      adminLevel: 'Super Admin'
    };
    
    console.log('Admin user info loaded:', this.user);
    

    localStorage.setItem('userEmail', this.user.email);
    localStorage.setItem('userId', this.user.userId);
    localStorage.setItem('userRole', this.user.role);
    localStorage.setItem('userDepartment', this.user.department);
    localStorage.setItem('loginTime', this.user.loginTime);
    

    this.loadAdminLogs();
  }

  
  private loadAdminLogs(): void {
    console.log('Loading admin logs from backend for user:', this.user.userId);
    
   
    const token = localStorage.getItem('token') || localStorage.getItem('authToken');
    if (!token) {
      console.warn('No authentication token found, loading from backend without auth');
      this.loadSystemStats();
      return;
    }
    
    
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
    
    fetch(`${this.apiUrl}/api/logs`, {
      method: 'GET',
      headers: headers
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    })
    .then(logs => {
      console.log('Admin logs loaded from backend:', logs);
      
      // Extract user details from the most recent log entry
      let userEmail = this.user.email || 'admin@resourceoptimizer.com';
      let userName = this.user.displayName || 'System Administrator';
      let userId = this.user.userId || 'admin001';
      
      if (logs && Array.isArray(logs) && logs.length > 0) {
        // Get the most recent log entry (first in the array)
        const mostRecentLog = logs[0];
        
        // Extract user details from the log
        if (mostRecentLog.email) {
          userEmail = mostRecentLog.email;
        }
        if (mostRecentLog.username) {
          userName = mostRecentLog.username;
        }
        if (mostRecentLog.user_id) {
          userId = mostRecentLog.user_id;
        }
        

        this.user.email = userEmail;
        this.user.displayName = userName;
        this.user.userId = userId;
        this.user.fullName = userName;
        this.user.username = userName;
        
        // Update localStorage with real user data from logs
        localStorage.setItem('userEmail', userEmail);
        localStorage.setItem('userId', userId);
        localStorage.setItem('username', userName);
        
        console.log('Extracted user details from logs:', {
          email: userEmail,
          username: userName,
          userId: userId
        });
      }
      
     
      const adminLogs = {
        userId: userId,
        email: userEmail,
        role: this.user.role || 'Administrator',
        loginTime: this.user.loginTime || new Date().toISOString(),
        activities: this.processLogActivities(logs),
        systemInfo: this.buildSystemInfo(logs)
      };
      
    
      this.user.adminLogs = adminLogs;
      console.log('Processed admin logs:', adminLogs);
      
      // Force change detection to update UI with real user data
      this.cdr.detectChanges();
      console.log('User data updated from logs - UI refreshed');
   
      this.loadSystemStats();
    })
    .catch(error => {
      console.error('Error loading admin logs from backend:', error);
      console.log('Loading system stats without logs');
      this.loadSystemStats();
    });
  }
  
  
  private processLogActivities(logs: any[]): any[] {
    if (!logs || !Array.isArray(logs)) {
      return [];
    }
    
    return logs.slice(0, 10).map(log => ({
      timestamp: log.timestamp || log.date || new Date().toISOString(),
      action: log.action || log.activity || 'System Activity',
      resource: log.resource || log.module || 'Resource Optimizer',
      status: log.status || 'Success',
      details: log.details || log.message || ''
    }));
  }

  private setMockAdminLogs(): void {
    const adminLogs = {
      userId: this.user.userId,
      email: this.user.email,
      role: this.user.role,
      loginTime: this.user.loginTime,
      activities: [
        {
          timestamp: new Date().toISOString(),
          action: 'Dashboard Access',
          resource: 'Adjust Schedules',
          status: 'Success',
          details: 'Accessed schedule adjustment module'
        },
        {
          timestamp: new Date(Date.now() - 3600000).toISOString(),
          action: 'Room Search',
          resource: 'Available Rooms',
          status: 'Success',
          details: 'Searched for room availability'
        },
        {
          timestamp: new Date(Date.now() - 7200000).toISOString(),
          action: 'Data Refresh',
          resource: 'Utilization Data',
          status: 'Success',
          details: 'Refreshed utilization analytics'
        },
        {
          timestamp: new Date(Date.now() - 10800000).toISOString(),
          action: 'User Login',
          resource: 'Authentication',
          status: 'Success',
          details: 'Administrator login successful'
        },
        {
          timestamp: new Date(Date.now() - 14400000).toISOString(),
          action: 'System Check',
          resource: 'Health Monitor',
          status: 'Success',
          details: 'System health verification'
        }
      ],
      systemInfo: {
        appVersion: '1.0.0',
        lastUpdate: new Date().toLocaleDateString(),
        serverStatus: 'Online',
        databaseStatus: 'Connected',
        totalLogs: 5,
        lastActivity: new Date().toISOString()
      }
    };
    
    this.user.adminLogs = adminLogs;
    console.log('Mock admin logs set:', adminLogs);
  }

  
  private buildSystemInfo(logs: any[]): any {
    const now = new Date();
    const recentLogs = logs.filter(log => {
      const logDate = new Date(log.timestamp || log.date || now);
      const hoursDiff = (now.getTime() - logDate.getTime()) / (1000 * 3600);
      return hoursDiff <= 24; 
    });
    
    return {
      appVersion: '1.2.0',
      lastUpdate: now.toLocaleDateString(),
      serverStatus: logs.length > 0 ? 'Online' : 'Connecting',
      databaseStatus: 'Connected',
      totalLogs: logs.length,
      recentActivity: recentLogs.length,
      lastActivity: logs.length > 0 ? logs[0].timestamp || now.toISOString() : now.toISOString(),
      uptime: this.calculateUptime()
    };
  }
  

  private calculateUptime(): string {
    const startTime = localStorage.getItem('appStartTime') || new Date().toISOString();
    const now = new Date();
    const start = new Date(startTime);
    const uptimeMs = now.getTime() - start.getTime();
    const hours = Math.floor(uptimeMs / (1000 * 60 * 60));
    const minutes = Math.floor((uptimeMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  }
  

  private loadSystemStats(): void {
    console.log('Loading system statistics from backend...');
    

    this.loadRoomStatistics();
    
     
    this.loadScheduleStatistics();
    
   
    this.loadUtilizationStatistics();
  }
  

  private loadRoomStatistics(): void {
    this.authService.getAvailableRooms().subscribe({
      next: (response) => {
        if (response && response.rooms) {
          this.rooms = response.rooms;
          this.availableRooms = response.rooms;
          this.filteredRooms = response.rooms;
          
          // Calculate room statistics
          this.roomStats = {
            total: response.rooms.length,
            available: response.rooms.filter((room: any) => this.getRoomStatus(room) === 'available').length,
            occupied: response.rooms.filter((room: any) => this.getRoomStatus(room) === 'active').length,
            departments: [...new Set(response.rooms.map((room: any) => room.Department))].length
          };
          
          console.log('Room statistics loaded:', this.roomStats);
        }
      },
      error: (error) => {
        console.error('Error loading room statistics:', error);
        this.roomStats = { total: 0, available: 0, occupied: 0, departments: 0 };
      }
    });
  }
  

  private loadScheduleStatistics(): void {
    if (this.allSchedules.length === 0) {

      this.loadAllSchedulesGlobal();
      return;
    }
    
    const now = new Date();
    const today = now.toLocaleDateString('en-US', { weekday: 'long' });
    const currentTime = now.toTimeString().slice(0, 5);
    
    this.scheduleStats = {
      total: this.allSchedules.length,
      today: this.allSchedules.filter(schedule => schedule.Day === today).length,
      active: this.currentTimeMatches.length,
      upcoming: this.allSchedules.filter(schedule => 
        schedule.Day === today && schedule.Start > currentTime
      ).length,
      departments: [...new Set(this.allSchedules.map(schedule => schedule.Department))].length
    };
    
    console.log('Schedule statistics loaded:', this.scheduleStats);
  }
  
 
  private loadUtilizationStatistics(): void {
    this.authService.refreshAggregatedData().subscribe({
      next: (response) => {
        if (response) {
          const utilData = response.daily_utilization || [];
          const weeklyData = response.weekly_summary || [];
       
          const totalUtil = utilData.reduce((sum: number, item: any) => 
            sum + (item.Daily_Utilization || item['Daily Utilization'] || 0), 0
          );
          
          this.utilizationStats = {
            average: utilData.length > 0 ? Math.round(totalUtil / utilData.length) : 0,
            peak: Math.max(...utilData.map((item: any) => item.Daily_Utilization || item['Daily Utilization'] || 0)),
            low: Math.min(...utilData.map((item: any) => item.Daily_Utilization || item['Daily Utilization'] || 0)),
            trend: this.calculateUtilizationTrend(weeklyData)
          };
          
          console.log('Utilization statistics loaded:', this.utilizationStats);
          
         
          this.updateChartsWithRealData(utilData, weeklyData);
        }
      },
      error: (error) => {
        console.error('Error loading utilization statistics:', error);
        this.utilizationStats = { average: 0, peak: 0, low: 0, trend: 'stable' };
      }
    });
  }
  
 
  private calculateUtilizationTrend(weeklyData: any[]): string {
    if (weeklyData.length < 2) return 'stable';
    
    const recent = weeklyData.slice(-3); 
    const older = weeklyData.slice(-6, -3); 
    
    if (recent.length === 0 || older.length === 0) return 'stable';
    
    const recentAvg = recent.reduce((sum, item) => sum + (item.Total_Utilization || 0), 0) / recent.length;
    const olderAvg = older.reduce((sum, item) => sum + (item.Total_Utilization || 0), 0) / older.length;
    
    const difference = recentAvg - olderAvg;
    
    if (difference > 5) return 'increasing';
    if (difference < -5) return 'decreasing';
    return 'stable';
  }
  

  private updateChartsWithRealData(utilData: any[], weeklyData: any[]): void {
    console.log('Updating charts with real backend data...');
    
   
    if (this.chart && weeklyData.length > 0) {
      const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
      const realData = days.map(day => {
        const dayData = weeklyData.find(item => item.Day === day);
        return dayData ? (dayData.Total_Utilization || 0) : 0;
      });
      
      console.log('Updating main chart with real data:', realData);
      
      this.chart.data.datasets[0].data = realData;
      this.chart.data.datasets[0].label = 'Weekly Room Utilization (%)';
      this.chart.update('active');
    }
    
    
    if (this.utilizationChart && utilData.length > 0) {
      this.updateUtilizationChart();
    }
  }


  private formatDisplayName(username: string): string {
    if (!username) return 'System Administrator';
    
    
    if (username.toLowerCase() === 'admin') {
      return 'System Administrator';
    }
    
    return username
      .split(/[-_.]/g)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  private getInitials(username: string): string {
    if (!username) return 'SA';
    
    if (username.toLowerCase() === 'admin') {
      return 'SA'; 
    }
    
    const words = username.split(/[-_.]/g);
    if (words.length >= 2) {
      return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
    }
    return username.substring(0, 2).toUpperCase();
  }

  
  getAdminInfo(): any {
    return {
      displayName: this.user?.displayName || 'System Administrator',
      email: this.user?.email || 'admin@resourceoptimizer.com',
      userId: this.user?.userId || 'admin001',
      role: this.user?.role || 'Administrator',
      department: this.user?.department || 'IT Administration',
      isAdmin: true,
      sessionActive: this.user?.sessionActive || true,
      lastLogin: this.user?.lastLogin || new Date().toISOString()
    };
  }

 
  getUserProfileInfo(): any {
    return {
      ...this.getAdminInfo(),
      fullName: this.user?.fullName || 'System Administrator',
      permissions: this.user?.permissions || ['read', 'write', 'admin'],
      adminLevel: this.user?.adminLevel || 'Super Admin',
      adminLogs: this.user?.adminLogs || null
    };
  }

  private loadInitialData(): void {
    this.loadRoomsData();
    this.loadDailyUtilization();
    this.loadWeeklySummary();
  }

  
  navigateToSection(section: string): void {
 
    switch (section) {
      case 'home':
       
        this.router.navigate(['/admin-dashboard']);
        break;
        
      case 'analytics':

        this.router.navigate(['/ai-insights']);
        break;
        
      case 'schedules':
        
        this.currentSection = section;
        this.loadAllSchedulesGlobal(); 
        break;
        
      case 'executive':
       
        this.router.navigate(['/executive-booking']);
        break;
        
      case 'user':
      case 'settings':
       
        this.currentSection = section;
        break;
        
      default:
        this.currentSection = section;
        break;
    }
    
    if (this.isMobile) {
      this.isOpened = false;
    }
  }

  getSectionTitle(): string {
    const titles: { [key: string]: string } = {
      'home': 'Schedule Dashboard',
      'schedules': 'All Schedules',
      'analytics': 'Analytics & Insights',
      'executive': 'Executive Management',
      'settings': 'System Settings',
      'user': 'User Profile'
    };
    return titles[this.currentSection] || 'Dashboard';
  }

  getSectionDescription(): string {
    const descriptions: { [key: string]: string } = {
      'home': 'Monitor and manage room schedules in real-time',
      'schedules': 'View and manage all room schedules',
      'analytics': 'Advanced analytics and utilization insights',
      'executive': 'Executive booking and resource management',
      'settings': 'Configure system preferences and options',
      'user': 'Manage your profile and preferences'
    };
    return descriptions[this.currentSection] || 'Welcome to the dashboard';
  }

  
  getSearchPlaceholder(): string {
    switch (this.currentSection) {
      case 'schedules':
        return 'Search by room, course, instructor, department...';
      case 'home':
      default:
        return 'Search Room ID (e.g., LT001, LAB202)...';
    }
  }

  getSearchContext(): string {
    switch (this.currentSection) {
      case 'schedules':
        return `Searching in ${this.allSchedules.length} schedules from all rooms`;
      case 'home':
      default:
        return `Searching in ${this.availableRooms.length} available rooms`;
    }
  }

  toggleSidebar(): void {
    this.isOpened = !this.isOpened;
  }

 
  private loadRoomsData(): void {
    this.isLoading = true;
    this.error_masssage = '';
    
    this.authService.getAvailableRooms().subscribe({
      next: (response) => {
        if (response && response.rooms) {
          this.rooms = response.rooms;
          this.availableRooms = response.rooms;
          this.filteredRooms = response.rooms;
          
      
          if (!this.selectedRoom && this.rooms.length > 0) {
            this.selectedRoom = this.rooms[0];
            this.onRoomChange();
          }
        }
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading rooms:', error);
        this.error_masssage = 'Failed to load rooms data';
        this.isLoading = false;
      }
    });
  }

  private loadDailyUtilization(): void {
    if (!this.selectedRoom) return;
    
    this.authService.refreshAggregatedData(this.selectedRoom['Room ID']).subscribe({
      next: (response) => {
        if (response && response.daily_utilization) {
          this.dailyUtilization = response.daily_utilization;
          this.filteredDailyUtilization = this.dailyUtilization.filter(
            util => util['Room ID'] === this.selectedRoom['Room ID']
          );
        }
      },
      error: (error) => {
        console.error('Error loading daily utilization:', error);
      }
    });
  }

  private loadWeeklySummary(): void {
    this.authService.refreshAggregatedData().subscribe({
      next: (response) => {
        if (response && response.weekly_summary) {
          this.weekly_summary = response.weekly_summary;
          this.updateChartData();
        }
      },
      error: (error) => {
        console.error('Error loading weekly summary:', error);
      }
    });
  }

  private getCurrentTimeMatches(): void {
    
    const now = new Date();
    const currentDay = now.toLocaleDateString('en-US', { weekday: 'long' });
    const currentTime = now.toTimeString().slice(0, 5); // HH:MM format
    
    console.log(`Checking current time matches: Day=${currentDay}, Time=${currentTime}`);
    console.log(`Total schedules available: ${this.allSchedules.length}`);
   
    this.currentTimeMatches = this.allSchedules.filter(schedule => {
      // More flexible day matching
      const scheduleDay = schedule.Day ? schedule.Day.trim() : '';
      const dayMatch = scheduleDay.toLowerCase() === currentDay.toLowerCase();
      
      // Proper time comparison
      const timeMatch = this.isTimeWithinRange(currentTime, schedule.Start, schedule.End);
      
      if (dayMatch && timeMatch) {
        console.log(`Match found: ${schedule.Course} on ${scheduleDay} from ${schedule.Start} to ${schedule.End}`);
      }
      
      return dayMatch && timeMatch;
    });
    
    console.log(`Found ${this.currentTimeMatches.length} current time matches`);
  }

  private getCurrentTimeMatchesGlobal(): void {
    console.log('Getting current time matches from available_rooms endpoint...');
    
    // Prevent too many rapid calls (throttle to once per 5 seconds)
    const now = Date.now();
    if (this.lastCurrentTimeMatchesCall && (now - this.lastCurrentTimeMatchesCall) < 5000) {
      console.log('⏳ Throttling getCurrentTimeMatchesGlobal call (too soon since last call)');
      return;
    }
    this.lastCurrentTimeMatchesCall = now;
    
    // Call the available_rooms endpoint which includes current_time_matches
    this.authService.getAvailableRooms().subscribe({
      next: (response) => {
        console.log('Available rooms response received:', response);
        
        if (response && response.current_time_matches) {
          // Only update if we have actual data
          if (response.current_time_matches.length > 0) {
            this.currentTimeMatches = response.current_time_matches;
            console.log(`✅ SUCCESS: Assigned ${this.currentTimeMatches.length} current time matches to component`);
            console.log('Current time matches data:', this.currentTimeMatches);
          } else {
            console.log('⚠️ API returned empty current_time_matches array, keeping existing data');
          }
          
          // Ensure loading state is false so table can be displayed
          this.isLoadingUtilization = false;
          
          // Force change detection to ensure UI updates
          this.cdr.detectChanges();
          console.log('🔄 Change detection triggered for current time matches');
          
        } else {
          console.log('⚠️ No current_time_matches in response, falling back to manual calculation');
          // Fallback to manual calculation if endpoint doesn't provide current_time_matches
          this.calculateCurrentTimeMatchesManually();
        }
      },
      error: (error) => {
        console.error('❌ Error getting current time matches from available_rooms:', error);
        // Ensure loading state is false even on error
        this.isLoadingUtilization = false;
        // Don't clear existing data on error, just try manual calculation
        console.log('🔄 Keeping existing current time matches due to API error');
        this.calculateCurrentTimeMatchesManually();
      }
    });
  }
  
  private calculateCurrentTimeMatchesManually(): void {
    const now = new Date();
    const currentDay = now.toLocaleDateString('en-US', { weekday: 'long' });
    const currentTime = now.toTimeString().slice(0, 5);
    
    console.log(`Manually calculating current time matches: Day=${currentDay}, Time=${currentTime}`);
    console.log(`Total schedules available: ${this.allSchedules.length}`);
    
    // Only proceed if we have schedules to work with
    if (!this.allSchedules || this.allSchedules.length === 0) {
      console.log('⚠️ No schedules available for manual calculation, keeping existing data');
      return;
    }
  
    const manualMatches = this.allSchedules.filter(schedule => {
      // More flexible day matching
      const scheduleDay = schedule.Day ? schedule.Day.trim() : '';
      const dayMatch = scheduleDay.toLowerCase() === currentDay.toLowerCase();
      
      // Proper time comparison
      const timeMatch = this.isTimeWithinRange(currentTime, schedule.Start, schedule.End);
      
      if (dayMatch && timeMatch) {
        console.log(`Manual match found: ${schedule.Course} in ${schedule['Room ID']} on ${scheduleDay} from ${schedule.Start} to ${schedule.End}`);
      }
      
      return dayMatch && timeMatch;
    });
    
    // Only update if we found matches OR if we don't have any existing data
    if (manualMatches.length > 0 || this.currentTimeMatches.length === 0) {
      this.currentTimeMatches = manualMatches;
      console.log(`Found ${this.currentTimeMatches.length} current time matches from manual calculation`);
    } else {
      console.log(`⚠️ Manual calculation found no matches, keeping existing ${this.currentTimeMatches.length} matches`);
    }
    
    // Ensure loading state is false so table can be displayed
    this.isLoadingUtilization = false;
    
    // Force change detection to ensure UI updates
    this.cdr.detectChanges();
    console.log('🔄 Change detection triggered for manual current time matches');
  }

  // Helper method for proper time comparison
  private isTimeWithinRange(currentTime: string, startTime: string, endTime: string): boolean {
    if (!startTime || !endTime || !currentTime) {
      return false;
    }
    
    try {
      // Convert times to minutes for accurate comparison
      const currentMinutes = this.timeToMinutes(currentTime);
      const startMinutes = this.timeToMinutes(startTime);
      const endMinutes = this.timeToMinutes(endTime);
      
      // Check if current time is within the schedule range
      return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
    } catch (error) {
      console.error('Error comparing times:', error);
      return false;
    }
  }

  // Helper method to convert HH:MM to minutes
  private timeToMinutes(timeStr: string): number {
    const [hours, minutes] = timeStr.split(':').map(num => parseInt(num, 10));
    return hours * 60 + minutes;
  }

  private loadAllSchedules(): void {
    if (!this.selectedRoom) return;
    
    this.isLoadingSchedules = true;
    this.scheduleError = '';
    
    this.authService.getRoomSchedules(this.selectedRoom['Room ID']).subscribe({
      next: (response) => {
        if (response && response.schedules) {
          this.allSchedules = response.schedules;
          this.filteredSchedules = [...this.allSchedules];
        }
        this.isLoadingSchedules = false;
      },
      error: (error) => {
        console.error('Error loading schedules:', error);
        this.scheduleError = 'Failed to load schedules';
        this.isLoadingSchedules = false;
      }
    });
  }


  private loadAllSchedulesGlobal(): void {
    this.isLoadingSchedules = true;
    this.scheduleError = '';
    console.log('Loading all schedules from all rooms...');

    this.authService.getAvailableRooms().subscribe({
      next: (roomsResponse) => {
        if (roomsResponse && roomsResponse.rooms) {
          const rooms = roomsResponse.rooms;
          const schedulePromises: any[] = [];
          
          
          rooms.forEach((room: any) => {
            const schedulePromise = this.authService.getRoomSchedules(room['Room ID']).toPromise()
              .then(response => {
                if (response && response.schedules) {
                  return response.schedules.map((schedule: any) => ({
                    ...schedule,
                    'Room ID': room['Room ID'], 
                    'Department': room.Department || schedule.Department,
                    'Room Type': room['Room Type'] || 'Unknown'
                  }));
                }
                return [];
              })
              .catch(error => {
                console.error(`Error loading schedules for room ${room['Room ID']}:`, error);
                return [];
              });
            
            schedulePromises.push(schedulePromise);
          });
          
          
          Promise.all(schedulePromises).then(results => {
      
            this.allSchedules = results.flat();
            this.filteredSchedules = [...this.allSchedules];
            
            console.log(`Loaded ${this.allSchedules.length} total schedules from ${rooms.length} rooms`);
            
            // Debug: Show sample schedule data
            if (this.allSchedules.length > 0) {
              console.log('Sample schedule data:', this.allSchedules[0]);
              console.log('Schedule fields:', Object.keys(this.allSchedules[0]));
            }
            
            this.isLoadingSchedules = false;
           
            this.getCurrentTimeMatchesGlobal();
          });
        } else {
          console.error('No rooms data received');
          this.scheduleError = 'No rooms data available';
          this.isLoadingSchedules = false;
        }
      },
      error: (error) => {
        console.error('Error loading rooms for global schedules:', error);
        this.scheduleError = 'Failed to load rooms data';
        this.isLoadingSchedules = false;
      }
    });
  }

  
  private refreshHomeData(): void {
    this.loadDailyUtilization();
    this.loadWeeklySummary();
    this.getCurrentTimeMatchesGlobal(); // Use API call instead of manual calculation
    this.refreshChart();
  }

 
  selectRoom(room: any): void {
    this.selectedRoom = room;
    this.onRoomChange();
    
  
    if (room && room['Room ID']) {
      this.loadRoomSearchData(room['Room ID']);
    }
  }

  onRoomChange(): void {
    if (this.selectedRoom) {
      this.loadDailyUtilization();
      this.loadAllSchedules();
      this.getCurrentTimeMatchesGlobal(); // Use API call instead of manual calculation
    }
  }

 
  searchRoom(): void {
    this.searchSubject.next(this.searchQuery);
    
   
    if (this.searchQuery && this.searchQuery.trim().length >= 1) {
      console.log('Searching for:', this.searchQuery);
      
      if (this.currentSection === 'schedules') {
        this.searchSchedules(this.searchQuery.trim());
      } else {
        this.manualRoomSearch(this.searchQuery.trim());
      }
    } else {
      this.clearSearch();
    }
  }

  searchSchedules(query: string): void {
    if (!query.trim()) {
      this.filteredSchedules = [...this.allSchedules];
      return;
    }
    
    const searchTerm = query.toLowerCase();
    console.log('Searching schedules for:', searchTerm);
    
    this.filteredSchedules = this.allSchedules.filter(schedule => {
      return (
        schedule['Room ID']?.toLowerCase().includes(searchTerm) ||
        schedule.Course?.toLowerCase().includes(searchTerm) ||
        schedule.Department?.toLowerCase().includes(searchTerm) ||
        schedule.Instructor?.toLowerCase().includes(searchTerm) ||
        schedule.Lecturer?.toLowerCase().includes(searchTerm) ||
        schedule.Day?.toLowerCase().includes(searchTerm) ||
        schedule.Year?.toString().includes(searchTerm)
      );
    });
    
    console.log(`Found ${this.filteredSchedules.length} schedules matching "${query}"`);
  }

  private clearSearch(): void {
    if (this.currentSection === 'schedules') {
      this.filteredSchedules = [...this.allSchedules];
    } else {
      this.filteredRooms = [...this.availableRooms];
      this.clearRoomSearchResults();
    }
  }

  manualRoomSearch(roomQuery: string): void {
    const query = roomQuery.toUpperCase().trim();
    console.log('Manual search triggered for:', query);
    
    this.clearRoomSearchResults();
    
    const existingRoom = this.availableRooms.find(room => 
      room['Room ID']?.toUpperCase() === query
    );
    
    if (existingRoom) {
      console.log('Found existing room:', existingRoom['Room ID']);
      this.selectRoom(existingRoom);
      return;
    }
    
    this.isLoadingRoomData = true;
    this.roomSearchError = '';
    
    this.authService.getAvailableRooms(query).subscribe({
      next: (response) => {
        console.log('API response for room search:', response);
        if (response && response.status === 'success') {
          if (response.room_status) {
            const tempRoom = {
              'Room ID': query,
              'Department': response.room_status.Department || 'Unknown',
              'Room Type': response.room_status['Room Type'] || 'Unknown'
            };
            
            this.selectedRoom = tempRoom;
            this.roomSearchResults = response;
            this.roomUtilizationData = response.daily_utilization || [];
            
            this.currentTimeMatches = response.current_time_matches || [];
            console.log('Current time matches from API:', this.currentTimeMatches.length);
            
            this.loadOngoingSchedules(query);
            this.loadDailyAnalysisData(query);
            this.updateUtilizationChart();
            this.updateDailyDemandChart();
            
            console.log('Room data loaded successfully for:', query);
          } else {
            this.roomSearchError = `Room '${query}' not found in the system.`;
            console.log('Room not found:', query);
          }
        } else {
          this.roomSearchError = `No data available for room '${query}'.`;
        }
        this.isLoadingRoomData = false;
      },
      error: (error) => {
        console.error('Error searching for room:', query, error);
        this.roomSearchError = `Error searching for room '${query}'. Please check the room ID and try again.`;
        this.isLoadingRoomData = false;
      }
    });
  }

  private loadOngoingSchedules(roomId: string): void {
    this.authService.getRoomSchedules(roomId).subscribe({
      next: (response) => {
        if (response && response.schedules) {
          this.ongoingSchedules = response.schedules;
          console.log('Ongoing schedules loaded:', this.ongoingSchedules.length);
        } else {
          this.ongoingSchedules = [];
        }
      },
      error: (error) => {
        console.error('Error loading ongoing schedules:', error);
        this.ongoingSchedules = [];
      }
    });
  }
   

  private performSearch(searchText: string): void {
    if (!searchText.trim()) {
      this.filteredRooms = [...this.availableRooms];
      this.clearRoomSearchResults();
      return;
    }
    
    const query = searchText.toLowerCase();
    this.filteredRooms = this.availableRooms.filter(room =>
      room['Room ID']?.toLowerCase().includes(query) ||
      room['Department']?.toLowerCase().includes(query)
    );

    // Check for exact room ID match first
    const exactMatch = this.availableRooms.find(room => 
      room['Room ID']?.toLowerCase() === query.toLowerCase()
    );
    
    if (exactMatch) {
      console.log('Exact room match found:', exactMatch['Room ID']);
      this.selectRoom(exactMatch);
      return;
    }

    // Check if search query looks like a room ID and matches partially
    const partialMatch = this.availableRooms.find(room => 
      room['Room ID']?.toLowerCase().includes(query) && query.length >= 2
    );
    
    if (partialMatch && this.filteredRooms.length === 1) {
      console.log('Single partial match found:', partialMatch['Room ID']);
      this.selectRoom(partialMatch);
    } else if (partialMatch && query.length >= 3) {
      // For longer queries, try to find the best match
      const bestMatch = this.filteredRooms.find(room => 
        room['Room ID']?.toLowerCase().startsWith(query)
      );
      
      if (bestMatch) {
        console.log('Best match found:', bestMatch['Room ID']);
        this.selectRoom(bestMatch);
      }
    }

    if (query.length >= 3 && !exactMatch) {
      const directMatch = this.availableRooms.find(room => 
        room['Room ID']?.toLowerCase() === query
      );
      
      if (directMatch) {
        console.log('Direct room ID match found:', directMatch['Room ID']);
        this.selectRoom(directMatch);
      } else {
        this.tryLoadRoomDataDirectly(searchText.toUpperCase());
      }
    }
  }

  private tryLoadRoomDataDirectly(roomId: string): void {
    if (!roomId || roomId.length < 3) return;
    
    
    
    // First verify if this room exists by calling the API
    this.authService.getAvailableRooms(roomId).subscribe({
      next: (response) => {
        if (response && response.status === 'success' && response.room_status) {
          
          const tempRoom = {
            'Room ID': roomId,
            'Department': response.room_status.Department || 'Unknown',
            'Room Type': response.room_status['Room Type'] || 'Unknown'
          };
          
         
          this.selectedRoom = tempRoom;
          this.loadRoomSearchData(roomId);
        }
      },
      error: (error) => {
        console.log('Room not found:', roomId, error);
        
      }
    });
  }

  private clearRoomSearchResults(): void {
    this.roomSearchResults = null;
    this.roomUtilizationData = [];
    this.ongoingSchedules = [];
    this.dailyAnalysisData = [];
    this.roomSearchError = '';
  }

 
  loadRoomSearchData(roomId: string): void {
    if (!roomId) return;
    
    this.isLoadingRoomData = true;
    this.roomSearchError = '';
    
 
    this.authService.getAvailableRooms(roomId).subscribe({
      next: (response) => {
        if (response && response.status === 'success') {
          this.roomSearchResults = response;
          this.roomUtilizationData = response.daily_utilization || [];
          
        
          this.currentTimeMatches = response.current_time_matches || [];
          console.log('Current time matches loaded:', this.currentTimeMatches.length);
          
      
          this.updateUtilizationChart();
       
          this.updateDailyDemandChart();
        }
        this.isLoadingRoomData = false;
      },
      error: (error) => {
        console.error('Error loading room data:', error);
        this.roomSearchError = 'Failed to load room utilization data';
        this.isLoadingRoomData = false;
      }
    });

    
    this.authService.getRoomSchedules(roomId).subscribe({
      next: (response) => {
        if (response && response.schedules) {
          this.ongoingSchedules = response.schedules;
        }
      },
      error: (error) => {
        console.error('Error loading ongoing schedules:', error);
      }
    });

    // Load detailed daily analysis using current_utilization endpoint
    this.loadDailyAnalysisData(roomId);
  }

  // Load daily analysis data - original functionality
  private loadDailyAnalysisData(roomId: string): void {
    this.isLoadingUtilization = true;
    
    this.authService.currentUtilization(roomId).subscribe({
      next: (response: any) => {
        if (response && response.results && response.results.length > 0) {
          const roomResult = response.results[0];
          if (roomResult.daily_analysis) {
          
            this.dailyAnalysisData = roomResult.daily_analysis.map((dayData: any) => ({
              Day: dayData.day,
              Room: roomId,
              'Utilization (%)': dayData.utilization_percentage,
              'Time Slot': this.formatTimeSlots(dayData.free_timeslots),
              Courses: dayData.courses_scheduled,
              Department: this.getRoomDepartment(roomId),
              Status: dayData.status,
              Year: this.extractYearFromRoomData(roomId)
            }));
          }
        }
        this.isLoadingUtilization = false;
      },
      error: (error) => {
        console.error('Error loading daily analysis:', error);
        this.isLoadingUtilization = false;
      }
    });
  }

  // Helper methods for data formatting
  private formatTimeSlots(freeSlots: string[]): string {
    if (!freeSlots || freeSlots.length === 0) return 'Fully Booked';
    if (freeSlots.length > 3) {
      return `${freeSlots.slice(0, 3).join(', ')}... (+${freeSlots.length - 3} more)`;
    }
    return freeSlots.join(', ');
  }

  private getRoomDepartment(roomId: string): string {
    const room = this.availableRooms.find(r => r['Room ID'] === roomId);
    return room?.Department || 'Unknown';
  }

  private extractYearFromRoomData(roomId: string): string {
    // Extract year information from room schedules or return default
    const roomSchedules = this.ongoingSchedules.filter(s => s['Room ID'] === roomId);
    if (roomSchedules.length > 0) {
      const years = [...new Set(roomSchedules.map(s => s.Year).filter(y => y))];
      return years.join(', ') || 'Various';
    }
    return 'Various';
  }


  private updateUtilizationChart(): void {
    if (!this.utilizationCanvas || !this.roomUtilizationData.length) return;

    if (this.utilizationChart) {
      this.utilizationChart.destroy();
    }

    const ctx = this.utilizationCanvas.nativeElement.getContext('2d');
    if (!ctx) return;

    // Prepare chart data from room utilization
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const utilizationData = days.map(day => {
      const dayData = this.roomUtilizationData.find(d => d.Day === day);
      return dayData ? dayData.Daily_Utilization || 0 : 0;
    });

    this.utilizationChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: days,
        datasets: [{
          label: 'Room Utilization (%)',
          data: utilizationData,
          borderColor: '#ff6b35',
          backgroundColor: 'rgba(255, 107, 53, 0.1)',
          borderWidth: 3,
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#ff6b35',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'top'
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                return `Utilization: ${context.parsed.y}%`;
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
            grid: {
              color: 'rgba(0, 0, 0, 0.1)'
            },
            ticks: {
              callback: function(value) {
                return value + '%';
              }
            }
          },
          x: {
            grid: {
              display: false
            }
          }
        },
        animation: {
          duration: 1000,
          easing: 'easeInOutQuart'
        }
      }
    });
  }
  
  // Schedule management - restored functionality
  filterSchedules(): void {
    if (!this.selectedDay) {
      this.filteredSchedules = [...this.allSchedules];
    } else {
      this.filteredSchedules = this.allSchedules.filter(
        schedule => schedule.Day === this.selectedDay
      );
    }
  }

  getFilteredSchedules(): any[] {
    return this.filteredSchedules;
  }

  editSchedule(schedule: any): void {
    // Navigate to executive booking for editing
    this.router.navigate(['/executive-booking']);
  }

  deleteSchedule(schedule: any): void {
    if (confirm('Are you sure you want to delete this schedule?')) {
      // Implement deletion logic here
      console.log('Deleting schedule:', schedule);
    }
  }

  // Utility methods
  getUtilizationRate(): number {
    if (!this.filteredDailyUtilization.length) return 0;
    
    const total = this.filteredDailyUtilization.reduce((sum, util) => 
      sum + (util.Daily_Utilization || 0), 0
    );
    return Math.round(total / this.filteredDailyUtilization.length);
  }

  getRoomStatus(room: any): string {
    const isActive = this.currentTimeMatches.some(
      schedule => schedule['Room ID'] === room['Room ID']
    );
    return isActive ? 'active' : 'available';
  }

  getRoomStatusText(room: any): string {
    const status = this.getRoomStatus(room);
    return status === 'active' ? 'In Use' : 'Available';
  }

  // Chart methods - enhanced with real data
  private initializeChart(): void {
    if (!this.barCanvas) return;
    
    const ctx = this.barCanvas.nativeElement.getContext('2d');
    if (!ctx) return;
    
    // Initialize with loading state, will be updated with real data
    this.chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
        datasets: [{
          label: 'Loading Room Demand...',
          data: [0, 0, 0, 0, 0], // Start with zeros, will be updated
          backgroundColor: [
            'rgba(26, 43, 92, 0.8)',
            'rgba(255, 107, 53, 0.8)',
            'rgba(255, 68, 0, 0.8)',
            'rgba(139, 90, 150, 0.8)',
            'rgba(51, 51, 51, 0.8)'
          ],
          borderColor: [
            '#1a2b5c',
            '#ff6b35',
            '#ff4500',
            '#8b5a96',
            '#333333'
          ],
          borderWidth: 2,
          borderRadius: 8,
          borderSkipped: false
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'top'
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                return `${context.dataset.label}: ${context.parsed.y}%`;
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
            grid: {
              color: 'rgba(0, 0, 0, 0.1)'
            },
            ticks: {
              callback: function(value) {
                return value + '%';
              }
            }
          },
          x: {
            grid: {
              display: false
            }
          }
        },
        animation: {
          duration: 1000,
          easing: 'easeInOutQuart'
        }
      }
    });
    
    // Load real data after chart initialization
    this.loadUtilizationStatistics();
  }

  // Update Daily Demand Insights chart with real utilization data
  private updateDailyDemandChart(): void {
    if (this.chart && this.roomUtilizationData.length > 0) {
      // Update chart with real data from room utilization
      const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
      const chartData = days.map(day => {
        const dayData = this.roomUtilizationData.find(item => item.Day === day);
        return dayData ? (dayData.Daily_Utilization || dayData['Daily Utilization'] || 0) : 0;
      });
      
      console.log('Updating Daily Demand chart with data:', chartData);
      
      this.chart.data.datasets[0].data = chartData;
      this.chart.data.datasets[0].label = `${this.selectedRoom?.['Room ID'] || 'Room'} Utilization (%)`;
      this.chart.update('active');
    }
  }

  private updateChartData(): void {
    if (this.chart && this.weekly_summary.length > 0) {
      // Update chart with real data from weekly summary
      const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
      const chartData = days.map(day => {
        const dayData = this.weekly_summary.find(item => item.Day === day);
        return dayData ? dayData.Total_Utilization || 0 : 0;
      });
      
      this.chart.data.datasets[0].data = chartData;
      this.chart.update('active');
    }
  }

  refreshChart(): void {
    this.updateChartData();
  }

  // Action methods
  saveChanges(): void {
    this.isLoading = true;
    // Simulate save operation
    setTimeout(() => {
      this.isLoading = false;
      console.log('Changes saved successfully');
    }, 2000);
  }

  cancelChanges(): void {
    // Reset to original state
    this.loadInitialData();
    console.log('Changes cancelled');
  }

  refreshSchedules(): void {
    this.loadAllSchedules();
  }

  exportSchedules(): void {
    // Implement export functionality
    console.log('Exporting schedules...');
    // Create CSV or Excel file
    const csvContent = this.generateCSV();
    this.downloadCSV(csvContent, 'schedules.csv');
  }

  private generateCSV(): string {
    if (!this.allSchedules.length) return '';
    
    const headers = ['Room ID', 'Day', 'Course', 'Start', 'End', 'Department', 'Instructor', 'Year'];
    const csvArray = [headers.join(',')];
    
    this.allSchedules.forEach(schedule => {
      const row = [
        schedule['Room ID'] || '',
        schedule.Day || '',
        schedule.Course || '',
        schedule.Start || '',
        schedule.End || '',
        schedule.Department || '',
        schedule.Instructor || '',
        schedule.Year || ''
      ];
      csvArray.push(row.join(','));
    });
    
    return csvArray.join('\n');
  }

  private downloadCSV(content: string, filename: string): void {
    const blob = new Blob([content], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    window.URL.revokeObjectURL(url);
  }

  navigateToExecutive(): void {
    this.router.navigate(['/executive-booking']);
  }

  logout(): void {
    localStorage.removeItem('userId');
    localStorage.removeItem('username');
    localStorage.removeItem('token');
    this.router.navigate(['/login-page']);
  }

 
  private setupAutoRefresh(): void {
    
    setInterval(() => {
      if (this.currentSection === 'home') {
        this.getCurrentTimeMatchesGlobal(); // Use API call instead of manual calculation
        this.loadDailyUtilization();
      }
    }, 30000);
  }

  // Debug method to test current time matches
  private debugCurrentTimeMatches(): void {
    console.log('=== DEBUGGING CURRENT TIME MATCHES ===');
    
    const now = new Date();
    const currentDay = now.toLocaleDateString('en-US', { weekday: 'long' });
    const currentTime = now.toTimeString().slice(0, 5);
    
    console.log(`Frontend - Current Day: ${currentDay}`);
    console.log(`Frontend - Current Time: ${currentTime}`);
    
    // Test the available_rooms endpoint
    this.authService.getAvailableRooms().subscribe({
      next: (response) => {
        console.log('=== AVAILABLE ROOMS RESPONSE ===');
        console.log('Full response:', response);
        
        if (response.current_time_matches) {
          console.log(`Backend returned ${response.current_time_matches.length} current time matches:`);
          response.current_time_matches.forEach((match: any, index: number) => {
            console.log(`  ${index + 1}. ${match.Course} in ${match['Room ID']} on ${match.Day} from ${match.Start} to ${match.End}`);
          });
        } else {
          console.log('No current_time_matches in response');
        }
        
        // Also check if we have schedule data to work with manually
        if (this.allSchedules && this.allSchedules.length > 0) {
          console.log(`Frontend has ${this.allSchedules.length} schedules loaded`);
          console.log('Sample schedule:', this.allSchedules[0]);
          
          // Try manual calculation as well
          this.calculateCurrentTimeMatchesManually();
        } else {
          console.log('No schedules loaded in frontend');
        }
      },
      error: (error) => {
        console.error('Error testing available_rooms endpoint:', error);
      }
    });
  }

  // Public method for testing current time matches
  public refreshCurrentTimeMatches(): void {
    console.log('🔄 Manually refreshing current time matches...');
    this.getCurrentTimeMatchesGlobal();
  }
  
  // Public method to check current component state
  public checkCurrentTimeMatchesState(): void {
    console.log('=== CURRENT TIME MATCHES STATE ===');
    console.log('currentTimeMatches array:', this.currentTimeMatches);
    console.log('currentTimeMatches length:', this.currentTimeMatches.length);
    console.log('isLoadingUtilization:', this.isLoadingUtilization);
    console.log('isLoadingSchedules:', this.isLoadingSchedules);
    console.log('isLoadingRoomData:', this.isLoadingRoomData);
    console.log('===============================');
  }
}