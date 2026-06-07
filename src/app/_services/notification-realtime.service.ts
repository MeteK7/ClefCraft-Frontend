import { Injectable } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { Subject, Observable } from 'rxjs';
import { AuthService } from './auth.service';  // ← adjust path if needed

export interface ReminderPayload {
  eventId: number;
  message: string;
}

@Injectable({
  providedIn: 'root'
})
export class NotificationRealtimeService {
  private hubConnection!: signalR.HubConnection;
  private reminderSubject = new Subject<ReminderPayload>();

  public reminders$: Observable<ReminderPayload> = this.reminderSubject.asObservable();

  constructor(private authService: AuthService) {  // ← inject AuthService
    this.startConnection();
    this.registerReminderListener();
  }

  private startConnection(): void {
    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl('https://localhost:7287/hubs/notifications', {
        accessTokenFactory: () => this.authService.getToken() ?? '',  // ← pass JWT
        withCredentials: true
      })
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.Information)
      .build();

    this.hubConnection
      .start()
      .then(() => console.log('Successfully synchronized with Notification Hub.'))
      .catch(err => console.error('Error establishing SignalR connection:', err));
  }

  private registerReminderListener(): void {
    this.hubConnection.on('ReceiveReminder', (payload: { eventId: number, message: string }) => {
      this.reminderSubject.next({
        eventId: payload.eventId,
        message: payload.message
      });
    });
  }

  public stopConnection(): void {
    if (this.hubConnection) {
      this.hubConnection.stop();
    }
  }
}