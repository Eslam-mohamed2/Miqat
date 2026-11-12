import { Injectable, computed, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ApiResponse, ContactDto, UpdateProfileDto, UserDto, UserPreferencesDto, UserProfileDto, UserSummaryDto
} from '../../models/api.models';
import { unwrapApi, unwrapApiList } from '../http/api-response';
import { safeTimeZone } from '../utils/time-zone';

@Injectable({
  providedIn: 'root'
})
export class UserService {
  private apiUrl = `${environment.apiUrl}/api/User`;

  /**
   * The signed-in user, shared app-wide.
   *
   * Anything that formats a date needs the profile's time zone, and needs to
   * re-render when the user changes it in Settings. Keeping it here means the
   * calendar does not have to fetch /me itself or guess the browser zone.
   */
  readonly currentUser = signal<UserDto | null>(null);

  /**
   * The zone to format dates in: the user's own, falling back to the browser's.
   * Always a name Intl accepts, so callers can pass it straight to Intl - a profile
   * can hold free text such as "UTC+2", which made Intl throw.
   */
  readonly timeZone = computed(() => safeTimeZone(this.currentUser()?.timeZone));

  constructor(private http: HttpClient) { }

  getMe(): Observable<UserDto> {
    return this.http.get<UserDto | ApiResponse<UserDto>>(`${this.apiUrl}/me`).pipe(
      unwrapApi<UserDto>(),
      tap(user => this.currentUser.set(user))
    );
  }

  /** PUT /api/User/me - the API binds the editable profile fields only. */
  updateMe(data: UpdateProfileDto): Observable<UserDto> {
    return this.http.put<UserDto | ApiResponse<UserDto>>(`${this.apiUrl}/me`, data).pipe(
      unwrapApi<UserDto>(),
      // The endpoint answers 204, so there is no body to read the new values
      // from — patch the shared copy locally so the rest of the app (the
      // calendar's time zone above all) reacts immediately.
      tap(() => this.currentUser.update(current =>
        current ? { ...current, ...data } as UserDto : current))
    );
  }

  getUserById(id: string): Observable<UserDto> {
    return this.http.get<UserDto | ApiResponse<UserDto>>(`${this.apiUrl}/${id}`).pipe(unwrapApi<UserDto>());
  }

  /** A user together with how they relate to the signed-in user (mutual friends, friendship). */
  getProfile(id: string): Observable<UserProfileDto> {
    return this.http
      .get<UserProfileDto | ApiResponse<UserProfileDto>>(`${this.apiUrl}/${id}/profile`)
      .pipe(unwrapApi<UserProfileDto>());
  }

  updateUser(id: string, data: UpdateProfileDto): Observable<UserDto> {
    return this.http.put<UserDto | ApiResponse<UserDto>>(`${this.apiUrl}/${id}`, data).pipe(unwrapApi<UserDto>());
  }

  deleteUser(id: string): Observable<void> {
    return this.http.delete<void | ApiResponse<void>>(`${this.apiUrl}/${id}`).pipe(unwrapApi<void>());
  }

  /**
   * The people this user can pick: friends and project teammates. Use this for
   * pickers - GET /api/User (getAllUsers) is admin-only and answers 403 for
   * everyone else, which left the picker empty.
   */
  getContacts(): Observable<ContactDto[]> {
    return this.http
      .get<ContactDto[] | ApiResponse<ContactDto[]>>(`${this.apiUrl}/contacts`)
      .pipe(unwrapApiList<ContactDto>());
  }

  /** Counts for the signed-in user in one call: tasks by state, projects, friends, unread items. */
  getSummary(): Observable<UserSummaryDto> {
    return this.http.get<UserSummaryDto>(`${this.apiUrl}/me/summary`).pipe(unwrapApi<UserSummaryDto>());
  }

  /** Which notifications the user wants (stored on the server, per account). */
  getPreferences(): Observable<UserPreferencesDto> {
    return this.http
      .get<UserPreferencesDto | ApiResponse<UserPreferencesDto>>(`${this.apiUrl}/me/preferences`)
      .pipe(unwrapApi<UserPreferencesDto>());
  }

  updatePreferences(preferences: UserPreferencesDto): Observable<UserPreferencesDto> {
    return this.http
      .put<UserPreferencesDto | ApiResponse<UserPreferencesDto>>(`${this.apiUrl}/me/preferences`, preferences)
      .pipe(unwrapApi<UserPreferencesDto>());
  }

  /** Removes the profile picture and publishes the change to the whole app. */
  removeProfileImage(): Observable<void> {
    return this.http
      .delete<void | ApiResponse<void>>(`${this.apiUrl}/profile-image`)
      .pipe(
        unwrapApi<void>(),
        tap(() => this.currentUser.update(current =>
          current ? { ...current, profilePictureUrl: '' } : current))
      );
  }

  /** Admin only. Everyone else gets 403 - pickers should call getContacts(). */
  getAllUsers(): Observable<UserDto[]> {
    return this.http.get<UserDto[] | ApiResponse<UserDto[]>>(this.apiUrl).pipe(unwrapApiList<UserDto>());
  }

  searchUsers(query: string): Observable<UserDto[]> {
    return this.http
      .get<UserDto[] | ApiResponse<UserDto[]>>(`${this.apiUrl}/search?query=${encodeURIComponent(query)}`)
      .pipe(unwrapApiList<UserDto>());
  }

  /**
   * Uploads a new profile picture and publishes it to the whole app.
   *
   * The new URL is written into `currentUser` here rather than left for the
   * calling page to re-fetch: the sidebar, the topbar and every avatar read
   * that signal, so this is what makes the change appear everywhere at once
   * instead of only on the page that performed the upload.
   *
   * Each upload gets a fresh blob name server-side, so the URL always changes
   * and there is no stale-cache problem to work around.
   */
  uploadProfileImage(file: File): Observable<string | null> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http
      .post<unknown>(`${this.apiUrl}/upload-profile-image`, formData)
      .pipe(
        map(response => this.readImageUrl(response)),
        tap(url => {
          if (url) this.setProfilePicture(url);
          // A response without a usable URL still means the upload succeeded,
          // so fall back to asking the server what it now holds.
          else this.refreshMe();
        })
      );
  }

  /** Publishes a new avatar URL to every subscriber of `currentUser`. */
  setProfilePicture(url: string) {
    this.currentUser.update(current =>
      current ? { ...current, profilePictureUrl: url } : current);
  }

  /** Re-reads the signed-in user; safe to call fire-and-forget. */
  refreshMe(): void {
    this.getMe().subscribe({ error: () => {} });
  }

  /** The API answers `{ profileImageUrl }`, but tolerate the usual variations. */
  private readImageUrl(response: unknown): string | null {
    const body = (response as { data?: unknown })?.data ?? response;
    if (typeof body === 'string') return body;
    const record = body as Record<string, unknown> | null;
    const url = record?.['profileImageUrl'] ?? record?.['profilePictureUrl'] ?? record?.['url'];
    return typeof url === 'string' && url ? url : null;
  }
}
