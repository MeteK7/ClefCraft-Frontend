import {
    Component,
    Input,
    Output,
    EventEmitter,
    ElementRef,
    ViewChild,
    AfterViewInit,
    OnDestroy,
    OnChanges,
    SimpleChanges,
    inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { DragDropModule, CdkDragDrop } from '@angular/cdk/drag-drop';

import { MonthScrollWindow } from '../../../calendar-engine/models/month-scroll-window.model';
import { MonthWeekRow } from '../../../calendar-engine/models/month-view.model';
import { CalendarEventUI } from '../../../models/calendar-event.model-ui';
import { DateUtils } from '../../../calendar-engine/utils/date.utils';
import { MonthScrollEngine } from '../../../calendar-engine/services/month-scroll-engine';

/** Fixed pixel height of one week row. Must match --month-row-height in CSS. */
export const MONTH_ROW_HEIGHT = 140;

/** How many week rows to add per append/prepend batch. */
const LOAD_BATCH_WEEKS = 4;

/** Distance (px) from an edge sentinel that triggers a load. */
const LOAD_TRIGGER_MARGIN = 600;

/** Weeks kept loaded before the far edge is pruned. */
const MAX_LOADED_WEEKS = 26;

export interface VisibleMonthChangeEvent {
    year: number;
    month: number; // 0-based
}

@Component({
    selector: 'app-month-scroll-view',
    standalone: true,
    imports: [CommonModule, MatIconModule, MatMenuModule, DragDropModule],
    templateUrl: './month-scroll-view.component.html',
    styleUrls: ['./month-scroll-view.component.css'],
})
export class MonthScrollViewComponent implements AfterViewInit, OnChanges, OnDestroy {

    @Input({ required: true }) window!: MonthScrollWindow;
    @Input({ required: true }) events: CalendarEventUI[] = [];
    @Input({ required: true }) selectedDate!: Date;
    @Input() weekdays: string[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    @Input() maxVisibleLanes = 3;
    @Input() monthDragEvent: CalendarEventUI | null = null;

    /** Set by the parent when it needs to force-scroll to a specific date (nav buttons, datepicker, "Today"). */
    @Input() scrollToDate: Date | null = null;

    @Output() windowChange = new EventEmitter<MonthScrollWindow>();
    @Output() needMoreEvents = new EventEmitter<{ start: Date; end: Date }>();
    @Output() visibleMonthChange = new EventEmitter<VisibleMonthChangeEvent>();

    @Output() emptyDayClicked = new EventEmitter<Date>();
    @Output() eventClicked = new EventEmitter<{ event: CalendarEventUI; mouseEvent: MouseEvent }>();
    @Output() moreClicked = new EventEmitter<{ date: Date; row: MonthWeekRow; mouseEvent: MouseEvent }>();
    @Output() monthDragStart = new EventEmitter<CalendarEventUI>();
    @Output() monthDragEnd = new EventEmitter<void>();
    @Output() eventDropped = new EventEmitter<CdkDragDrop<MonthWeekRow>>();

    readonly rowHeight = MONTH_ROW_HEIGHT;
    readonly alwaysAllowDrop = (): boolean => true;

    // "+more" popover state — self-contained since it's purely a month-view concern.
    selectedMoreEvents: CalendarEventUI[] = [];
    selectedMoreDate: Date | null = null;

    @ViewChild('scrollContainer', { static: true }) scrollContainerRef!: ElementRef<HTMLDivElement>;
    @ViewChild('stickyHeader', { static: true }) stickyHeaderRef!: ElementRef<HTMLDivElement>;
    @ViewChild('topSentinel', { static: true }) topSentinelRef!: ElementRef<HTMLDivElement>;
    @ViewChild('bottomSentinel', { static: true }) bottomSentinelRef!: ElementRef<HTMLDivElement>;

    /** Measured height of the sticky header. Row 0 starts at this offset now that
     *  the header lives inside the scroll container (required for alignment —
     *  see month-scroll-view.component.html comment). */
    private headerHeight = 0;

    private topObserver?: IntersectionObserver;
    private bottomObserver?: IntersectionObserver;
    private loadingMore = false;
    private lastEmittedMonth: string | null = null;
    private ignoreNextTopCallback = false;
    private ignoreNextBottomCallback = false;

    ngAfterViewInit(): void {
        this.headerHeight = this.stickyHeaderRef.nativeElement.offsetHeight;

        // Land on today's week BEFORE wiring up the observers.
        this.scrollToInitialPosition();
        this.setupObservers();
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['scrollToDate'] && this.scrollToDate) {
            this.scrollToTargetDate(this.scrollToDate);
        }
    }

    ngOnDestroy(): void {
        this.topObserver?.disconnect();
        this.bottomObserver?.disconnect();
    }

    // ==========================================================================
    // SCROLL / VIRTUALIZATION
    // ==========================================================================

    private setupObservers(): void {
        const root = this.scrollContainerRef.nativeElement;

        // IntersectionObserver invokes its callback once immediately upon
        // observe(), reporting the CURRENT intersection state — not just
        // future crossings. With only ~13 weeks loaded (~1820px) and a
        // 600px trigger margin, both sentinels are within range of the
        // initial scroll position regardless of where it's set, so both
        // fire on attach. That was firing onNearTop/onNearBottom before the
        // user ever scrolled, mutating the window and desyncing the
        // index↔scrollTop relationship — which is what pushed the visible
        // month header off to an arbitrary month. Skip that first,
        // spurious invocation on each observer; only real scroll-triggered
        // intersections should load more weeks.
        this.ignoreNextTopCallback = true;
        this.ignoreNextBottomCallback = true;

        this.topObserver = new IntersectionObserver(
            entries => {
                if (this.ignoreNextTopCallback) {
                    this.ignoreNextTopCallback = false;
                    return;
                }
                if (entries[0].isIntersecting) this.onNearTop();
            },
            { root, rootMargin: `${LOAD_TRIGGER_MARGIN}px 0px 0px 0px` },
        );
        this.topObserver.observe(this.topSentinelRef.nativeElement);

        this.bottomObserver = new IntersectionObserver(
            entries => {
                if (this.ignoreNextBottomCallback) {
                    this.ignoreNextBottomCallback = false;
                    return;
                }
                if (entries[0].isIntersecting) this.onNearBottom();
            },
            { root, rootMargin: `0px 0px ${LOAD_TRIGGER_MARGIN}px 0px` },
        );
        this.bottomObserver.observe(this.bottomSentinelRef.nativeElement);

        root.addEventListener('scroll', this.onScroll, { passive: true });
    }

    private onScroll = (): void => {
        this.updateVisibleMonthLabel();
    };

    private onNearBottom(): void {
        if (this.loadingMore) return;
        this.loadingMore = true;

        // Ask the parent to widen the fetched-events range if needed, then grow the window.
        const newLastWeekStart = this.addWeeks(this.window.weeks[this.window.weeks.length - 1].dates[0], LOAD_BATCH_WEEKS);
        this.needMoreEvents.emit({ start: this.window.loadedEnd, end: DateUtils.addDays(newLastWeekStart, 7) });

        let next = MonthScrollEngine.appendWeeks(this.window, LOAD_BATCH_WEEKS, this.events);

        if (next.weeks.length > MAX_LOADED_WEEKS) {
            // We're growing at the bottom, so prune from the top. Adjust scroll
            // position by the removed height so the viewport doesn't jump.
            const removedCount = next.weeks.length - MAX_LOADED_WEEKS;
            const removedHeight = removedCount * this.rowHeight;
            next = MonthScrollEngine.pruneHead(next, MAX_LOADED_WEEKS);

            const root = this.scrollContainerRef.nativeElement;
            root.scrollTop -= removedHeight;
        }

        this.window = next;
        this.windowChange.emit(next);
        this.loadingMore = false;
    }

    private onNearTop(): void {
        if (this.loadingMore) return;
        this.loadingMore = true;

        const newFirstWeekStart = this.addWeeks(this.window.weeks[0].dates[0], -LOAD_BATCH_WEEKS);
        this.needMoreEvents.emit({ start: newFirstWeekStart, end: this.window.loadedStart });

        let next = MonthScrollEngine.prependWeeks(this.window, LOAD_BATCH_WEEKS, this.events);
        const addedHeight = LOAD_BATCH_WEEKS * this.rowHeight;

        if (next.weeks.length > MAX_LOADED_WEEKS) {
            next = MonthScrollEngine.pruneTail(next, MAX_LOADED_WEEKS);
        }

        this.window = next;

        // Critical: compensate scrollTop in the SAME tick as the DOM update so
        // the user never sees the content jump. Angular's change detection
        // runs synchronously enough here because we adjust scrollTop right
        // after mutating the bound input; the browser paints once both are settled.
        const root = this.scrollContainerRef.nativeElement;
        root.scrollTop += addedHeight;

        this.windowChange.emit(next);
        this.loadingMore = false;
    }

    private scrollToInitialPosition(): void {
        const root = this.scrollContainerRef.nativeElement;
        const idx = MonthScrollEngine.findWeekIndexForDate(this.window, this.selectedDate);
        const targetIdx = idx === -1 ? Math.floor(this.window.weeks.length / 2) : idx;
        root.scrollTop = targetIdx * this.rowHeight;          // ← was: this.headerHeight + targetIdx * this.rowHeight
        this.updateVisibleMonthLabel();
    }

    private scrollToTargetDate(date: Date): void {
        const idx = MonthScrollEngine.findWeekIndexForDate(this.window, date);
        const root = this.scrollContainerRef.nativeElement;

        if (idx !== -1) {
            root.scrollTo({ top: idx * this.rowHeight, behavior: 'smooth' });   // ← was: this.headerHeight + idx * this.rowHeight
            return;
        }
    }

    private updateVisibleMonthLabel(): void {
        const root = this.scrollContainerRef.nativeElement;
        const idx = Math.round(root.scrollTop / this.rowHeight);
        const row = this.window.weeks[Math.max(0, Math.min(this.window.weeks.length - 1, idx))];
        if (!row) return;

        const dominant = MonthScrollEngine.getDominantMonthForRow(row);
        const key = `${dominant.year}-${dominant.month}`;
        if (key !== this.lastEmittedMonth) {
            this.lastEmittedMonth = key;
            this.visibleMonthChange.emit(dominant);
        }
    }

    private addWeeks(date: Date, count: number): Date {
        return DateUtils.addDays(DateUtils.startOfWeek(date), count * 7);
    }

    // ==========================================================================
    // TEMPLATE HELPERS (delegate straight to parent via outputs)
    // ==========================================================================

    isToday(date: Date): boolean {
        return DateUtils.isSameDate(date, new Date());
    }

    isSameDate(a: Date, b: Date): boolean {
        return DateUtils.isSameDate(a, b);
    }

    getHiddenCountForDay(date: Date, row: MonthWeekRow): number {
        const colIdx = row.dates.findIndex(d => DateUtils.isSameDate(d, date));
        return row.layoutItems.filter(
            item =>
                item.lane >= this.maxVisibleLanes &&
                item.columnStart <= colIdx + 1 &&
                item.columnStart + item.columnSpan - 1 >= colIdx + 1,
        ).length;
    }

    trackByWeekStart(_index: number, row: MonthWeekRow): number {
        return row.weekStartTimestamp;
    }

    onMoreClicked(date: Date, row: MonthWeekRow, mouseEvent: MouseEvent): void {
        mouseEvent.stopPropagation();

        const dayMs = DateUtils.toDateOnly(date);
        const weekStartMs = DateUtils.toDateOnly(row.dates[0]);
        const colIdx = Math.floor((dayMs - weekStartMs) / DateUtils.DAY_MS) + 1;

        this.selectedMoreEvents = row.layoutItems
            .filter(
                item =>
                    item.lane >= this.maxVisibleLanes &&
                    item.columnStart <= colIdx &&
                    item.columnStart + item.columnSpan - 1 >= colIdx,
            )
            .map(item => item.event);

        this.selectedMoreDate = date;
        this.moreClicked.emit({ date, row, mouseEvent });
    }
}
