import { Injectable } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { Subject, Observable, distinctUntilChanged } from 'rxjs';
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
    /** true when this mention is what just granted the recipient CalendarEventCollaborator
     * access (as opposed to a plain ping to someone who already had access). Always false for
     * BoardItem mentions. */
    grantedAccess: boolean;
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

    // start()/stop() are async and SignalR rejects start() unless fully Disconnected, so a quick
    // logout -> login must wait for the stop to finish. Chaining transitions guarantees that.
    private lifecycle: Promise<void> = Promise.resolve();

    constructor(private authService: AuthService) {  // ← inject AuthService
        this.buildConnection();
        this.registerReminderListener();
        this.registerMentionListener();

        // Connect only while logged in. Connecting at app boot before login produced an
        // anonymous connection that never received user-addressed notifications, even after
        // the user logged in.
        this.authService.isAuthenticated$
            .pipe(distinctUntilChanged())
            .subscribe(isAuthenticated => isAuthenticated ? this.startConnection() : this.stopConnection());
    }

    private buildConnection(): void {
        const hubUrl = environment.apiUrl.replace('/api', '');
        this.hubConnection = new signalR.HubConnectionBuilder()
            .withUrl(`${hubUrl}/hubs/notifications`, {
                // Called on every (re)connect, so a reconnect after the access token expired
                // refreshes it first instead of being rejected.
                accessTokenFactory: async () => (await this.authService.getValidAccessToken()) ?? '',
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
    }

    private startConnection(): void {
        this.queueTransition(async () => {
            if (this.hubConnection.state !== signalR.HubConnectionState.Disconnected) {
                return;
            }

            await this.hubConnection.start();
            console.log('Successfully synchronized with Notification Hub.');
        });
    }

    public stopConnection(): void {
        this.queueTransition(async () => {
            if (this.hubConnection.state === signalR.HubConnectionState.Disconnected) {
                return;
            }

            await this.hubConnection.stop();
        });
    }

    private queueTransition(transition: () => Promise<void>): void {
        this.lifecycle = this.lifecycle
            .then(transition)
            .catch(err => console.error('Error changing SignalR connection state:', err));
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

}