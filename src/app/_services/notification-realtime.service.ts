import { Injectable } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { Subject, Observable } from 'rxjs';
import { AuthService } from './auth.service';  // ← adjust path if needed
import { environment } from '../../environments/environment';

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
        const hubUrl = environment.apiUrl.replace('/api', '');
        this.hubConnection = new signalR.HubConnectionBuilder()
            .withUrl(`${hubUrl}/hubs/notifications`, {
                accessTokenFactory: () => this.authService.getToken() ?? '',
                withCredentials: true
            })
            .withAutomaticReconnect()
            .configureLogging(signalR.LogLevel.Information)
            .build();

        this.hubConnection.onreconnecting(error => {
            console.log('SignalR reconnecting', error);
        });

        this.hubConnection.onreconnected(connectionId => {
            console.log('SignalR reconnected', connectionId);
        });

        this.hubConnection.onclose(error => {
            console.log('SignalR closed', error);
        });

        this.hubConnection
            .start()
            .then(() => {
                console.log('Successfully synchronized with Notification Hub.');

                console.log(
                    'Connection State:',
                    this.hubConnection.state
                );

                console.log(
                    'Connection Id:',
                    this.hubConnection.connectionId
                );
            })
            .catch(err =>
                console.error(
                    'Error establishing SignalR connection:',
                    err
                )
            );
    }

    private registerReminderListener(): void {
        this.hubConnection.on(
            'ReceiveReminder',
            (payload: { eventId: number; message: string }) => {

                console.log('REMINDER RECEIVED', payload);

                this.reminderSubject.next({
                    eventId: payload.eventId,
                    message: payload.message
                });
            }
        );
    }

    public stopConnection(): void {
        if (this.hubConnection) {
            this.hubConnection.stop();
        }
    }
}