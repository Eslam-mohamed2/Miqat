import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse, TaskDto } from '../../models/api.models';
import { unwrapApi, unwrapApiList } from '../http/api-response';

@Injectable({
  providedIn: 'root'
})
export class TaskService {
  private apiUrl = `${environment.apiUrl}/api/Task`;

  constructor(private http: HttpClient) { }

  getTasks(): Observable<TaskDto[]> {
    return this.http.get<TaskDto[] | ApiResponse<TaskDto[]>>(this.apiUrl).pipe(unwrapApiList<TaskDto>());
  }

  createTask(task: Partial<TaskDto>): Observable<TaskDto> {
    return this.http.post<TaskDto | ApiResponse<TaskDto>>(this.apiUrl, task).pipe(unwrapApi<TaskDto>());
  }

  getPagedTasks(pageIndex: number, pageSize: number): Observable<TaskDto[]> {
    const params = new HttpParams().set('pageIndex', pageIndex).set('pageSize', pageSize);
    return this.http.get<TaskDto[] | ApiResponse<TaskDto[]>>(`${this.apiUrl}/paged`, { params }).pipe(unwrapApiList<TaskDto>());
  }

  getDueSoonTasks(withinDays: number): Observable<TaskDto[]> {
    const params = new HttpParams().set('withinDays', withinDays);
    return this.http.get<TaskDto[] | ApiResponse<TaskDto[]>>(`${this.apiUrl}/due-soon`, { params }).pipe(unwrapApiList<TaskDto>());
  }

  getTasksByGroup(groupId: string): Observable<TaskDto[]> {
    return this.http.get<TaskDto[] | ApiResponse<TaskDto[]>>(`${this.apiUrl}/group/${groupId}`).pipe(unwrapApiList<TaskDto>());
  }

  getTaskById(id: string): Observable<TaskDto> {
    return this.http.get<TaskDto | ApiResponse<TaskDto>>(`${this.apiUrl}/${id}`).pipe(unwrapApi<TaskDto>());
  }

  updateTask(id: string, task: Partial<TaskDto>): Observable<TaskDto> {
    return this.http.put<TaskDto | ApiResponse<TaskDto>>(`${this.apiUrl}/${id}`, task).pipe(unwrapApi<TaskDto>());
  }

  deleteTask(id: string): Observable<void> {
    return this.http.delete<void | ApiResponse<void>>(`${this.apiUrl}/${id}`).pipe(unwrapApi<void>());
  }

  getAllTasks(): Observable<TaskDto[]> {
    return this.http.get<TaskDto[] | ApiResponse<TaskDto[]>>(`${this.apiUrl}/all`).pipe(unwrapApiList<TaskDto>());
  }
}
