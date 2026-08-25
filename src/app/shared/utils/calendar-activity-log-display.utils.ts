import { formatDate } from '@angular/common';

import { ActivityFieldChange } from '../../models/activity-log.model';
import { EventType } from '../../models/event-type.model';
import { DisplayActivityChange, humanizeFieldName } from './activity-log-display.utils';
import { toLocalDate } from './date.utils';

export type CalendarActivityFieldType = 'text' | 'date' | 'eventType' | 'importance' | 'boolean';

export interface CalendarActivityLookups {
  eventTypes?: EventType[];
}

interface CalendarFieldDisplayConfig {
  label: string;
  type: CalendarActivityFieldType;
}

// Matches CalendarDialogComponent.importanceLevels (Low=0, Normal=1, High=2) — kept as a small
// fixed map here rather than an @Input(), since it's a fixed enum, not a fetched lookup table.
const IMPORTANCE_LABELS: Record<string, string> = { '0': 'Low', '1': 'Normal', '2': 'High' };

const CALENDAR_FIELD_DISPLAY_CONFIG: Record<string, CalendarFieldDisplayConfig> = {
  Subject: { label: 'Subject', type: 'text' },
  Location: { label: 'Location', type: 'text' },
  Comment: { label: 'Notes', type: 'text' },
  StartDate: { label: 'Start', type: 'date' },
  EndDate: { label: 'End', type: 'date' },
  AllDayEvent: { label: 'All Day', type: 'boolean' },
  EventTypeId: { label: 'Event Type', type: 'eventType' },
  Importance: { label: 'Importance', type: 'importance' },
  IsRecurring: { label: 'Recurring', type: 'boolean' },
  IsCancelled: { label: 'Cancelled', type: 'boolean' },
  OccurrenceDate: { label: 'Occurrence Date', type: 'date' }
};

function formatCalendarFieldValue(type: CalendarActivityFieldType, rawValue: string, lookups: CalendarActivityLookups): string {
  switch (type) {
    case 'eventType': {
      const match = lookups.eventTypes?.find(t => String(t.id) === rawValue);
      return match ? match.name : rawValue;
    }
    case 'importance':
      return IMPORTANCE_LABELS[rawValue] ?? rawValue;
    case 'boolean':
      return rawValue === 'true' ? 'Yes' : rawValue === 'false' ? 'No' : rawValue;
    case 'date':
      return formatDate(toLocalDate(rawValue), 'medium', 'en-US');
    case 'text':
    default:
      return rawValue;
  }
}

export function toCalendarDisplayChange(change: ActivityFieldChange, lookups: CalendarActivityLookups = {}): DisplayActivityChange {
  const config = CALENDAR_FIELD_DISPLAY_CONFIG[change.fieldName] ?? {
    label: humanizeFieldName(change.fieldName),
    type: 'text' as CalendarActivityFieldType
  };

  return {
    label: config.label,
    oldDisplay: change.oldValue === null ? null : formatCalendarFieldValue(config.type, change.oldValue, lookups),
    newDisplay: change.newValue === null ? 'None' : formatCalendarFieldValue(config.type, change.newValue, lookups)
  };
}

function toRescheduleSummary(startDateChange: ActivityFieldChange): DisplayActivityChange {
  const oldStart = startDateChange.oldValue ? toLocalDate(startDateChange.oldValue) : null;
  const newStart = startDateChange.newValue ? toLocalDate(startDateChange.newValue) : null;

  let shiftText = '';
  if (oldStart && newStart) {
    const daysShifted = Math.round((newStart.getTime() - oldStart.getTime()) / (1000 * 60 * 60 * 24));
    if (daysShifted !== 0) {
      shiftText = ` (${daysShifted > 0 ? '+' : ''}${daysShifted} day${Math.abs(daysShifted) === 1 ? '' : 's'})`;
    }
  }

  return {
    label: 'Rescheduled',
    oldDisplay: oldStart ? formatDate(oldStart, 'medium', 'en-US') : null,
    newDisplay: (newStart ? formatDate(newStart, 'medium', 'en-US') : 'Unknown') + shiftText
  };
}

/**
 * Maps a whole entry's raw field changes to display rows. When both StartDate and EndDate
 * changed together (a reschedule), they're collapsed into one "Rescheduled" summary row instead
 * of two raw date rows — this is purely a frontend presentation choice, recovering the UX value
 * the backend used to provide via a now-removed duplicate EVENT_RESCHEDULED log entry.
 */
export function toCalendarDisplayChanges(changes: ActivityFieldChange[], lookups: CalendarActivityLookups = {}): DisplayActivityChange[] {
  const startDateChange = changes.find(c => c.fieldName === 'StartDate');
  const endDateChange = changes.find(c => c.fieldName === 'EndDate');

  const result: DisplayActivityChange[] = [];

  if (startDateChange && endDateChange) {
    result.push(toRescheduleSummary(startDateChange));
  }

  for (const change of changes) {
    if (startDateChange && endDateChange && (change.fieldName === 'StartDate' || change.fieldName === 'EndDate')) {
      continue;
    }
    result.push(toCalendarDisplayChange(change, lookups));
  }

  return result;
}
