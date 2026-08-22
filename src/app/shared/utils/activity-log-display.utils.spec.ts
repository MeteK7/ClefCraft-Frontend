import { ActivityLookups, humanizeFieldName, toDisplayChange } from './activity-log-display.utils';

describe('activity-log-display.utils', () => {
  const lookups: ActivityLookups = {
    assignees: [
      { id: 'user-1', email: 'john@example.com', firstname: 'John', lastname: 'Doe', fullName: 'John Doe' },
      { id: 'user-2', email: 'jane@example.com', firstname: 'Jane', lastname: 'Smith', fullName: 'Jane Smith' }
    ],
    columns: [
      { id: 1, title: 'To Do', boardItems: [] },
      { id: 4, title: 'In Progress', boardItems: [] }
    ],
    statuses: [{ id: 2, name: 'Open' }],
    priorities: [{ id: 3, name: 'High' }]
  };

  describe('humanizeFieldName', () => {
    it('inserts spaces before capitals and strips a trailing Id', () => {
      expect(humanizeFieldName('EstimatedTime')).toBe('Estimated Time');
      expect(humanizeFieldName('BoardColumnId')).toBe('Board Column');
      expect(humanizeFieldName('Title')).toBe('Title');
    });
  });

  describe('toDisplayChange', () => {
    it('resolves an assignee change to full names', () => {
      const result = toDisplayChange(
        { fieldName: 'AssigneeId', oldValue: 'user-1', newValue: 'user-2' },
        lookups
      );

      expect(result).toEqual({ label: 'Assignee', oldDisplay: 'John Doe', newDisplay: 'Jane Smith' });
    });

    it('resolves a column change to titles', () => {
      const result = toDisplayChange(
        { fieldName: 'BoardColumnId', oldValue: '1', newValue: '4' },
        lookups
      );

      expect(result).toEqual({ label: 'Column', oldDisplay: 'To Do', newDisplay: 'In Progress' });
    });

    it('formats a date field as a readable date, ignoring sub-second precision noise', () => {
      const result = toDisplayChange(
        { fieldName: 'DueDate', oldValue: '2026-06-27T19:43:36.47299Z', newValue: '2026-06-27T19:43:36.472Z' },
        lookups
      );

      expect(result.label).toBe('Due Date');
      // Same instant, differing only in sub-second precision, must render identically.
      expect(result.oldDisplay).toBe(result.newDisplay);
      expect(result.newDisplay).toMatch(/\d{4}/);
    });

    it('hides the old value when there was none (e.g. on creation)', () => {
      const result = toDisplayChange({ fieldName: 'Title', oldValue: null, newValue: 'New title' }, lookups);

      expect(result.oldDisplay).toBeNull();
      expect(result.newDisplay).toBe('New title');
    });

    it('displays "None" when a value is cleared', () => {
      const result = toDisplayChange({ fieldName: 'AssigneeId', oldValue: 'user-1', newValue: null }, lookups);

      expect(result.newDisplay).toBe('None');
    });

    it('falls back to the raw id when no match is found in the lookup', () => {
      const result = toDisplayChange({ fieldName: 'AssigneeId', oldValue: null, newValue: 'unknown-user' }, lookups);

      expect(result.newDisplay).toBe('unknown-user');
    });

    it('falls back to a humanized label and raw values for unmapped fields', () => {
      const result = toDisplayChange({ fieldName: 'CustomField', oldValue: 'a', newValue: 'b' }, lookups);

      expect(result.label).toBe('Custom Field');
      expect(result.oldDisplay).toBe('a');
      expect(result.newDisplay).toBe('b');
    });

    it('works without any lookups provided', () => {
      const result = toDisplayChange({ fieldName: 'Title', oldValue: 'a', newValue: 'b' });

      expect(result).toEqual({ label: 'Title', oldDisplay: 'a', newDisplay: 'b' });
    });
  });
});
