import { Injectable } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { Subject, Observable } from 'rxjs';
import { AuthService } from './auth.service';  // ← adjust path if needed
import { environment } from '../../environments/environment';

export interface ReminderPayload {
    eventId: number;
    message: string;
}

export interface MentionPayload {
    entityType: string;
    entityId: number;
    commentId: number;
    authorFullName: string;
    excerpt: string;
    boardId: number | null;
}

@Injectable({
    providedIn: 'root'
})
export class NotificationRealtimeService {
    private hubConnection!: signalR.HubConnection;
    private reminderSubject = new Subject<ReminderPayload>();
    private mentionSubject = new Subject<MentionPayload>();

    public reminders$: Observable<ReminderPayload> = this.reminderSubject.asObservable();
    public mentions$: Observable<MentionPayload> = this.mentionSubject.asObservable();

    constructor(private authService: AuthService) {  // ← inject AuthService
        this.startConnection();
        this.registerReminderListener();
        this.registerMentionListener();
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

    private registerMentionListener(): void {
        this.hubConnection.on(
            'ReceiveMention',
            (payload: MentionPayload) => {
                console.log('MENTION RECEIVED', payload);
                this.mentionSubject.next(payload);
            }
        );
    }

    public stopConnection(): void {
        if (this.hubConnection) {
            this.hubConnection.stop();
        }
    }
}