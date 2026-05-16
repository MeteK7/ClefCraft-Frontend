import { CalendarEventUI } from './calendar-event.model-ui';

/**
 * A CalendarEventUI enriched with absolute pixel-positioning data
 * produced by TimeBlockLayoutEngine for the day-view and week-view
 * time grids.
 */
export interface CalendarTimeBlock extends CalendarEventUI {
  /** Pixel offset from the top of the 24-hour grid. */
  top: number;
  /** Pixel height of the block (min 15 min equivalent). */
  height: number;

  /** Left offset as a percentage within the day column. */
  left: number;
  /** Width as a percentage within the day column. */
  width: number;

  /** 0-based index of this block's lane inside its collision group. */
  overlapIndex: number;
  /** Total number of lanes in this block's collision group. */
  overlapCount: number;
}
