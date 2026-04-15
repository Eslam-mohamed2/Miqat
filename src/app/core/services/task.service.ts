import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface TaskDto {
  id?: string;
  title: string;
  description?: string;
  status?: string; // Pending, InProgress, Completed
  priority?: string; // Low, Medium, High
  dueDate?: string; // ISO 8601 string
  tags?: string;
  recurrence?: string;
  recurrenceEndDate?: string;
  userId?: string;
  ownerName?: string;
  assignedToUserId?: string;
  assignedToUserName?: string;
  groupId?: string;
  groupName?: string;
  createdAt?: string;
}

@Injectable({
  providedIn: 'root'
})
export class TaskService {
  private apiUrl = `${environment.apiUrl}/api/Task`;

  constructor(private http: HttpClient) { }

  getDueSoonTasks(): Observable<TaskDto[]> {
    return this.http.get<TaskDto[]>(`${this.apiUrl}/due-soon`);
  }

  getTasks(): Observable<TaskDto[]> {
    return this.http.get<TaskDto[]>(this.apiUrl);
  }

  getTaskById(id: string): Observable<TaskDto> {
    return this.http.get<TaskDto>(`${this.apiUrl}/${id}`);
  }

  createTask(task: TaskDto): Observable<TaskDto> {
    return this.http.post<TaskDto>(this.apiUrl, task);
  }

  updateTask(id: string, task: TaskDto): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}`, task);
  }

  deleteTask(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }
}
