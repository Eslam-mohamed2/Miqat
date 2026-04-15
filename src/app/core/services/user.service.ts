import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class UserService {
  private apiUrl = `${environment.apiUrl}/api/user`;

  constructor(private http: HttpClient) { }

  getMe(): Observable<any> {
    return this.http.get(`${this.apiUrl}/me`);
  }

  updateMe(data: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/me`, data);
  }

  getUser(id: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/${id}`);
  }

  updateUser(id: string, data: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}`, data);
  }

  deleteUser(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }

  getAllUsers(): Observable<any> {
    return this.http.get(this.apiUrl);
  }
}
