import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, timer, interval } from 'rxjs';
import { switchMap, tap, catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';

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

  constructor(private http: HttpClient) {
    this.startPolling();
  }

  /**
   * Get notifications from the server
   */
  getNotifications(unreadOnly: boolean = false, limit: number = 50): Observable<NotificationResponse> {
    const params = {
      unread_only: unreadOnly.toString(),
      limit: limit.toString()
    };

    return this.http.get<NotificationResponse>(`${this.apiUrl}/api/admin/notifications`, { params }).pipe(
      tap(response => {
        this.notificationsSubject.next(response.notifications);
        this.unreadCountSubject.next(response.unread_count);
      }),
      catchError(error => {
        console.error('Error fetching notifications:', error);
        return [];
      })
    );
  }

  /**
   * Mark a notification as read
   */
  markAsRead(notificationId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/api/admin/notifications/${notificationId}/read`, {}).pipe(
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
        return [];
      })
    );
  }

  /**
   * Mark all notifications as read
   */
  markAllAsRead(): Observable<any> {
    return this.http.post(`${this.apiUrl}/api/admin/notifications/read-all`, {}).pipe(
      tap(response => {
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
        return [];
      })
    );
  }

  /**
   * Get unread count
   */
  getUnreadCount(): Observable<{unread_count: number}> {
    return this.http.get<{unread_count: number}>(`${this.apiUrl}/api/admin/notifications/unread-count`).pipe(
      tap(response => {
        this.unreadCountSubject.next(response.unread_count);
      }),
      catchError(error => {
        console.error('Error getting unread count:', error);
        return [];
      })
    );
  }

  /**
   * Start polling for new notifications
   */
  startPolling(): void {
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
   * Clear all notifications
   */
  clearNotifications(): void {
    this.notificationsSubject.next([]);
    this.unreadCountSubject.next(0);
  }
} 