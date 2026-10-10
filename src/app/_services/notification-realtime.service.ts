import { Injectable, OnDestroy } from '@angular/core';
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
    /** true when this mention is what just granted the recipient CalendarEventCollaborator
     * access (as opposed to a plain ping to someone who already had access). Always false for
     * BoardItem mentions. */
    grantedAccess: boolean;
}

// Retry delays for (re)connecting after the first start() failed or after SignalR's own automatic
// reconnect gave up: 2 s, 4 s, 8 s, 16 s, then every 30 s for as long as the user is signed in.
// The cap keeps an idle outage cheap (one negotiate request per 30 s per tab) while bringing the
// client back within half a minute of the backend returning.
export const RETRY_INITIAL_DELAY_MS = 2_000;
export const RETRY_MAX_DELAY_MS = 30_000;

@Injectable({
    providedIn: 'root'
})
export class NotificationRealtimeService implements OnDestroy {
    private hubConnection!: signalR.HubConnection;
    private reminderSubject = new Subject<ReminderPayload>();
    private mentionSubject = new Subject<MentionPayload>();

    public reminders$: Observable<ReminderPayload> = this.reminderSubject.asObservable();
    public mentions$: Observable<MentionPayload> = this.mentionSubject.asObservable();

    // start()/stop() are async and SignalR rejects start() unless fully Disconnected, so a quick
    // logout -> login must wait for the stop to finish. Chaining transitions guarantees that.
    private lifecycle: Promise<void> = Promise.resolve();

    // True while the user is signed in, i.e. while the client should be connected. Retries and
    // queued connection attempts check it, so nothing reconnects after logout.
    private shouldBeConnected = false;
    private retryTimer: ReturnType<typeof setTimeout> | null = null;
    private retryAttempt = 0;

    constructor(private authService: AuthService) {  // ← inject AuthService
        this.buildConnection();
        this.registerReminderListener();
        this.registerMentionListener();

        // Connect only while logged in. Connecting at app boot before login produced an
        // anonymous connection that never received user-addressed notifications, even after
        // the user logged in.
        // Every `true` is acted on, not just changes: a successful token refresh re-emits it, and
        // that is the signal to resume after an attempt was skipped for lack of a valid token.
        this.authService.isAuthenticated$
            .subscribe(isAuthenticated => isAuthenticated ? this.startConnection() : this.stopConnection());

        // Coming back online or to the tab (e.g. after laptop sleep) is a good moment to try again
        // without waiting out the current retry delay.
        window.addEventListener('online', this.onOnline);
        document.addEventListener('visibilitychange', this.onVisibilityChange);
    }

    ngOnDestroy(): void {
        window.removeEventListener('online', this.onOnline);
        document.removeEventListener('visibilitychange', this.onVisibilityChange);
        this.clearRetry();
    }

    private readonly onOnline = (): void => this.retryNow();

    private readonly onVisibilityChange = (): void => {
        if (document.visibilityState === 'visible') this.retryNow();
    };

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

        // Fires when an established connection ends: after automatic reconnect gave up, or after
        // our own stop() on logout. Only the former should be retried.
        this.hubConnection.onclose(() => {
            if (this.shouldBeConnected) {
                this.retryAttempt = 0;
                this.scheduleRetry();
            }
        });
    }

    private startConnection(): void {
        this.shouldBeConnected = true;
        this.clearRetry();
        this.queueTransition(() => this.connect());
    }

    public stopConnection(): void {
        this.shouldBeConnected = false;
        this.clearRetry();
        this.retryAttempt = 0;

        this.queueTransition(async () => {
            if (this.hubConnection.state === signalR.HubConnectionState.Disconnected) {
                return;
            }

            await this.hubConnection.stop();
        });
    }

    /** One connection attempt; runs inside the serialized lifecycle chain. */
    private async connect(): Promise<void> {
        if (!this.shouldBeConnected || this.hubConnection.state !== signalR.HubConnectionState.Disconnected) {
            return;
        }

        // Without a usable token the server can only answer 401, so don't try and don't retry.
        // The auth lifecycle either ends the session (logout stops everything) or refreshes the
        // token, which re-emits isAuthenticated$ = true and brings us back here.
        const token = await this.authService.getValidAccessToken();
        if (!token || !this.shouldBeConnected) {
            return;
        }

        try {
            await this.hubConnection.start();
            this.retryAttempt = 0;
        } catch (err) {
            console.error('Could not connect to Notification Hub:', err);
            this.scheduleRetry();
        }
    }

    private scheduleRetry(): void {
        if (!this.shouldBeConnected || this.retryTimer !== null) {
            return;
        }

        const delay = Math.min(RETRY_INITIAL_DELAY_MS * 2 ** this.retryAttempt, RETRY_MAX_DELAY_MS);
        this.retryAttempt++;

        this.retryTimer = setTimeout(() => {
            this.retryTimer = null;
            this.queueTransition(() => this.connect());
        }, delay);
    }

    /** Runs a pending retry immediately instead of waiting for its timer. */
    private retryNow(): void {
        if (this.retryTimer === null) {
            return;
        }

        this.clearRetry();
        this.queueTransition(() => this.connect());
    }

    private clearRetry(): void {
        if (this.retryTimer !== null) {
            clearTimeout(this.retryTimer);
            this.retryTimer = null;
        }
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
                this.mentionSubject.next(payload);
            }
        );
    }

}