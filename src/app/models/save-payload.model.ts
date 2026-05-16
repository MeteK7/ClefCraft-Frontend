import { CalendarEventUI } from './calendar-event.model-ui';

/**
 * The payload emitted by CalendarDialogComponent.onSave.
 * Carries both the edited/created event record and any
 * file attachments the user chose to upload.
 */
export interface SavePayload {
  record: CalendarEventUI;
  attachments: File[];
}
