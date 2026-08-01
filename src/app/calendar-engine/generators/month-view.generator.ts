import { MonthViewModel, MonthWeekRow } from '../models/month-view.model';
import { CalendarEventUI } from '../../models/calendar-event.model-ui';
import { WeekRowGenerator } from './week-row.generator';

export class MonthViewGenerator {
  /**
   * Generates a fully populated month viewport configuration grid.
   *
   * NOTE: kept for backward compatibility (e.g. any code/tests still
   * asking for "the classic 6-row grid for one month"). The new
   * infinite-scroll month view uses MonthScrollEngine + WeekRowGenerator
   * directly instead of calling this.
   *
   * @param selectedDate The anchor date targeting the focused month view.
   * @param events Pre-expanded, filtered events intersectable with the target month boundaries.
   */
  static generate(selectedDate: Date, events: CalendarEventUI[]): MonthViewModel {
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth();

    const firstOfMonth = new Date(year, month, 1);
    const startDayOffset = (firstOfMonth.getDay() + 6) % 7; // ISO-like week mapping: Mon-Sun

    // Calculate grid anchor start date (Monday of the first grid block row)
    const gridStartDate = new Date(year, month, 1 - startDayOffset);
    gridStartDate.setHours(0, 0, 0, 0);

    const weeks: MonthWeekRow[] = [];
    let currentWeekStart = new Date(gridStartDate);

    // Month views universally span up to 6 structured grid rows (42 days absolute matrix max)
    for (let w = 0; w < 6; w++) {
      const row = WeekRowGenerator.generate(currentWeekStart, events);

      // Check to prevent generating an extra trailing 6th week row if it falls completely into the next month
      if (w === 5 && row.dates[0].getMonth() !== month) {
        break;
      }

      weeks.push(row);
      currentWeekStart = WeekRowGenerator.nextWeekStart(currentWeekStart);
    }

    return {
      viewStartDate: weeks[0].dates[0],
      viewEndDate: weeks[weeks.length - 1].dates[6],
      weeks,
    };
  }
}
