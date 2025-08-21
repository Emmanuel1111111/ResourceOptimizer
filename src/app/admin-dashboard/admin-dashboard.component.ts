// admin-dashboard.component.ts
import { Component, OnInit, OnDestroy, HostListener, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, filter, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { AuthService } from '../service.service';
import { AdminAuthService } from '../services/admin-auth.service';
import { NotificationService } from '../services/notification.service';
import { trigger, transition, style, animate, query, stagger } from '@angular/animations';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

// Interfaces
interface UserStats {
  totalRooms: number;
  activeBookings: number;
  pendingRequests: number;
  utilizationRate: number;
}

interface DashboardCard {
  title: string;
  icon: string;
  description: string;
  route: string;
  buttonText: string;
  gradient: string;
  textColor: string;
}

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  data: any;
  read: boolean;
  created_at: string;
  time_ago: string;
  icon?: string;
  time?: string;
}

interface RecentActivity {
  id: string;
  title: string;
  description: string;
  timestamp: string;
  type: 'booking' | 'schedule' | 'room' | 'user';
  icon: string;
}

interface SystemStatus {
  overall: 'healthy' | 'warning' | 'error';
  services: {
    name: string;
    status: 'healthy' | 'warning' | 'error';
  }[];
}

interface UserProfile {
  id: string;
  username: string;
  email: string;
  role: string;
  avatar?: string;
  firstName?: string;
  lastName?: string;
  department?: string;
}

@Component({
  selector: 'app-admin-dashboard',
  templateUrl: './admin-dashboard.component.html',
  styleUrls: ['./admin-dashboard.component.css'],
  animations: [
    trigger('countUp', [
      transition(':enter', [
        style({ opacity: 0, transform: 'scale(0.5)' }),
        animate('600ms ease-out', style({ opacity: 1, transform: 'scale(1)' }))
      ])
    ]),
    trigger('slideInUp', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(30px)' }),
        animate('400ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
      ])
    ]),
    trigger('fadeInLeft', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateX(-30px)' }),
        animate('300ms ease-out', style({ opacity: 1, transform: 'translateX(0)' }))
      ])
    ]),
    trigger('staggerCards', [
      transition('* => *', [
        query(':enter', [
          style({ opacity: 0, transform: 'translateY(30px)' }),
          stagger('100ms', [
            animate('400ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
          ])
        ], { optional: true })
      ])
    ])
  ]
})
export class AdminDashboardComponent implements OnInit, OnDestroy, AfterViewInit {
  private destroy$ = new Subject<void>();
  private searchSubject = new Subject<string>();

  @ViewChild('sidebar', { static: false }) sidebarElement!: ElementRef;
  
  // Navigation and UI state
  sidebarOpen: boolean = false;
  isMobile: boolean = false;
  currentRoute: string = 'dashboard';
  userId: string | null = null;
  
  // Notifications and UI interactions
  showNotifications: boolean = false;
  showUserMenu: boolean = false;
  
  // Search functionality
  searchQuery: string = '';
  searchResults: any[] = [];
  isSearching: boolean = false;
  
  // User profile data
  userProfile: UserProfile = {
    id: '',
    username: 'Administrator',
    email: 'admin@university.edu',
    role: 'System Administrator',
    avatar: '',
    firstName: 'System',
    lastName: 'Administrator',
    department: 'IT Department'
  };
  
  // Data properties
  userStats: UserStats = {
    totalRooms: 0,
    activeBookings: 0,
    pendingRequests: 0,
    utilizationRate: 0
  };

  // Trend data for stats
  roomsTrend: number = 0;
  bookingsTrend: number = 0;
  requestsTrend: number = 0;

  // Conflict monitoring properties
  conflictMonitoringActive: boolean = false;
  conflictScanInterval: number = 3600; 
  lastConflictScan: string = 'Never';
  conflictsDetected: number = 0;

  Math = Math;
  
  notifications: Notification[] = [];
  recentActivities: RecentActivity[] = [];
  systemStatus: SystemStatus = {
    overall: 'healthy',
    services: []
  };

  dashboardCards: DashboardCard[] = [
    {
      title: 'Manage Resources',
      icon: '📌',
      description: 'Allocate classrooms, labs, and other resources efficiently. Monitor availability and optimize resource distribution.',
      route: '/executive-booking',
      buttonText: 'Go to Resources',
      gradient: 'linear-gradient(135deg, #1a2b5c 0%, #8b5a96 100%)',
      textColor: 'white',
    },
    {
      title: 'Room Analytics',
      icon: '📊',
      description: 'View analytical insights on classroom demand, usage patterns, and optimization recommendations.',
      route: '/ai-insights',
      buttonText: 'View AI Insights',
      gradient: 'linear-gradient(135deg, #ff4500 0%, #ff6b35 100%)',
      textColor: 'white'
    },
    
    {
      title: 'Monitor/Visualize Data',           
      icon: '🗓️',
      description: 'Modify classroom schedules, resolve conflicts, and manage time slot allocations effectively.',
      route: '/adjust-schedules',
      buttonText: 'Adjust Schedules',
      gradient: 'linear-gradient(135deg, #1a2b5c 0%, #333333 100%)',
      textColor: 'white'
    },
  ];

  constructor(
    private router: Router,
    private authService: AuthService,
    private adminAuthService: AdminAuthService,
    private notificationService: NotificationService,
    private http: HttpClient
  ) {
    this.checkScreenSize();
    this.setupEventListeners();
  }

  ngOnInit(): void {
    this.initializeComponent();
    
    // Subscribe to authentication state changes
    this.adminAuthService.isAuthenticated$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(isAuthenticated => {
      if (isAuthenticated) {
        console.log('✅ User authenticated, initializing dashboard features');
        this.loadUserStats();
        this.loadUserProfile();
        this.loadRealTimeData();
        this.setupRouteTracking();
        this.initializeNotificationService();
        this.loadConflictMonitoringStatus();
      } else {
        console.log('❌ User not authenticated, skipping dashboard features');
        this.notificationService.stopPolling();
        this.notificationService.clearNotifications();
      }
    });
  }

  ngAfterViewInit(): void {
    this.setupSidebarScrollSync();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.searchSubject.complete();

    // Stop notification service polling
    this.notificationService.stopPolling();
  }

  @HostListener('window:resize', ['$event'])
  onResize(event: any): void {
    this.checkScreenSize();
  }

  @HostListener('window:scroll', ['$event'])
  onWindowScroll(): void {
    this.handleSidebarSticky();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    const target = event.target as HTMLElement;
    
    // Close dropdowns when clicking outside
    if (!target.closest('.notification-container')) {
      this.showNotifications = false;
    }
    if (!target.closest('.user-menu')) {
      this.showUserMenu = false;
    }
    

    if (this.isMobile && this.sidebarOpen) {
      const sidebar = document.querySelector('.ultra-sidebar');
    const toggleButton = document.querySelector('.sidebar-toggle');
    
      if (sidebar && toggleButton && !sidebar.contains(target) && !toggleButton.contains(target)) {
        this.sidebarOpen = false;
      }
    }
  }

  // Initialization methods
  private initializeComponent(): void {
    // Check if user is authenticated using AdminAuthService
    if (!this.adminAuthService.isAuthenticated()) {
      console.log('User not authenticated, redirecting to admin login');
      this.router.navigate(['/admin/login']);
      return;
    }
    
    // Get user ID from AdminAuthService
    this.userId = this.adminAuthService.getCurrentUserId();
  }

  private setupSearchDebouncing(): void {
    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(searchTerm => {
      this.performSearch(searchTerm);
    });
  }

  private setupRouteTracking(): void {
    this.router.events
      .pipe(
        filter(event => event instanceof NavigationEnd),
        takeUntil(this.destroy$)
      )
      .subscribe((event: NavigationEnd) => {
        this.currentRoute = this.extractRouteFromUrl(event.url);
      });
  }


  private setupSidebarScrollSync(): void {
    // Make sidebar sticky when scrolling
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          this.sidebarElement?.nativeElement?.classList.add('sticky');
        } else {
          this.sidebarElement?.nativeElement?.classList.remove('sticky');
        }
      });
    });

    if (this.sidebarElement) {
      observer.observe(this.sidebarElement.nativeElement);
    }
  }

  private handleSidebarSticky(): void {
    const scrollY = window.scrollY;
    const sidebar = document.querySelector('.ultra-sidebar');
    
    if (sidebar && !this.isMobile) {
      if (scrollY > 100) {
        sidebar.classList.add('scrolled');
      } else {
        sidebar.classList.remove('scrolled');
      }
    }
  }

  private extractRouteFromUrl(url: string): string {
    const segments = url.split('/');
    return segments[segments.length - 1] || 'dashboard';
  }

  // User profile loading
  private loadUserProfile(): void {
    const userId = localStorage.getItem('userId');
    const username = localStorage.getItem('username');
    const userEmail = localStorage.getItem('userEmail');
    const userAvatar = localStorage.getItem('userAvatar');
    
    if (userId) {
      this.userProfile = {
        id: userId,
        username: username || 'Administrator',
        email: userEmail || 'admin@university.edu',
        role: 'System Administrator',
        firstName: username?.split(' ')[0] || 'System',
        lastName: username?.split(' ')[1] || 'Administrator',
        department: 'IT Department'
      };
    }
  }

  // Search functionality
  onSearchInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.searchQuery = target.value;
    this.searchSubject.next(this.searchQuery);
  }

  private performSearch(query: string): void {
    if (!query.trim()) {
      this.searchResults = [];
      this.isSearching = false;
      return;
    }

    this.isSearching = true;
    
    // Search through rooms, schedules, and other data
    this.authService.getAvailableRooms().subscribe({
      next: (response) => {
        if (response?.rooms) {
          const roomResults = response.rooms
            .filter((room: any) => 
              room['Room ID']?.toLowerCase().includes(query.toLowerCase()) ||
              room['Department']?.toLowerCase().includes(query.toLowerCase())
            )
            .map((room: any) => ({
              type: 'room',
              title: room['Room ID'],
              subtitle: room['Department'],
              icon: 'fas fa-door-open',
              action: () => this.navigateToRoomDetails(room)
            }));
          
          this.searchResults = roomResults.slice(0, 5);
        }
        this.isSearching = false;
      },
      error: () => {
        this.isSearching = false;
        this.searchResults = [];
      }
    });
  }

  navigateToRoomDetails(room: any): void {
    // Navigate to adjust schedules with room pre-selected
    this.router.navigate(['/adjust-schedules'], { 
      queryParams: { roomId: room['Room ID'] } 
    });
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.searchResults = [];
  }

  // Avatar upload functionality
  onAvatarSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      
      // Validate file type
      if (!file.type.startsWith('image/')) {
        alert('Please select an image file');
        return;
      }
      
      // Validate file size (max 2MB)
      if (file.size > 2 * 1024 * 1024) {
        alert('File size must be less than 2MB');
        return;
      }
      
      const reader = new FileReader();
      reader.onload = (e) => {
        this.userProfile.avatar = e.target?.result as string;

        localStorage.setItem('userAvatar', this.userProfile.avatar);
      };
      reader.readAsDataURL(file);
    }
  }

  triggerAvatarUpload(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (event) => this.onAvatarSelect(event);
    input.click();
  }

  // Data loading methods
  private loadUserStats(): void {
    // Load real stats from backend
    this.authService.checkDatabaseStatus().subscribe({
      next: (response) => {
        if (response.status === 'success') {
          this.loadRoomStats();
          this.loadBookingStats();
          this.loadUtilizationStats();
        }
      },
      error: (error) => {
        console.error('Failed to load user stats:', error);
        // Use mock data as fallback
        this.loadMockStats();
      }
    });
  }

  public loadRoomStats(): void {
    console.log('🔄 Loading room stats...');

    // Get actual room count from database
    this.authService.getRoomCount().subscribe({
      next: (response) => {
        console.log('✅ Room stats response:', response);

        if (response && response.status === 'success' && response.data) {
          this.userStats.totalRooms = response.data.total_rooms || 0;

          // Calculate trend based on rooms with schedules vs empty rooms
          if (response.data.total_rooms > 0) {
            const utilizationPercentage = (response.data.rooms_with_schedules / response.data.total_rooms) * 100;
            this.roomsTrend = Math.round(utilizationPercentage);
          } else {
            this.roomsTrend = 0;
          }


          // Add notification for room stats
          this.addNotification({
            id: Date.now().toString(),
            title: 'Room Stats Updated',
            message: `${this.userStats.totalRooms} total rooms (${response.data.rooms_with_schedules} with schedules, ${response.data.empty_rooms} empty)`,
            data: {
              total_rooms: response.data.total_rooms,
              rooms_with_schedules: response.data.rooms_with_schedules,
              empty_rooms: response.data.empty_rooms,
              total_schedules: response.data.total_schedules
            },
            created_at: new Date().toISOString(),
            time_ago: 'Just now',
            type: 'info',
            read: false
          });
        } else {
          console.error('❌ Invalid response format:', response);
          this.userStats.totalRooms = 0;
          this.roomsTrend = 0;

          this.addNotification({
            id: Date.now().toString(),
            title: 'Room Stats Warning',
            message: 'Received invalid data format from server',
            data: { response },
            created_at: new Date().toISOString(),
            time_ago: 'Just now',
            type: 'warning',
            read: false
          });
        }
      },
      error: (error) => {
        console.error('❌ Error loading room stats:', error);
        this.userStats.totalRooms = 0;
        this.roomsTrend = 0;

        // Add error notification with more details
        this.addNotification({
          id: Date.now().toString(),
          title: 'Room Stats Error',
          message: `Failed to load room statistics: ${error.message || 'Unknown error'}`,
          data: {
            error: error.message,
            status: error.status,
            url: error.url
          },
          created_at: new Date().toISOString(),
          time_ago: 'Just now',
          type: 'error',
          read: false
        });
      }
    });
  }

  private loadBookingStats(): void {
    // This would ideally come from a dedicated API endpoint
    this.userStats.activeBookings = Math.floor(Math.random() * 50) + 20;
    this.bookingsTrend = Math.floor(Math.random() * 20) + 5;
    this.userStats.pendingRequests = Math.floor(Math.random() * 10) + 3;
    this.requestsTrend = Math.floor(Math.random() * 10) - 5;
  }

  private loadUtilizationStats(): void {
    // Calculate utilization based on available data
    const mockUtilization = 65 + Math.floor(Math.random() * 30); // Random between 65-95%
    this.userStats.utilizationRate = mockUtilization;
  }

  private loadMockStats(): void {
      this.userStats = {
      totalRooms: 25,
      activeBookings: 42,
      pendingRequests: 8,
        utilizationRate: 78
      };
    this.roomsTrend = 12;
    this.bookingsTrend = 8;
    this.requestsTrend = -3;
  }

  private loadRealTimeData(): void {
    // Simulate real-time updates
    setInterval(() => {
      this.updateRecentActivities();
      this.updateSystemStatus();
    }, 30000); // Update every 30 seconds
  }

  // Enhanced Notification Service Integration
  private initializeNotificationService(): void {


  
    this.notificationService.notifications$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(notifications => {
      this.notifications = notifications;
      console.log(`📬 Received ${notifications.length} notifications from service`);
      console.log(this.notifications)
    });

    // Start polling for notifications
    this.notificationService.startPolling();

    // Load initial notifications
    this.notificationService.getNotifications().subscribe({
      next: (response) => {
        console.log('✅ Initial notifications loaded:', response);
      },
      error: (error) => {
        console.error('❌ Failed to load initial notifications:', error);
      }
    });
  }

  addNotification(notification: Notification): void {
    // Use the notification service instead of managing locally
    this.notificationService.addLocalNotification({
      type: notification.type,
      title: notification.title,
      message: notification.message,
      data: notification.data,
      read: notification.read
    });
  }

  // Enhanced method to force refresh notifications from backend
  forceRefreshNotifications(): void {
    console.log('🔄 Force refreshing notifications from backend...');

    // Stop current polling to avoid conflicts
    this.notificationService.stopPolling();

    // Clear local state
    this.notificationService.clearNotifications();

    // Restart polling and fetch fresh notifications
    this.notificationService.startPolling();
    this.notificationService.refreshNotifications();

    console.log('✅ Notification refresh completed');
  }

  // Conflict Monitoring Methods
  loadConflictMonitoringStatus(): void {
    console.log('🔍 Loading conflict monitoring status...');

    this.authService.getConflictMonitoringStatus().subscribe({
      next: (response) => {
        if (response.status === 'success') {
          this.conflictMonitoringActive = response.monitoring_active;
          this.conflictScanInterval = response.scan_interval;
          this.lastConflictScan = response.last_scan || 'Never';

          console.log(`📊 Conflict monitoring status: ${this.conflictMonitoringActive ? 'Active' : 'Inactive'}`);

          this.addNotification({
            id: Date.now().toString(),
            title: 'Conflict Monitoring Status',
            message: `Automated conflict detection is ${this.conflictMonitoringActive ? 'active' : 'inactive'}`,
            data: {
              active: this.conflictMonitoringActive,
              interval: this.conflictScanInterval
            },
            created_at: new Date().toISOString(),
            time_ago: 'Just now',
            type: 'info',
            read: false
          });
        }
      },
      error: (error) => {
        console.error('❌ Failed to load conflict monitoring status:', error);
        this.addNotification({
          id: Date.now().toString(),
          title: 'Monitoring Status Error',
          message: 'Failed to load conflict monitoring status',
          data: { error: error.message },
          created_at: new Date().toISOString(),
          time_ago: 'Just now',
          type: 'error',
          read: false
        });
      }
    });
  }

  startConflictMonitoring(): void {
    console.log('🚀 Starting conflict monitoring...');

    this.authService.startConflictMonitoring().subscribe({
      next: (response) => {
        if (response.status === 'success') {
          this.conflictMonitoringActive = true;
          this.conflictScanInterval = response.scan_interval;

          this.addNotification({
            id: Date.now().toString(),
            title: '🚀 Conflict Monitoring Started',
            message: `Automated conflict detection is now active (scanning every ${Math.round(this.conflictScanInterval/60)} minutes)`,
            data: {
              action: 'started',
              interval: this.conflictScanInterval
            },
            created_at: new Date().toISOString(),
            time_ago: 'Just now',
            type: 'success',
            read: false
          });

          console.log('✅ Conflict monitoring started successfully');
        }
      },
      error: (error) => {
        console.error('❌ Failed to start conflict monitoring:', error);
        this.addNotification({
          id: Date.now().toString(),
          title: 'Monitoring Start Failed',
          message: `Failed to start conflict monitoring: ${error.message}`,
          data: { error: error.message },
          created_at: new Date().toISOString(),
          time_ago: 'Just now',
          type: 'error',
          read: false
        });
      }
    });
  }

  stopConflictMonitoring(): void {
    console.log('🛑 Stopping conflict monitoring...');

    this.authService.stopConflictMonitoring().subscribe({
      next: (response) => {
        if (response.status === 'success') {
          this.conflictMonitoringActive = false;

          this.addNotification({
            id: Date.now().toString(),
            title: '🛑 Conflict Monitoring Stopped',
            message: 'Automated conflict detection has been disabled',
            data: { action: 'stopped' },
            created_at: new Date().toISOString(),
            time_ago: 'Just now',
            type: 'warning',
            read: false
          });

          console.log('✅ Conflict monitoring stopped successfully');
        }
      },
      error: (error) => {
        console.error('❌ Failed to stop conflict monitoring:', error);
        this.addNotification({
          id: Date.now().toString(),
          title: 'Monitoring Stop Failed',
          message: `Failed to stop conflict monitoring: ${error.message}`,
          data: { error: error.message },
          created_at: new Date().toISOString(),
          time_ago: 'Just now',
          type: 'error',
          read: false
        });
      }
    });
  }

  runManualConflictScan(): void {
    console.log('🔍 Running manual conflict scan...');

    // Add local notification for immediate feedback
    this.notificationService.addLocalNotification({
      title: '🔍 Manual Conflict Scan Started',
      message: 'Scanning all schedules for conflicts...',
      data: { action: 'scan_started' },
      type: 'info',
      read: false
    });

    this.authService.runManualConflictScan().subscribe({
      next: (response) => {
        if (response.status === 'success') {
          this.conflictsDetected = response.conflicts_found;
          this.lastConflictScan = 'Just now';

          // Add completion notification
          const title = response.conflicts_found > 0
            ? `⚠️ ${response.conflicts_found} Conflict${response.conflicts_found > 1 ? 's' : ''} Found`
            : '✅ No Conflicts Detected';

          const message = response.conflicts_found > 0
            ? `Manual scan detected ${response.conflicts_found} schedule conflict${response.conflicts_found > 1 ? 's' : ''}. Detailed notifications will appear shortly.`
            : 'Manual conflict scan completed successfully. No schedule conflicts detected.';

          this.notificationService.addLocalNotification({
            title: title,
            message: message,
            data: {
              action: 'scan_completed',
              conflicts_found: response.conflicts_found,
              conflicts: response.conflicts
            },
            type: response.conflicts_found > 0 ? 'warning' : 'success',
            read: false
          });

          // Force sync with backend to get detailed conflict notifications
          if (response.conflicts_found > 0) {
            setTimeout(() => {
              this.notificationService.forceSyncWithBackend().subscribe({
                next: () => {
                  console.log('✅ Synced with backend for detailed conflict notifications');
                },
                error: (error) => {
                  console.error('❌ Failed to sync with backend:', error);
                }
              });
            }, 2000); // Wait 2 seconds for backend to process conflicts
          }

          console.log(`✅ Manual conflict scan completed. Found ${response.conflicts_found} conflicts`);
        }
      },
      error: (error) => {
        console.error('❌ Manual conflict scan failed:', error);
        this.notificationService.addLocalNotification({
          title: 'Manual Scan Failed',
          message: `Failed to run manual conflict scan: ${error.message}`,
          data: { error: error.message },
          type: 'error',
          read: false
        });
      }
    });
  }

  clearOldNotificationsAndScan(): void {
    console.log('🧹 Clearing old notifications and running fresh conflict scan...');

    // Use the notification service to properly clear notifications
    this.notificationService.clearNotifications();

    // Add a notification about the refresh through the service
    this.notificationService.addLocalNotification({
      title: '🔄 Refreshing Conflict Detection',
      message: 'Clearing old notifications and running fresh scan with enhanced details...',
      data: { action: 'refresh_started' },
      type: 'info',
      read: false
    });

    // Run the manual scan which will generate new detailed notifications
    setTimeout(() => {
      this.runManualConflictScan();
    }, 1000);
  }

  // For testing - create a sample detailed notification
  createSampleDetailedNotification(): void {
    console.log('🧪 Creating sample detailed conflict notification...');

    const sampleConflicts = [
      {
        room_id: 'SCB-GF17',
        day: 'Thursday',
        severity: 'Critical',
        conflict_type: 'exact_duplicate',
        overlap_period: '10:30-12:25',
        overlap_duration_minutes: 115,
        overlap_duration_formatted: '1h 55m',
        schedule1: {
          course: 'SOC 469 - Social Research Methods',
          department: 'Social Sciences',
          lecturer: 'Dr. Sarah Johnson',
          time_slot: '10:30-12:25'
        },
        schedule2: {
          course: 'ECON 151 - Microeconomics',
          department: 'Economics',
          lecturer: 'Prof. Michael Chen',
          time_slot: '10:30-12:25'
        },
        detected_at: new Date().toISOString(),
        conflict_hash: 'SCB-GF17_Thursday_ECON151_SOC469',
        actionable_data: {
          departments_affected: ['Social Sciences', 'Economics'],
          lecturers_affected: ['Dr. Sarah Johnson', 'Prof. Michael Chen'],
          courses_affected: ['SOC 469', 'ECON 151'],
          resolution_priority: 'IMMEDIATE',
          estimated_impact: 'HIGH - Significant disruption to both courses'
        }
      }
    ];

    this.addNotification({
      id: Date.now().toString(),
      title: '🚨 CRITICAL: 1 Duplicate Schedule Detected',
      message: `🔍 AUTOMATED SCAN RESULTS:\nFound 1 critical schedule conflict requiring immediate attention.\n\n📋 CONFLICT DETAILS:\n\n🚨 CONFLICT #1:\n   📍 Room ID: SCB-GF17\n   📅 Day: Thursday\n   ⏰ Conflicting Time: 10:30-12:25\n   ⚡ Severity: Critical (exact_duplicate)\n   📚 Course 1: SOC 469 - Social Research Methods (Social Sciences)\n   👨‍🏫 Lecturer 1: Dr. Sarah Johnson\n   📚 Course 2: ECON 151 - Microeconomics (Economics)\n   👨‍🏫 Lecturer 2: Prof. Michael Chen\n   ⏱️ Overlap Duration: 1h 55m\n   🎯 Action Required: Immediate resolution needed\n\n🔧 RECOMMENDED ACTIONS:\n1. Review conflicting schedules immediately\n2. Contact department coordinators\n3. Reschedule one of the conflicting courses\n4. Verify room assignments are correct\n\n🕐 Detected at: ${new Date().toLocaleString()}`,
      data: {
        notification_type: 'critical_conflicts',
        severity: 'Critical',
        conflict_count: 1,
        conflicts: sampleConflicts,
        action_required: true,
        scan_timestamp: new Date().toISOString(),
        summary: {
          total_conflicts: 1,
          rooms_affected: ['SCB-GF17'],
          days_affected: ['Thursday'],
          departments_affected: ['Social Sciences', 'Economics'],
          severity_breakdown: {
            critical: 1,
            high: 0,
            medium: 0,
            low: 0
          }
        }
      },
      created_at: new Date().toISOString(),
      time_ago: 'Just now',
      type: 'schedule_conflict',
      read: false
    });

    console.log('✅ Sample detailed notification created');
  }

  viewConflictDetails(notification: Notification): void {
    console.log('📋 Viewing conflict details for notification:', notification.id);

    if (!notification.data?.conflicts) {
      console.warn('No conflict data available in notification');
      return;
    }

    // Create comprehensive conflict information display
    const conflicts = notification.data.conflicts;
    const conflictCount = conflicts.length;
    const displayData = notification.data.display_data;

    let detailsMessage = `📊 COMPREHENSIVE CONFLICT ANALYSIS\n\n`;
    detailsMessage += `🔍 Scan Results: ${conflictCount} conflict${conflictCount > 1 ? 's' : ''} detected\n`;
    detailsMessage += `⚡ Severity: ${notification.data.severity}\n`;
    detailsMessage += `🕐 Detected: ${notification.data.scan_timestamp ? new Date(notification.data.scan_timestamp).toLocaleString() : 'Unknown'}\n\n`;

    // Enhanced summary with all required information
    if (notification.data.summary) {
      detailsMessage += `📈 IMPACT SUMMARY:\n`;
      detailsMessage += `📍 Rooms affected: ${notification.data.summary.rooms_affected?.join(', ') || 'Unknown'}\n`;
      detailsMessage += `📅 Days affected: ${notification.data.summary.days_affected?.join(', ') || 'Unknown'}\n`;
      detailsMessage += `🏢 Departments: ${notification.data.summary.departments_affected?.join(', ') || 'Unknown'}\n`;

      if (notification.data.summary.severity_breakdown) {
        const breakdown = notification.data.summary.severity_breakdown;
        detailsMessage += `⚡ Severity breakdown: Critical(${breakdown.critical}), High(${breakdown.high}), Medium(${breakdown.medium}), Low(${breakdown.low})\n`;
      }
      detailsMessage += `\n`;
    }

    // Quick overview using display data
    if (displayData) {
      detailsMessage += `🎯 QUICK OVERVIEW:\n`;
      detailsMessage += `📍 Room IDs: ${displayData.room_ids?.slice(0, 5).join(', ')}${displayData.room_ids?.length > 5 ? '...' : ''}\n`;
      detailsMessage += `📅 Days: ${displayData.days_of_week?.slice(0, 5).join(', ')}${displayData.days_of_week?.length > 5 ? '...' : ''}\n`;
      detailsMessage += `⏰ Time slots: ${displayData.conflicting_time_slots?.slice(0, 3).join(', ')}${displayData.conflicting_time_slots?.length > 3 ? '...' : ''}\n`;
      detailsMessage += `⏱️ Durations: ${displayData.overlap_durations?.slice(0, 3).join(', ')}${displayData.overlap_durations?.length > 3 ? '...' : ''}\n\n`;
    }

    detailsMessage += `🚨 DETAILED CONFLICT BREAKDOWN:\n\n`;

    conflicts.slice(0, 5).forEach((conflict: any, index: number) => {
      detailsMessage += `═══ CONFLICT #${index + 1} ═══\n`;
      detailsMessage += `📍 Room ID: ${conflict.room_id}\n`;
      detailsMessage += `📅 Day of Week: ${conflict.day}\n`;
      detailsMessage += `⏰ Conflicting Time Slot: ${conflict.overlap_period}\n`;
      detailsMessage += `⏱️ Overlap Duration: ${conflict.overlap_duration_formatted} (${conflict.overlap_duration_minutes} minutes)\n`;
      detailsMessage += `⚡ Severity Level: ${conflict.severity}\n\n`;

      detailsMessage += `📚 COURSE 1:\n`;
      detailsMessage += `   Course Name: ${conflict.schedule1?.course}\n`;
      detailsMessage += `   👨‍🏫 Lecturer: ${conflict.schedule1?.lecturer}\n`;
      detailsMessage += `   🏢 Department: ${conflict.schedule1?.department}\n`;
      detailsMessage += `   🕐 Full Time Slot: ${conflict.schedule1?.time_slot}\n\n`;

      detailsMessage += `📚 COURSE 2:\n`;
      detailsMessage += `   Course Name: ${conflict.schedule2?.course}\n`;
      detailsMessage += `   👨‍🏫 Lecturer: ${conflict.schedule2?.lecturer}\n`;
      detailsMessage += `   🏢 Department: ${conflict.schedule2?.department}\n`;
      detailsMessage += `   🕐 Full Time Slot: ${conflict.schedule2?.time_slot}\n\n`;

      if (conflict.actionable_data) {
        detailsMessage += `🎯 ACTIONABLE DATA:\n`;
        detailsMessage += `   Resolution Priority: ${conflict.actionable_data.resolution_priority}\n`;
        detailsMessage += `   Estimated Impact: ${conflict.actionable_data.estimated_impact}\n`;
        detailsMessage += `   Departments to Contact: ${conflict.actionable_data.departments_affected?.join(', ')}\n`;
        detailsMessage += `   Lecturers to Contact: ${conflict.actionable_data.lecturers_affected?.join(', ')}\n`;
        detailsMessage += `   Courses Affected: ${conflict.actionable_data.courses_affected?.join(', ')}\n`;
      }
      detailsMessage += `\n`;
    });

    if (conflictCount > 5) {
      detailsMessage += `⚠️ ... and ${conflictCount - 5} more conflicts (showing first 5 only)\n\n`;
    }

    detailsMessage += `🔧 RECOMMENDED ADMINISTRATIVE ACTIONS:\n`;
    detailsMessage += `1. 📞 Contact affected departments immediately\n`;
    detailsMessage += `2. 👨‍🏫 Notify lecturers of scheduling conflicts\n`;
    detailsMessage += `3. 📅 Reschedule one of the conflicting courses\n`;
    detailsMessage += `4. 🏢 Verify room assignments are correct\n`;
    detailsMessage += `5. 📝 Update scheduling system to prevent future conflicts\n`;
    detailsMessage += `6. 📊 Monitor for recurring patterns\n\n`;

    detailsMessage += `📋 CONFLICT RESOLUTION CHECKLIST:\n`;
    detailsMessage += `☐ Reviewed all conflict details\n`;
    detailsMessage += `☐ Contacted affected departments\n`;
    detailsMessage += `☐ Notified lecturers\n`;
    detailsMessage += `☐ Identified resolution approach\n`;
    detailsMessage += `☐ Updated schedules\n`;
    detailsMessage += `☐ Verified no new conflicts created\n`;

    // Display in a modal or alert (you can enhance this with a proper modal later)
    alert(detailsMessage);

    // Enhanced logging for debugging
    console.log('📋 Comprehensive Conflict Details:', {
      notification_id: notification.id,
      conflict_count: conflictCount,
      severity: notification.data.severity,
      conflicts: conflicts,
      summary: notification.data.summary,
      display_data: displayData,
      scan_timestamp: notification.data.scan_timestamp
    });
  }

  // Navigation methods (existing methods remain the same)
  navigateToSchedules(): void {
    this.currentRoute = 'schedules';
    this.router.navigate(['/adjust-schedules']);
  }

  navigateToRooms(): void {
    this.currentRoute = 'rooms';
    this.router.navigate(['/executive-booking']);
  }

  navigateToAnalytics(): void {
    this.currentRoute = 'analytics';
    this.router.navigate(['/ai-insights']);
  }

  navigateToCourses(): void {
    this.currentRoute = 'courses';
    this.showComingSoonMessage('Courses Management');
  }

  navigateToDepartments(): void {
    this.currentRoute = 'departments';
    this.showComingSoonMessage('Departments Management');
  }

  navigateToReports(): void {
    this.currentRoute = 'reports';
    this.showComingSoonMessage('Reports & Analytics');
  }

  navigateToSettings(): void {
    this.currentRoute = 'settings';
    this.showComingSoonMessage('System Settings');
  }

  navigateToHelp(): void {
    this.currentRoute = 'help';
    this.showComingSoonMessage('Help & Support');
  }

  navigateToBookings(): void {
    this.router.navigate(['/executive-booking']);
  }

  navigateToRequests(): void {
    this.showComingSoonMessage('Pending Requests Management');
  }

  private showComingSoonMessage(feature: string): void {
    alert(`${feature} feature coming soon!`);
  }

  // UI interaction methods
  toggleSidebar(): void {
    this.sidebarOpen = !this.sidebarOpen;
  }

  toggleNotifications(): void {
    this.showNotifications = !this.showNotifications;
    this.showUserMenu = false;
  }

  toggleUserMenu(): void {
    this.showUserMenu = !this.showUserMenu;
    this.showNotifications = false;
  }

  markAllAsRead(): void {
    console.log('📖 Marking all notifications as read...');
    this.notificationService.markAllAsRead().subscribe({
      next: () => {
        console.log('✅ All notifications marked as read');
      },
      error: (error) => {
        console.error('❌ Failed to mark all notifications as read:', error);
      }
    });
  }

  markNotificationAsRead(notification: Notification): void {
    console.log(`📖 Marking notification ${notification.id} as read...`);
    this.notificationService.markAsRead(notification.id).subscribe({
      next: () => {
        console.log(`✅ Notification ${notification.id} marked as read`);
      },
      error: (error) => {
        console.error(`❌ Failed to mark notification ${notification.id} as read:`, error);
      }
    });
  }

  viewAllActivity(): void {
    this.showComingSoonMessage('Activity Log');
  }

  navigateToCard(route: string): void {
    this.router.navigate([route]);
  }

  trackByFn(index: number, item: DashboardCard): string {
    return item.title;
  }

  logout(): void {
    localStorage.clear(); // Clear all stored data
    this.router.navigate(['/login-page']);
  }

  // Utility methods
  private checkScreenSize(): void {
    this.isMobile = window.innerWidth < 768;
    if (!this.isMobile && this.sidebarOpen) {
      this.sidebarOpen = false;
    }
  }



  get unreadNotificationCount(): number {
    return this.notifications.filter(n => !n.read).length;
  }

  get hasUnreadNotifications(): boolean {
    return this.notifications.filter(n => !n.read).length > 0;
  }

  // Removed: Old notification methods - now handled by NotificationService

  private initializeRecentActivities(): void {
    this.recentActivities = [
      {
        id: '1',
        title: 'Room SCB-SF1 Booked',
        description: 'CSM 157 scheduled for Monday 1:00 PM',
        timestamp: '2 minutes ago',
        type: 'booking',
        icon: 'fas fa-calendar-check'
      },
      {
        id: '2',
        title: 'Schedule Updated',
        description: 'MATH 161 moved to room SCB-TF1',
        timestamp: '10 minutes ago',
        type: 'schedule',
        icon: 'fas fa-edit'
      },
      {
        id: '3',
        title: 'New Room Added',
        description: 'FOSSB-GF8 added to available rooms',
        timestamp: '1 hour ago',
        type: 'room',
        icon: 'fas fa-door-open'
      }
    ];
  }

  private initializeSystemStatus(): void {
    this.systemStatus = {
      overall: 'healthy',
      services: [
        { name: 'Database', status: 'healthy' },
        { name: 'API Services', status: 'healthy' },
        { name: 'AI Predictions', status: 'healthy' },
        { name: 'Backup System', status: 'warning' }
      ]
    };
  }

  private updateRecentActivities(): void {
    // Simulate new activities
    const newActivity: RecentActivity = {
      id: Date.now().toString(),
      title: 'Real-time Update',
      description: 'System automatically refreshed data',
      timestamp: 'Just now',
      type: 'booking',
      icon: 'fas fa-sync'
    };
    
    this.recentActivities.unshift(newActivity);
    if (this.recentActivities.length > 5) {
      this.recentActivities.pop();
    }
  }

  private updateSystemStatus(): void {
    // Simulate system status updates
    this.systemStatus.services.forEach(service => {
      if (Math.random() > 0.9) {
        service.status = service.status === 'healthy' ? 'warning' : 'healthy';
      }
    });
    
    const hasWarning = this.systemStatus.services.some(s => s.status === 'warning');
    const hasError = this.systemStatus.services.some(s => s.status === 'error');
    
    if (hasError) {
      this.systemStatus.overall = 'error';
    } else if (hasWarning) {
      this.systemStatus.overall = 'warning';
    } else {
      this.systemStatus.overall = 'healthy';
    }
  }

  private setupEventListeners(): void {
    // Setup search debouncing
    this.setupSearchDebouncing();
    
    // Setup other event listeners as needed
    this.initializeRecentActivities();
    this.initializeSystemStatus();
  }
}