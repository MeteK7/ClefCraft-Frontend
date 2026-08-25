import { ActivityFieldChange } from './activity-log.model';

export type CalendarActivityScope = 'Event' | 'Segment' | 'Exception';

export interface CalendarActivityLogEntry {
  id: number;
  scope: CalendarActivityScope;
  actionType: string;
  timestamp: string;
  actorUserId: string;
  actorFullName: string;
  changes: ActivityFieldChange[];
  /** Segment scope only: the date range this recurring-series default change applied to. */
  effectiveFrom: string | null;
  effectiveTo: string | null;
  /** Exception scope only: the single occurrence date this override/cancellation applies to. */
  occurrenceDate: string | null;
}
