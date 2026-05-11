import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ParseMentionsRequest, CreateMentionsRequest } from '../../models/api.models';

@Injectable({
  providedIn: 'root'
})
export class MentionService {
  private apiUrl = `${environment.apiUrl}/api/Mentions`;

  constructor(private http: HttpClient) { }

  getMentions(): Observable<any> {
    return this.http.get(this.apiUrl);
  }

  getUnreadMentions(): Observable<any> {
    return this.http.get(`${this.apiUrl}/unread`);
  }

  getUnreadCount(): Observable<number> {
    return this.http.get<number>(`${this.apiUrl}/unread-count`);
  }

  markMentionAsRead(mentionId: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/${mentionId}/read`, {});
  }

  parseMentions(data: ParseMentionsRequest): Observable<any> {
    return this.http.post(`${this.apiUrl}/parse`, data);
  }

  createMentions(data: CreateMentionsRequest): Observable<any> {
    return this.http.post(`${this.apiUrl}/create`, data);
  }
}
