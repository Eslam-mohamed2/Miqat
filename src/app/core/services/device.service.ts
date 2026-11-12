import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { DeviceDto, PushKeyDto, RegisterDeviceDto } from '../../models/api.models';
import { unwrapApi, unwrapApiList } from '../http/api-response';

/** Browsers the user allowed to receive push notifications while the app is closed. */
@Injectable({
  providedIn: 'root'
})
export class DeviceService {
  private apiUrl = `${environment.apiUrl}/api/Device`;

  constructor(private http: HttpClient) { }

  getMine(): Observable<DeviceDto[]> {
    return this.http.get<DeviceDto[]>(this.apiUrl).pipe(unwrapApiList<DeviceDto>());
  }

  /** The server's public key, which a browser needs before it can subscribe. */
  getPushKey(): Observable<PushKeyDto> {
    return this.http.get<PushKeyDto>(`${this.apiUrl}/push-key`).pipe(unwrapApi<PushKeyDto>());
  }

  register(device: RegisterDeviceDto): Observable<DeviceDto> {
    return this.http.post<DeviceDto>(this.apiUrl, device).pipe(unwrapApi<DeviceDto>());
  }

  remove(deviceId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${deviceId}`);
  }
}
