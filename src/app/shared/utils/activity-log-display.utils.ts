import { formatDate } from '@angular/common';

import { ActivityFieldChange } from '../../models/activity-log.model';
import { Assignee } from '../../models/assignee.model';
import { Column, Priority, Status } from '../../models/board.model';
import { toLocalDate } from './date.utils';

export type ActivityFieldType = 'text' | 'date' | 'assignee' | 'column' | 'status' | 'priority' | 'number';

export interface ActivityLookups {
  assignees?: Assignee[];
  columns?: Column[];
  statuses?: Status[];
  priorities?: Priority[];
}

export interface DisplayActivityChange {
  label: string;
  /** null hides the "old →" segment entirely (e.g. there was no previous value). */
  oldDisplay: string | null;
  newDisplay: string;
}

interface FieldDisplayConfig {
  label: string;
  type: ActivityFieldType;
}

const FIELD_DISPLAY_CONFIG: Record<string, FieldDisplayConfig> = {
  Title: { label: 'Title', type: 'text' },
  Description: { label: 'Description', type: 'text' },
  AssigneeId: { label: 'Assignee', type: 'assignee' },
  BoardColumnId: { label: 'Column', type: 'column' },
  BoardId: { label: 'Board', type: 'text' },
  DueDate: { label: 'Due Date', type: 'date' },
  EstimatedTime: { label: 'Estimated Time', type: 'number' },
  TimeSpent: { label: 'Time Spent', type: 'number' },
  StatusId: { label: 'Status', type: 'status' },
  PriorityId: { label: 'Priority', type: 'priority' }
};

/** Fallback label for a field with no entry in FIELD_DISPLAY_CONFIG, e.g. "EstimatedTime" -> "Estimated Time". */
export function humanizeFieldName(fieldName: string): string {
  return fieldName
    .replace(/Id$/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim();
}

function resolveById<T extends { id: number | string }>(
  items: T[] | undefined,
  rawValue: string,
  nameOf: (item: T) => string
): string {
  const match = items?.find(item => String(item.id) === rawValue);
  return match ? nameOf(match) : rawValue;
}

function formatFieldValue(type: ActivityFieldType, rawValue: string, lookups: ActivityLookups): string {
  switch (type) {
    case 'assignee':
      return resolveById(lookups.assignees, rawValue, a => a.fullName);
    case 'column':
      return resolveById(lookups.columns, rawValue, c => c.title);
    case 'status':
      return resolveById(lookups.statuses, rawValue, s => s.name);
    case 'priority':
      return resolveById(lookups.priorities, rawValue, p => p.name);
    case 'date':
      return formatDate(toLocalDate(rawValue), 'mediumDate', 'en-US');
    case 'number':
    case 'text':
    default:
      return rawValue;
  }
}

export function toDisplayChange(change: ActivityFieldChange, lookups: ActivityLookups = {}): DisplayActivityChange {
  const config = FIELD_DISPLAY_CONFIG[change.fieldName] ?? {
    label: humanizeFieldName(change.fieldName),
    type: 'text' as ActivityFieldType
  };

  return {
    label: config.label,
    oldDisplay: change.oldValue === null ? null : formatFieldValue(config.type, change.oldValue, lookups),
    newDisplay: change.newValue === null ? 'None' : formatFieldValue(config.type, change.newValue, lookups)
  };
}
