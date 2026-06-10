import { MonthViewModel, MonthWeekRow } from '../models/month-view.model';
import { MonthLayoutEngine } from '../layout/month-layout-engine';
import { CalendarEventUI } from '../../models/calendar-event.model-ui';

export class MonthViewGenerator {
  /**
   * Generates a fully populated month viewport configuration grid.
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
    const currentRunningDate = new Date(gridStartDate);

    // Month views universally span up to 6 structured grid rows (42 days absolute matrix max)
    for (let w = 0; w < 6; w++) {
      const weekDates: Date[] = [];
      
      for (let d = 0; d < 7; d++) {
        weekDates.push(new Date(currentRunningDate));
        currentRunningDate.setDate(currentRunningDate.getDate() + 1);
      }

      // Check to prevent generating an extra trailing 6th week row if it falls completely into the next month
      if (w === 5 && weekDates[0].getMonth() !== month) {
        break;
      }

      // Delegate geometry lane layout assignments directly to your specialized pure calculation engine
      const layoutItems = MonthLayoutEngine.generate(events, weekDates);

      weeks.push({
        weekStartTimestamp: weekDates[0].getTime(),
        dates: weekDates,
        layoutItems
      });
    }

    return {
      viewStartDate: weeks[0].dates[0],
      viewEndDate: weeks[weeks.length - 1].dates[6],
      weeks
    };
  }
}