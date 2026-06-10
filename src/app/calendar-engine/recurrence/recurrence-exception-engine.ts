export interface RecurrenceException {
  /** The id of the base (root) recurring event. */
  baseEventId: number;

  originalDate: Date;

  type: 'deleted' | 'modified';

  override?: {
    subject?: string;
    comment?: string;
    startDate?: Date;
    endDate?: Date;
  };
}

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

  private static isSameDay(a: Date, b: Date): boolean {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth()    === b.getMonth()    &&
      a.getDate()     === b.getDate()
    );
  }
}
