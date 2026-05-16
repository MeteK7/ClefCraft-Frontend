/**
 * Describes a single exception to a recurrence series.
 *
 * - 'deleted'  – this occurrence should be completely suppressed.
 * - 'modified' – this occurrence should use the overridden fields
 *                supplied in `override`.
 */
export interface RecurrenceException {
  /** The id of the base (root) recurring event. */
  baseEventId: number;

  /**
   * The *original* start date of the occurrence being excepted
   * (i.e. the date it would have had without the exception).
   * Used as the key for matching.
   */
  originalDate: Date;

  type: 'deleted' | 'modified';

  /**
   * Fields to merge into the occurrence when type === 'modified'.
   * Only the listed fields are overridable to keep the surface small.
   */
  override?: {
    subject?: string;
    comment?: string;
    startDate?: Date;
    endDate?: Date;
  };
}

/**
 * Applies a set of exceptions to an already-expanded list of occurrences.
 *
 * Call this after RecurrenceExpander.expand() to suppress deleted
 * occurrences and replace fields for modified ones.
 *
 * Usage:
 * ```ts
 * const raw = RecurrenceExpander.expand(…);
 * const dates = RecurrenceExceptionEngine.applyExceptions(raw, exceptions);
 * ```
 */
export class RecurrenceExceptionEngine {

  /**
   * @param occurrences Expanded occurrence dates (from RecurrenceExpander).
   * @param exceptions  Exception records for the same base event.
   * @returns Filtered + patched occurrence list.
   */
  static applyExceptions<T extends { startDate: Date; endDate: Date }>(
    occurrences: T[],
    exceptions: RecurrenceException[]
  ): T[] {

    if (!exceptions.length) {
      return occurrences;
    }

    return occurrences
      // Remove deleted occurrences
      .filter(occ =>
        !exceptions.some(ex =>
          ex.type === 'deleted' &&
          this.isSameDay(occ.startDate, ex.originalDate)
        )
      )
      // Patch modified occurrences
      .map(occ => {
        const mod = exceptions.find(ex =>
          ex.type === 'modified' &&
          this.isSameDay(occ.startDate, ex.originalDate)
        );

        if (!mod?.override) {
          return occ;
        }

        return { ...occ, ...mod.override };
      });
  }

  /**
   * Convenience: filters exception records to only those relevant to a
   * specific base event, then applies them. Useful when a single array
   * holds exceptions for multiple events.
   */
  static applyForBaseEvent<T extends { startDate: Date; endDate: Date }>(
    occurrences: T[],
    baseEventId: number,
    allExceptions: RecurrenceException[]
  ): T[] {

    const relevant = allExceptions.filter(
      ex => ex.baseEventId === baseEventId
    );

    return this.applyExceptions(occurrences, relevant);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private static isSameDay(a: Date, b: Date): boolean {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth()    === b.getMonth()    &&
      a.getDate()     === b.getDate()
    );
  }
}
