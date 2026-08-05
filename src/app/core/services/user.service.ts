import { Injectable, computed, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse, UpdateProfileDto, UserDto } from '../../models/api.models';
import { unwrapApi, unwrapApiList } from '../http/api-response';

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
   * Never empty, so callers can pass it straight to Intl.
   */
  readonly timeZone = computed(() =>
    this.currentUser()?.timeZone?.trim() || this.browserTimeZone()
  );

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

  private browserTimeZone(): string {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      return 'UTC';
    }
  }

  getUserById(id: string): Observable<UserDto> {
    return this.http.get<UserDto | ApiResponse<UserDto>>(`${this.apiUrl}/${id}`).pipe(unwrapApi<UserDto>());
  }

  updateUser(id: string, data: UpdateProfileDto): Observable<UserDto> {
    return this.http.put<UserDto | ApiResponse<UserDto>>(`${this.apiUrl}/${id}`, data).pipe(unwrapApi<UserDto>());
  }

  deleteUser(id: string): Observable<void> {
    return this.http.delete<void | ApiResponse<void>>(`${this.apiUrl}/${id}`).pipe(unwrapApi<void>());
  }

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
