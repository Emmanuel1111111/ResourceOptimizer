import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { CurrentSchedule } from '../Environ';

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

  login(username: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.apiUrl}/api/login`, { username, password }).pipe(
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
  // let headers = new HttpHeaders();

  // if (token) {
  //   headers = headers.set('Authorization', `Bearer ${token}`);
  // }

  return this.http.get(`${this.apiUrl}/available_rooms`, { params }).pipe(
    catchError(err => throwError(() => new Error(err.error?.error || 'Failed to fetch rooms')))
  );
}
  predictUtilization(roomId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/api/predict`, { room_id: roomId }).pipe(
      catchError(err => throwError(() => new Error(err.error?.error || 'Failed to predict utilization')))
    );
  }


  getUsers(userId:any):Observable<any>{
   return  this.http.get<any>(`${this.apiUrl}/api/logs`, userId)

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