import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { GroupDto } from '../../models/api.models';

@Injectable({
  providedIn: 'root'
})
export class GroupService {
  private apiUrl = `${environment.apiUrl}/api/Group`;

  constructor(private http: HttpClient) { }

  getGroups(): Observable<GroupDto[]> {
    return this.http.get<GroupDto[]>(this.apiUrl);
  }

  createGroup(data: GroupDto): Observable<GroupDto> {
    return this.http.post<GroupDto>(this.apiUrl, data);
  }

  getGroupById(id: string): Observable<GroupDto> {
    return this.http.get<GroupDto>(`${this.apiUrl}/${id}`);
  }

  updateGroup(id: string, data: GroupDto): Observable<any> {
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

  getMembers(groupId: string, pageIndex: number = 0, pageSize: number = 20): Observable<any> {
    const params = new HttpParams().set('pageIndex', pageIndex).set('pageSize', pageSize);
    return this.http.get(`${this.apiUrl}/${groupId}/members`, { params });
  }
}
