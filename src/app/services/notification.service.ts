import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable, interval } from 'rxjs';
import { switchMap, tap, catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { SecurityService } from './security.service';

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  data: any;
  read: boolean;
  created_at: string;
  time_ago: string;
}

export interface NotificationResponse {
  notifications: Notification[];
  unread_count: number;
}

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private notificationsSubject = new BehaviorSubject<Notification[]>([]);
  private unreadCountSubject = new BehaviorSubject<number>(0);
  
  public notifications$ = this.notificationsSubject.asObservable();
  public unreadCount$ = this.unreadCountSubject.asObservable();
  
  private readonly apiUrl = environment.apiUrl || 'http://localhost:5000';
  private pollingInterval = 30000; // 30 seconds
  private pollingSubscription: any;

  constructor(private http: HttpClient, private securityService: SecurityService) {
    // Don't start polling automatically - wait for user authentication
  }

  /**
   * Get authenticated headers for API requests
   */
  private getAuthHeaders(): HttpHeaders | null {
    const token = this.securityService.getSecureToken();
    if (!token) {
      console.log('No valid admin token found for authentication');
      return null;
    }

    return new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    });
  }

  /**
   * Get notifications from the server
   */
  getNotifications(unreadOnly: boolean = false, limit: number = 50): Observable<NotificationResponse> {
    // Get authenticated headers
    const headers = this.getAuthHeaders();
    if (!headers) {
     
      return new Observable(subscriber => {
        subscriber.next({ notifications: [], unread_count: 0 });
        subscriber.complete();
      });
    }

    const params = {
      unread_only: unreadOnly.toString(),
      limit: limit.toString()
    };

    return this.http.get<NotificationResponse>(`${this.apiUrl}/admin/notifications`, {
      params,
      headers
    }).pipe(
      tap(response => {

        this.notificationsSubject.next(response.notifications);
        this.unreadCountSubject.next(response.unread_count);
      }),
      catchError(error => {
  
        if (error.status === 401) {
          console.log('🔐 Authentication error - token may be expired');
          this.notificationsSubject.next([]);
          this.unreadCountSubject.next(0);
        }
        return [];
      })
    );
  }

  /**
   * Mark a notification as read
   */
  markAsRead(notificationId: string): Observable<any> {
    // Get authenticated headers
    const headers = this.getAuthHeaders();
    if (!headers) {
      console.log('No valid authentication, skipping mark as read request');
      return new Observable(subscriber => {
        subscriber.next({});
        subscriber.complete();
      });
    }

    return this.http.post(`${this.apiUrl}/admin/notifications/${notificationId}/read`, {}, { headers }).pipe(
      tap(() => {
        // Update local state
        const notifications = this.notificationsSubject.value.map(notification => 
          notification.id === notificationId ? { ...notification, read: true } : notification
        );
        this.notificationsSubject.next(notifications);
        
        // Update unread count
        const unreadCount = notifications.filter(n => !n.read).length;
        this.unreadCountSubject.next(unreadCount);
      }),
      catchError(error => {
        console.error('Error marking notification as read:', error);
        if (error.status === 401) {
          console.log('Authentication error in mark as read');
        }
        return [];
      })
    );
  }

  /**
   * Mark all notifications as read
   */
  markAllAsRead(): Observable<any> {
    // Get authenticated headers
    const headers = this.getAuthHeaders();
    if (!headers) {
      console.log('No valid authentication, skipping mark all as read request');
      return new Observable(subscriber => {
        subscriber.next({});
        subscriber.complete();
      });
    }

    return this.http.post(`${this.apiUrl}/admin/notifications/read-all`, {}, { headers }).pipe(
      tap(() => {
        // Update local state
        const notifications = this.notificationsSubject.value.map(notification => ({
          ...notification,
          read: true
        }));
        this.notificationsSubject.next(notifications);
        this.unreadCountSubject.next(0);
      }),
      catchError(error => {
        console.error('Error marking all notifications as read:', error);
        if (error.status === 401) {
          console.log('Authentication error in mark all as read');
        }
        return [];
      })
    );
  }

  /**
   * Get unread notification count
   */
  getUnreadCount(): Observable<{unread_count: number}> {
    // Get authenticated headers
    const headers = this.getAuthHeaders();
    if (!headers) {
      console.log('No valid authentication, skipping unread count request');
      return new Observable(subscriber => {
        subscriber.next({ unread_count: 0 });
        subscriber.complete();
      });
    }

    return this.http.get<{unread_count: number}>(`${this.apiUrl}/admin/notifications/unread-count`, { headers }).pipe(
      tap(response => {
        this.unreadCountSubject.next(response.unread_count);
      }),
      catchError(error => {
        console.error('Error fetching unread count:', error);
        if (error.status === 401) {
          console.log('Authentication error in unread count');
          this.unreadCountSubject.next(0);
        }
        return [];
      })
    );
  }

  /**
   * Start polling for notifications (call this after user login)
   */
  startPolling(): void {
    if (this.pollingSubscription) {
      this.stopPolling();
    }
    
    this.pollingSubscription = interval(this.pollingInterval).pipe(
      switchMap(() => this.getNotifications())
    ).subscribe();
  }

  /**
   * Stop polling
   */
  stopPolling(): void {
    if (this.pollingSubscription) {
      this.pollingSubscription.unsubscribe();
    }
  }

  /**
   * Refresh notifications immediately
   */
  refreshNotifications(): void {
    this.getNotifications().subscribe();
  }

  /**
   * Get current notifications
   */
  getCurrentNotifications(): Notification[] {
    return this.notificationsSubject.value;
  }

  /**
   * Get current unread count
   */
  getCurrentUnreadCount(): number {
    return this.unreadCountSubject.value;
  }

  /**
   * Add a local notification (for immediate feedback)
   */
  addLocalNotification(notification: Omit<Notification, 'id' | 'created_at' | 'time_ago'>): void {
    const newNotification: Notification = {
      ...notification,
      id: Date.now().toString(),
      created_at: new Date().toISOString(),
      time_ago: 'Just now'
    };

    const currentNotifications = this.notificationsSubject.value;
    this.notificationsSubject.next([newNotification, ...currentNotifications]);

    if (!newNotification.read) {
      this.unreadCountSubject.next(this.unreadCountSubject.value + 1);
    }
  }

  /**
   * Clear all notifications (local only)
   */
  clearNotifications(): void {
    this.notificationsSubject.next([]);
    this.unreadCountSubject.next(0);
  }

  /**
   * Clear all notifications and sync with backend
   */
  clearAllNotifications(): Observable<any> {
    // Get authenticated headers
    const headers = this.getAuthHeaders();
    if (!headers) {
      console.log('No valid authentication, clearing local notifications only');
      this.clearNotifications();
      return new Observable(subscriber => {
        subscriber.next({});
        subscriber.complete();
      });
    }

    return this.http.delete(`${this.apiUrl}/admin/notifications/clear-all`, { headers }).pipe(
      tap(() => {
        // Clear local state after successful backend clear
        this.clearNotifications();
      }),
      catchError(error => {
        console.error('Error clearing all notifications:', error);
        // Still clear local notifications even if backend fails
        this.clearNotifications();
        return [];
      })
    );
  }

  /**
   * Force sync with backend (useful after conflict scans)
   */
  forceSyncWithBackend(): Observable<NotificationResponse> {
    console.log('🔄 Force syncing notifications with backend...');

    // Stop polling temporarily
    this.stopPolling();

    // Fetch fresh notifications
    return this.getNotifications().pipe(
      tap(() => {
        // Restart polling after sync
        this.startPolling();
        console.log('✅ Notification sync completed');
      }),
      catchError(error => {
        console.error('❌ Failed to sync with backend:', error);
        // Restart polling even if sync fails
        this.startPolling();
        throw error;
      })
    );
  }
} 