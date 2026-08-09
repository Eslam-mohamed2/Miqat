import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { ApiResponse, FriendshipDto, FriendshipStatusDto, UserDto } from '../../models/api.models';
import { unwrapApi, unwrapApiList, unwrapNamedList } from '../http/api-response';

@Injectable({
  providedIn: 'root'
})
export class FriendService {
  private apiUrl = `${environment.apiUrl}/api/Friends`;

  constructor(private http: HttpClient) { }

  sendRequest(receiverId: string): Observable<void> {
    return this.http.post<void | ApiResponse<void>>(`${this.apiUrl}/send-request/${receiverId}`, {}).pipe(unwrapApi<void>());
  }

  acceptRequest(friendshipId: string): Observable<void> {
    return this.http.put<void | ApiResponse<void>>(`${this.apiUrl}/accept/${friendshipId}`, {}).pipe(unwrapApi<void>());
  }

  rejectRequest(friendshipId: string): Observable<void> {
    return this.http.put<void | ApiResponse<void>>(`${this.apiUrl}/reject/${friendshipId}`, {}).pipe(unwrapApi<void>());
  }

  blockUser(userToBlockId: string): Observable<void> {
    return this.http.put<void | ApiResponse<void>>(`${this.apiUrl}/block/${userToBlockId}`, {}).pipe(unwrapApi<void>());
  }

  unblockUser(blockedUserId: string): Observable<void> {
    return this.http.put<void | ApiResponse<void>>(`${this.apiUrl}/unblock/${blockedUserId}`, {}).pipe(unwrapApi<void>());
  }

  unfriend(friendshipId: string): Observable<void> {
    return this.http.delete<void | ApiResponse<void>>(`${this.apiUrl}/${friendshipId}`).pipe(unwrapApi<void>());
  }

  /**
   * The friends list lives at the collection root - there is no /my-friends route.
   * Requesting one matched GET /api/Friends/{friendshipId} instead and always failed.
   *
   * These three endpoints wrap their collection in a named property rather than
   * returning a bare array, so they need unwrapNamedList; unwrapApiList silently
   * produced an empty list for all of them.
   */
  getMyFriends(): Observable<FriendshipDto[]> {
    return this.http.get<unknown>(this.apiUrl).pipe(unwrapNamedList<FriendshipDto>('friends'));
  }

  getPendingRequests(): Observable<FriendshipDto[]> {
    return this.http.get<unknown>(`${this.apiUrl}/pending`).pipe(unwrapNamedList<FriendshipDto>('pendingRequests'));
  }

  getSentRequests(): Observable<FriendshipDto[]> {
    return this.http.get<unknown>(`${this.apiUrl}/sent`).pipe(unwrapNamedList<FriendshipDto>('sentRequests'));
  }

  /**
   * Accepted friends as plain {id, name} people.
   *
   * This is the assignable-people list for anyone who is not an admin:
   * GET /api/User is [Authorize(Roles = "Admin")] and 403s for everyone else, so
   * UserService.getAllUsers() cannot back an assignee or add-member picker.
   *
   * `currentUserId` decides which side of each friendship is the other person.
   */
  getFriendUsers(currentUserId: string | null): Observable<{ id: string; name: string }[]> {
    return this.getMyFriends().pipe(
      map(rows => rows.map(row => {
        const useSender = row.senderId !== currentUserId;
        return {
          id: useSender ? row.senderId : row.receiverId,
          name: (useSender ? row.senderName : row.receiverName)
            || (useSender ? row.sender?.fullName : row.receiver?.fullName)
            || 'Unknown'
        };
      }))
    );
  }

  getSuggestions(): Observable<UserDto[]> {
    return this.http.get<UserDto[] | ApiResponse<UserDto[]>>(`${this.apiUrl}/suggestions`).pipe(unwrapApiList<UserDto>());
  }

  getFriendshipStatus(userId: string): Observable<FriendshipStatusDto> {
    return this.http
      .get<FriendshipStatusDto | ApiResponse<FriendshipStatusDto>>(`${this.apiUrl}/status/${userId}`)
      .pipe(unwrapApi<FriendshipStatusDto>());
  }

  getFriendshipById(friendshipId: string): Observable<FriendshipDto> {
    return this.http.get<FriendshipDto | ApiResponse<FriendshipDto>>(`${this.apiUrl}/${friendshipId}`).pipe(unwrapApi<FriendshipDto>());
  }
}
