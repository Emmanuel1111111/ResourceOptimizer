import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, retry, timeout } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = 'http://localhost:5000';
  private retryAttempts = 3;
  private timeoutDuration = 30000;

  constructor(private http: HttpClient) {}

  private getHeaders(): HttpHeaders {
    const token = localStorage.getItem('token');
    return new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : ''
    });
  }

  private handleError(error: HttpErrorResponse) {
    console.error('API Error:', error);
    
    if (error.status === 0) {
      return throwError(() => new Error('Network error. Please check your connection.'));
    } else if (error.error instanceof ErrorEvent) {
      return throwError(() => new Error(`Client error: ${error.error.message}`));
    } else {
      return throwError(() => new Error(`Server error: ${error.status} - ${error.message}`));
    }
  }

  checkDatabaseStatus(): Observable<any> {
    return this.http.get(`${this.apiUrl}/db_status`, { headers: this.getHeaders() })
      .pipe(
        timeout(this.timeoutDuration),
        retry(this.retryAttempts),
        catchError(this.handleError)
      );
  }

  login(credentials: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/login`, credentials)
      .pipe(
        timeout(this.timeoutDuration),
        retry(this.retryAttempts),
        catchError(this.handleError)
      );
  }

  register(userData: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/register`, userData)
      .pipe(
        timeout(this.timeoutDuration),
        retry(this.retryAttempts),
        catchError(this.handleError)
      );
  }

  logout(): void {
    localStorage.removeItem('token');
  }

  isAuthenticated(): boolean {
    const token = localStorage.getItem('token');
    return !!token;
  }

  getToken(): string | null {
    return localStorage.getItem('token');
  }

  getAvailableRooms(roomId?: string): Observable<any> {
    const url = roomId ? `${this.apiUrl}/available_rooms?room_id=${roomId}` : `${this.apiUrl}/available_rooms`;
    return this.http.get(url, { headers: this.getHeaders() })
      .pipe(
        timeout(this.timeoutDuration),
        retry(this.retryAttempts),
        catchError(this.handleError)
      );
  }

  getRoomSchedules(roomId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/room_schedules?room_id=${roomId}`, { headers: this.getHeaders() })
      .pipe(
        timeout(this.timeoutDuration),
        retry(this.retryAttempts),
        catchError(this.handleError)
      );
  }

  refreshAggregatedData(roomId?: string): Observable<any> {
    const url = roomId ? `${this.apiUrl}/refresh_aggregated_data?room_id=${roomId}` : `${this.apiUrl}/refresh_aggregated_data`;
    return this.http.get(url, { headers: this.getHeaders() })
      .pipe(
        timeout(this.timeoutDuration),
        retry(this.retryAttempts),
        catchError(this.handleError)
      );
  }

  currentUtilization(roomId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/current_utilization?room_id=${roomId}`, { headers: this.getHeaders() })
      .pipe(
        timeout(this.timeoutDuration),
        retry(this.retryAttempts),
        catchError(this.handleError)
      );
  }

  getDayBasedSchedules(roomId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/day_based_schedules?room_id=${roomId}`, { headers: this.getHeaders() })
      .pipe(
        timeout(this.timeoutDuration),
        retry(this.retryAttempts),
        catchError(this.handleError)
      );
  }
}