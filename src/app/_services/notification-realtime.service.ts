import { Injectable } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { Subject, Observable } from 'rxjs';

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

  // Expose an explicit stream for components or layout setups to subscribe to
  public reminders$: Observable<ReminderPayload> = this.reminderSubject.asObservable();

  constructor() {
    this.startConnection();
    this.registerReminderListener();
  }

  private startConnection(): void {
    // Matches the mapping endpoint defined in your API's Program.cs
    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl('https://localhost:7287/hubs/notifications', {
        // Essential if your API uses authorization context cookie tokens or specific client headers
        withCredentials: true 
      })
      .withAutomaticReconnect() // Automatically recovers if network status shifts
      .configureLogging(signalR.LogLevel.Information)
      .build();

    this.hubConnection
      .start()
      .then(() => console.log('Successfully synchronized with Notification Hub.'))
      .catch(err => console.error('Error establishing SignalR connection:', err));
  }

  private registerReminderListener(): void {
    // Binds directly to the payload signature expected by your C# NotificationHubService
    this.hubConnection.on('ReceiveReminder', (payload: { eventId: number, message: string }) => {
      this.reminderSubject.next({
        eventId: payload.eventId,
        message: payload.message
      });
    });
  }

  // Lifecycle utility to close socket cleanly if required
  public stopConnection(): void {
    if (this.hubConnection) {
      this.hubConnection.stop();
    }
  }
}