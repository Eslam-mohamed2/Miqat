import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { FriendshipDto } from '../../models/api.models';

@Injectable({
  providedIn: 'root'
})
export class FriendService {
  private apiUrl = `${environment.apiUrl}/api/Friends`;

  constructor(private http: HttpClient) { }

  sendRequest(receiverId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/send-request/${receiverId}`, {});
  }

  acceptRequest(friendshipId: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/accept/${friendshipId}`, {});
  }

  rejectRequest(friendshipId: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/reject/${friendshipId}`, {});
  }

  blockUser(userToBlockId: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/block/${userToBlockId}`, {});
  }

  unblockUser(blockedUserId: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/unblock/${blockedUserId}`, {});
  }

  unfriend(friendshipId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${friendshipId}`);
  }

  getMyFriends(): Observable<FriendshipDto[]> {
    return this.http.get<FriendshipDto[]>(`${this.apiUrl}/my-friends`);
  }

  getPendingRequests(): Observable<FriendshipDto[]> {
    return this.http.get<FriendshipDto[]>(`${this.apiUrl}/pending`);
  }

  getSentRequests(): Observable<FriendshipDto[]> {
    return this.http.get<FriendshipDto[]>(`${this.apiUrl}/sent`);
  }

  getSuggestions(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/suggestions`);
  }

  getFriendshipStatus(userId: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/status/${userId}`);
  }

  getFriendshipById(friendshipId: string): Observable<FriendshipDto> {
    return this.http.get<FriendshipDto>(`${this.apiUrl}/${friendshipId}`);
  }
}
