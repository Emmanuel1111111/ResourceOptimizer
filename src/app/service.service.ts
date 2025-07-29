import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { BehaviorSubject, Observable, of, throwError } from 'rxjs';
import { catchError, tap, switchMap, map } from 'rxjs/operators';
import { CurrentSchedule } from '../Environ';
import { Prediction } from '../Environ';
import { AnalysisResult } from '../Environ';
import { SmartAvailabilityResponse, SmartAvailabilityRequest } from '../Environ';
import { OptimizeResourcesRequest, OptimizeResourcesResponse } from '../Environ';
import { api } from '../api.config';

const environment = {
  apiUrl: 'http://localhost:5000'
};

export interface LoginResponse {
  message: string;
  Id: string;
  token?: string;
  username?: string;
}

export interface SignupResponse {
  Id: string;
  message: string;
  token?: string;
  username?: string;
  email?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  updateSchedule(schedule: CurrentSchedule):Observable<any> {
   throw new Error('Method not implemented.');
   
  }
  private loadingSubject = new BehaviorSubject<boolean>(false)
  public loading$ = this.loadingSubject.asObservable()
  

  private errorSubject = new BehaviorSubject<string | null>(null)
  public error$ = this.errorSubject.asObservable()
  private apiUrl = environment.apiUrl;
 

  constructor(private http: HttpClient) {}

  login(username: string, password: string, rememberMe: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.apiUrl}/api/login`, { username, password, rememberMe }).pipe(
      tap(response => {
        if (response.token) {
          localStorage.setItem('token', response.token);
          localStorage.setItem('userId', response.Id);
        }
      }),
      catchError(err => throwError(() => new Error(err.error?.error || 'Login failed')))
    );
  }

  signup(username: string, email: string, password: string): Observable<SignupResponse> {
    return this.http.post<SignupResponse>(`${this.apiUrl}/api/signup`, { username, email, password }).pipe(
      tap(response => {
        if (response.token) {
          localStorage.setItem('token', response.token);
          localStorage.setItem('userId', response.Id);
        }
      }),
      catchError(err => throwError(() => new Error(err.error?.error || 'Signup failed')))
    );
  }

 getAvailableRooms(roomId?: string): Observable<any> {
  let params = new HttpParams();
  if (roomId) params = params.set('room_id', roomId);

  const token = this.getToken();


  return this.http.get(`${this.apiUrl}/available_rooms`, { params }).pipe(
    catchError(err => throwError(() => new Error(err.error?.error || 'Failed to fetch rooms')))
  );
}
 

 
  currentUtilization(roomId: string): Observable<AnalysisResult[]> {
   
    const body = roomId ? { room_id: roomId } : {};
      return this.http.post<AnalysisResult[]>(`${this.apiUrl}/api/current_utilization`, body).pipe(
        catchError(err => throwError(() => new Error(err.error?.error || 'Failed to fetch current utilization')))
      );
    }

    private setLoading(loading: boolean): void {
    this.loadingSubject.next(loading)
  }

  private setError(error: string | null): void {
    this.errorSubject.next(error)
  }

  private clearError(): void {
    this.errorSubject.next(null)
  }
  
  loginWithFacebook(): Observable<any> {
    return throwError(() => new Error('Facebook login not implemented'));
  }

  loginWithGoogle(): Observable<any> {
    return throwError(() => new Error('Google login not implemented'));
  }

  getToken(): string | null {
    return localStorage.getItem('token');
  }

  getUserId(): string | null {
    return localStorage.getItem('userId');
  }

  logout(): void {
    localStorage.removeItem('token');
    localStorage.removeItem('userId');
  }


  isLoggedIn(): boolean {
    const token = localStorage.getItem('token');
    return token !== null && token !== '';
  }

  manageResources(operation: string, data: any): Observable<SmartAvailabilityResponse | OptimizeResourcesResponse> {
    this.setLoading(true);
    this.clearError();

    let url = `${this.apiUrl}`;
    if (operation === 'smart_availability') {
      url += '/smart_availability';
    } else if (operation === 'optimize_resources') {
      url += '/optimize_resources';
    } else {
      return throwError(() => new Error('Invalid operation'));
    }

    return this.http.post<SmartAvailabilityResponse | OptimizeResourcesResponse>(url, data).pipe(
      tap(() => this.setLoading(false)),
      catchError(err => {
        this.setLoading(false);
        this.setError(err.error?.error || 'Failed to manage resources');
        return throwError(() => new Error(err.error?.error || 'Failed to manage resources'));
      })
    );
  }


  injectSchedule(scheduleData: any): Observable<any> {
    const payload = {
      operation: 'inject_schedule',
      ...scheduleData
    };
    
    return this.http.post(`${this.apiUrl}/api/manage_resources`, payload).pipe(
      catchError(err => throwError(() => new Error(err.error?.error || 'Failed to inject schedule')))
    );
  }

  // Get room schedules
  getRoomSchedules(roomId: string, day?: string): Observable<any> {
    let params = new HttpParams().set('room_id', roomId);
    if (day) {
      params = params.set('day', day);
    }
    
    return this.http.get(`${this.apiUrl}/get_room_schedules`, { params }).pipe(
      catchError(err => throwError(() => new Error(err.error?.error || 'Failed to fetch room schedules')))
    );
  }

  // Refresh aggregated data
  refreshAggregatedData(roomId?: string, prioritizeDay: boolean = true): Observable<any> {
    let params= new HttpParams()
    if (roomId) {
      params = params.set('room_id', roomId);
    }
    params = params.set('prioritize_day', prioritizeDay.toString());
    
    return this.http.get(`${this.apiUrl}/refresh_aggregated_data`, { params }).pipe(
      catchError(err => throwError(() => new Error(err.error?.error || 'Failed to refresh aggregated data')))
    );
  }

  // Inject schedule and refresh data in one operation
  injectScheduleAndRefresh(scheduleData: any): Observable<any> {
    const payload = {
      operation: 'inject_schedule',
      ...scheduleData
    };
    
    return this.http.post(`${this.apiUrl}/api/manage_resources`, payload).pipe(
      switchMap(response => {
        return this.refreshAggregatedData(scheduleData.room_id).pipe(
          map(refreshResponse => {
            return {
              injection: response,
              refresh: refreshResponse
            };
          })
        );
      }),
      catchError(err => throwError(() => new Error(err.error?.error || 'Failed to inject schedule')))
    );
  }


  getDayBasedSchedules(roomId: string): Observable<any> {
    let params = new HttpParams().set('room_id', roomId);
    const url = `${this.apiUrl}/get_day_based_schedules`;
    return this.http.get<any>(url, { params }).pipe(
      catchError(err => throwError(() => new Error(err.error?.error || 'Failed to get day-based schedules')))
    );
  }


  getDailyUtilization(roomId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/daily_utilization/${roomId}`).pipe(
      catchError(err => throwError(() => new Error(err.error?.error || 'Failed to fetch daily utilization')))
    );
  }


  getWeeklyUtilization(roomId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/weekly_utilization/${roomId}`).pipe(
      catchError(err => throwError(() => new Error(err.error?.error || 'Failed to fetch weekly utilization')))
    );
  }
  
  // Check database connection status
  checkDatabaseStatus(): Observable<{status: string, message: string, connection_type: string, error_details?: string}> {
    return this.http.get<{status: string, message: string, connection_type: string, error_details?: string}>(`${this.apiUrl}/api/db_status`).pipe(
      catchError(err => throwError(() => new Error(err.error?.error || 'Failed to check database status')))
    );
  }

getUsers():Observable<any>{
  
  const token = this.getToken();
  const httpOptions = {
    headers: new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    })
  };
  
  return this.http.get(`${this.apiUrl}/api/logs`, httpOptions).pipe(
    catchError(err => throwError(() => new Error(err.error?.error || 'Failed to fetch users')))
  );  
}



}