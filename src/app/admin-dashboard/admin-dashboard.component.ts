// admin-dashboard.component.ts
import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { Router } from '@angular/router';
import { MatChipsModule } from '@angular/material/chips';
import { AuthService } from '../service.service';
import { HttpClient } from '@angular/common/http';
import { api } from '../../api.config';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

interface DashboardCard {
  title: string;
  icon: string;
  description: string;
  route: string;
  buttonText: string;
  gradient: string;
  textColor?: string;
}

interface UserStats {
  totalRooms: number;
  activeBookings: number;
  pendingRequests: number;
  utilizationRate: number;
}

@Component({
  selector: 'app-admin-dashboard',
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.css'
})
export class AdminDashboardComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  
  sidebarOpen: boolean = false;
  isMobile: boolean = false;
  userId: string | null = null;
  userStats: UserStats = {
    totalRooms: 0,
    activeBookings: 0,
    pendingRequests: 0,
    utilizationRate: 0
  };

  dashboardCards: DashboardCard[] = [
    {
      title: 'Manage Resources',
      icon: '📌',
      description: 'Allocate classrooms, labs, and other resources efficiently. Monitor availability and optimize resource distribution.',
      route: '/executive-booking',
      buttonText: 'Go to Resources',
      gradient: 'linear-gradient(135deg,rgb(236, 89, 31) 0%,rgb(127, 69, 184) 100%)',
      textColor: 'white',
     
    },
    {
      title: 'AI Predictions',
      icon: '📊',
      description: 'View AI-powered insights on classroom demand, usage patterns, and optimization recommendations.',
      route: '/ai-insights',
      buttonText: 'View AI Insights',
      gradient: 'linear-gradient(135deg,rgb(196, 38, 214) 0%,rgb(0, 0, 0) 100%)',
      textColor: 'white'
    },
    {
      title: 'Adjust Schedules',
      icon: '🗓️',
      description: 'Modify classroom schedules, resolve conflicts, and manage time slot allocations effectively.',
      route: '/adjust-schedules',
      buttonText: 'Adjust Schedules',
      gradient: 'linear-gradient(135deg,rgb(24, 53, 180) 0%,rgb(179, 83, 217) 100%)',
      textColor: 'white'
    },

  ];

  constructor(
    private router: Router,
    private authService: AuthService,
   
  ) {
    this.checkScreenSize();
  }

  ngOnInit(): void {
    this.initializeComponent();
    this.loadUserStats();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  @HostListener('window:resize', ['$event'])
  onResize(event: any): void {
    this.checkScreenSize();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    const target = event.target as HTMLElement;
    const sidebar = document.querySelector('.sidebar');
    const toggleButton = document.querySelector('.sidebar-toggle');
    
    if (this.isMobile && this.sidebarOpen && sidebar && toggleButton) {
      if (!sidebar.contains(target) && !toggleButton.contains(target)) {
        this.sidebarOpen = false;
      }
    }
  }

  private initializeComponent(): void {
    this.userId = localStorage.getItem('userId');
    if (!this.userId) {
      this.router.navigate(['/login']);
      return;
    }
  }

  private checkScreenSize(): void {
    this.isMobile = window.innerWidth <= 1300;
    if (!this.isMobile) {
      this.sidebarOpen = false;
    }
  }

  private loadUserStats(): void {
   
    setTimeout(() => {
      this.userStats = {
        totalRooms: 45,
        activeBookings: 23,
        pendingRequests: 7,
        utilizationRate: 78
      };
    }, 1000);
  }

  toggleSidebar(): void {
    this.sidebarOpen = !this.sidebarOpen;
  }

navigateToCard(route: string): void {
  const baseRoute = route.startsWith('/') ? route.slice(1) : route;

  if (baseRoute === 'adjust-schedules' && this.userId) {
    this.router.navigate([baseRoute, this.userId.toString()]);
  } else {
    this.router.navigate([baseRoute]);
  }
}

  onCardHover(event: MouseEvent, entering: boolean): void {
    const card = event.currentTarget as HTMLElement;
    if (entering) {
      card.style.transform = 'translateY(-8px) scale(1.02)';
    } else {
      card.style.transform = 'translateY(0) scale(1)';
    }
  }

  logout(): void {
    if (this.authService.logout) {
      this.authService.logout();
    } else {
      localStorage.removeItem('userId');
      localStorage.removeItem('userToken');
    }
    this.router.navigate(['/login']);
  }

  trackByFn(index: number, item: DashboardCard): string {
    return item.title;
  }

 
}