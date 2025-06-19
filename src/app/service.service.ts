import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { CurrentSchedule } from '../Environ';
import { Prediction } from '../Environ';
import { AnalysisResult } from '../Environ';

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
  updateSchedule(schedule: CurrentSchedule) :Observable<any> {
    throw new Error('Method not implemented.');
  }
  private apiUrl = 'http://localhost:5000';

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
  predictUtilization(roomId?: string, period: number = 7): Observable<Prediction[]> {
    let params = new HttpParams().set('period', period.toString());
    const body = roomId ? { room_id: roomId } : {};
    return this.http.post<Prediction[]>(`${this.apiUrl}/api/predict`, body, { params }).pipe(
      catchError(err => throwError(() => err.error?.error || 'Failed to predict utilization'))
    );
  }

  getUsers(userId:any):Observable<any>{
   return  this.http.get<any>(`${this.apiUrl}/api/logs`, userId)

  }

  currentUtilization(roomId: string): Observable<AnalysisResult[]> {
   
    const body = roomId ? { room_id: roomId } : {};
      return this.http.post<AnalysisResult[]>(`${this.apiUrl}/api/current_utilization`, body).pipe(
        catchError(err => throwError(() => new Error(err.error?.error || 'Failed to fetch current utilization')))
      );
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
    return !!localStorage.getItem('token');
  }
}