export interface ActivityFieldChange {
  fieldName: string;
  oldValue: string | null;
  newValue: string | null;
}

export interface ActivityLogEntry {
  id: number;
  entityType: string;
  entityId: number;
  actionType: string;
  timestamp: string;
  actorUserId: string;
  actorFullName: string;
  changes: ActivityFieldChange[];
}

export interface PagedResult<T> {
  items: T[];
  totalCount: number;
  pageNumber: number;
  pageSize: number;
  hasMore: boolean;
}
