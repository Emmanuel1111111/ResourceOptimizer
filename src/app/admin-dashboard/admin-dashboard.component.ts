// admin-dashboard.component.ts
import { Component, OnInit, OnDestroy, HostListener, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, filter, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { AuthService } from '../service.service';
import { AdminAuthService } from '../services/admin-auth.service';
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
  private notificationPolling$ = new Subject<void>();

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
      title: 'AI Predictions',
      icon: '📊',
      description: 'View AI-powered insights on classroom demand, usage patterns, and optimization recommendations.',
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
    private http: HttpClient
  ) {
    this.checkScreenSize();
    this.setupEventListeners();
  }

  ngOnInit(): void {
    this.initializeComponent();
    this.loadUserStats();
    this.loadUserProfile();
    this.loadRealTimeData();
    this.setupRouteTracking();
    this.setupNotificationPolling();
    this.initializeNotifications(); // Add this line
  }

  ngAfterViewInit(): void {
    this.setupSidebarScrollSync();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.searchSubject.complete();
    this.notificationPolling$.complete();
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
    
    // Close mobile sidebar when clicking outside
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
    this.userId = localStorage.getItem('userId');
    if (!this.userId) {
      this.router.navigate(['/login-page']);
      return;
    }
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

  private setupNotificationPolling(): void {
    // Poll for new notifications every 30 seconds
    setInterval(() => {
      this.checkForNewNotifications();
    }, 30000);
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
        // Save to localStorage for persistence
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

  private loadRoomStats(): void {
    // Get total rooms from backend
    this.authService.getAvailableRooms().subscribe({
      next: (response) => {
        this.userStats.totalRooms = response.rooms?.length || 0;
        this.roomsTrend = Math.floor(Math.random() * 15) + 5; // Mock trend for now
        
        // Add notification for room stats
        this.addNotification({
          id: Date.now().toString(),
          title: 'Room Stats Updated',
          message: `${this.userStats.totalRooms} rooms available in system`,
          data: {},
          created_at: new Date().toISOString(),
          time_ago: 'Just now',
          type: 'info',
          read: false
        });
      },
      error: () => {
        this.userStats.totalRooms = 25; // Fallback
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

  // Notification methods
  private checkForNewNotifications(): void {
    // Check for operations on rooms and add notifications
    const newNotifications = [
      {
        id: Date.now().toString(),
        title: 'System Health Check',
        message: 'All systems operating normally',
        data: {},
        created_at: new Date().toISOString(),
        time_ago: 'Just now',
        type: 'success',
        read: false
      }
    ];
    
    // Add new notifications without duplicates
    newNotifications.forEach(notification => {
      if (!this.notifications.find(n => n.title === notification.title)) {
        this.notifications.unshift(notification);
      }
    });
    
    // Keep only last 10 notifications
    this.notifications = this.notifications.slice(0, 10);
  }

  addNotification(notification: Notification): void {
    this.notifications.unshift(notification);
    this.notifications = this.notifications.slice(0, 10);
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
    const apiUrl = environment.apiUrl || 'http://localhost:5000';
    
    this.http.post(`${apiUrl}/api/admin/notifications/read-all`, {}).subscribe({
      next: () => {
        // Mark all notifications as read locally
        this.notifications = this.notifications.map(notification => ({
          ...notification,
          read: true
        }));
        // this.unreadNotificationCount = 0; // This line is removed
      },
      error: (error) => {
        console.error('Error marking notifications as read:', error);
      }
    });
  }

  markNotificationAsRead(notification: Notification): void {
    const apiUrl = environment.apiUrl || 'http://localhost:5000';
    
    this.http.post(`${apiUrl}/api/admin/notifications/${notification.id}/read`, {}).subscribe({
      next: () => {
        // Mark notification as read locally
        this.notifications = this.notifications.map(n => 
          n.id === notification.id ? { ...n, read: true } : n
        );
        // this.unreadNotificationCount = Math.max(0, this.unreadNotificationCount - 1); // This line is removed
      },
      error: (error) => {
        console.error('Error marking notification as read:', error);
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

  // Data initialization methods (existing methods remain the same but enhanced)
  private initializeNotifications(): void {
    // Load real-time notifications from the server
    this.loadRealTimeNotifications();
    
    // Set up polling for new notifications every 30 seconds
    this.notificationPolling$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.loadRealTimeNotifications();
    });
  }

  private loadRealTimeNotifications(): void {
    const apiUrl = environment.apiUrl || 'http://localhost:5000';
    
    this.http.get<{notifications: Notification[], unread_count: number}>(`${apiUrl}/api/admin/notifications`).subscribe({
      next: (response) => {
        this.notifications = response.notifications;
        // this.unreadNotificationCount = response.unread_count; // This line is removed
      },
      error: (error) => {
        console.error('Error loading notifications:', error);
        // Fallback to empty notifications
        this.notifications = [];
        // this.unreadNotificationCount = 0; // This line is removed
      }
    });
  }

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