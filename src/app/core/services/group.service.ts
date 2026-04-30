import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class GroupService {
  private apiUrl = `${environment.apiUrl}/api/group`;

  constructor(private http: HttpClient) { }

  getGroups(): Observable<any> {
    return this.http.get(this.apiUrl);
  }

  getGroupById(id: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/${id}`);
  }

  createGroup(data: any): Observable<any> {
    return this.http.post(this.apiUrl, data);
  }

  updateGroup(id: string, data: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}`, data);
  }

  deleteGroup(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }

  addMember(groupId: string, userId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/${groupId}/members/${userId}`, {});
  }

  removeMember(groupId: string, userId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${groupId}/members/${userId}`);
  }

  getGroupMembers(groupId: string, pageIndex = 0, pageSize = 20): Observable<any> {
    return this.http.get(`${this.apiUrl}/${groupId}/members?pageIndex=${pageIndex}&pageSize=${pageSize}`);
  }
}
