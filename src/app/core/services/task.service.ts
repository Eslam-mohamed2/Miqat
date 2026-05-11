import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { TaskDto } from '../../models/api.models';

@Injectable({
  providedIn: 'root'
})
export class TaskService {
  private apiUrl = `${environment.apiUrl}/api/Task`;

  constructor(private http: HttpClient) { }

  getTasks(): Observable<TaskDto[]> {
    return this.http.get<TaskDto[]>(this.apiUrl);
  }

  createTask(task: TaskDto): Observable<TaskDto> {
    return this.http.post<TaskDto>(this.apiUrl, task);
  }

  getPagedTasks(pageIndex: number, pageSize: number): Observable<TaskDto[]> {
    const params = new HttpParams().set('pageIndex', pageIndex).set('pageSize', pageSize);
    return this.http.get<TaskDto[]>(`${this.apiUrl}/paged`, { params });
  }

  getDueSoonTasks(withinDays: number): Observable<TaskDto[]> {
    const params = new HttpParams().set('withinDays', withinDays);
    return this.http.get<TaskDto[]>(`${this.apiUrl}/due-soon`, { params });
  }

  getTasksByGroup(groupId: string): Observable<TaskDto[]> {
    return this.http.get<TaskDto[]>(`${this.apiUrl}/group/${groupId}`);
  }

  getTaskById(id: string): Observable<TaskDto> {
    return this.http.get<TaskDto>(`${this.apiUrl}/${id}`);
  }

  updateTask(id: string, task: TaskDto): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}`, task);
  }

  deleteTask(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }

  getAllTasks(): Observable<TaskDto[]> {
    return this.http.get<TaskDto[]>(`${this.apiUrl}/all`);
  }
}
