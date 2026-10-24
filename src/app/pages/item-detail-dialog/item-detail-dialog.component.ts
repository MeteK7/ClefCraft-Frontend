import {
  Component,
  ElementRef,
  EventEmitter,
  Inject,
  NgZone,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
  ChangeDetectionStrategy
} from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogTitle } from '@angular/material/dialog';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatTabsModule } from '@angular/material/tabs';
import { MatSelectModule } from '@angular/material/select';
import { MatRadioModule } from '@angular/material/radio';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule, MatRippleModule } from '@angular/material/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Observable, map, of, switchMap } from 'rxjs';

import { Column, Item, ItemUpdate, Priority, Status, Tag } from '../../models/board.model';
import { AskClosure, AskSummary, askErrorMessage, toAskSummary } from '../../models/board-item-ask.model';
import { AskCompletionService } from '../../_services/ask-completion.service';
import { BoardItemAskService } from '../../_services/board-item-ask.service';
import { BoardItemAsksComponent } from '../../components/board-item-asks/board-item-asks.component';
import { isCompletedStatus } from '../../relationship-engine/analytics/finish-before';
import { BoardService } from '../../_services/board.service';
import { CalendarService } from '../../_services/calendar.service';
import { Assignee } from '../../models/assignee.model';
import { CalendarEventUI } from '../../models/calendar-event.model-ui';
import { UserService } from '../../_services/user.service';
import { AuthService } from '../../_services/auth.service';
import { RelationshipHubComponent } from '../../components/relationship-hub/relationship-hub.component';
import { HistoryTimelineComponent } from '../../components/history-timeline/history-timeline.component';
import { CommentThreadComponent } from '../../components/comment-thread/comment-thread.component';

export type ItemDetailDialogResult =
  | { type: 'saved'; item: Item }
  | { type: 'deleted'; itemId: number };

/** Chime In's rail width when a dialog opens, and its limits; the fields keep at least the main minimum. */
export const CHIME_RAIL_DEFAULT = 360;
export const CHIME_RAIL_MIN = 320;
export const DETAILS_MAIN_MIN = 560;
/** The space between the fields and the rail: 12px gap, the 25px separator, 12px gap. */
export const CHIME_SEPARATOR_SPACE = 49;
/** How far one arrow key moves the divider. */
export const CHIME_RESIZE_STEP = 16;

export interface ItemDetailDialogData {
  /** null => dialog is in "create new item" mode */
  item: Item | null;
  boardId: number;
  /** only needed in create mode, to let the user pick a starting column */
  columns?: Column[];
  /** set when opened from a mention notification/deep link — selects the Comments tab and scrolls to it */
  focusCommentId?: number | null;
}

@Component({
    selector: 'app-item-detail-dialog',
    imports: [
        CommonModule,
        ReactiveFormsModule,
        MatTabsModule,
        MatSelectModule,
        MatRadioModule,
        MatTooltipModule,
        MatIconModule,
        MatFormFieldModule,
        MatInputModule,
        MatButtonModule,
        MatDatepickerModule,
        MatNativeDateModule,
        MatRippleModule,
        MatDialogTitle,
        RelationshipHubComponent,
        HistoryTimelineComponent,
        CommentThreadComponent,
        BoardItemAsksComponent
    ],
    templateUrl: './item-detail-dialog.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrl: './item-detail-dialog.component.css'
})
export class ItemDetailDialogComponent implements OnInit, OnDestroy {
  form!: FormGroup;

  markAsWorkedHistory: { id: number; dateCreated: string; actionBy: string }[] = [];

  assignees: Assignee[] = [];
  tags: Tag[] = [];
  statuses: Status[] = [];
  priorities: Priority[] = [];
  columns: Column[] = [];

  hasUnsavedChanges = false;
  originalItemData!: Item;
  isGraphMaximized = false;

  /** The item's ask counts as the Chime In panel last loaded them; null until it has. */
  askSummary: AskSummary | null = null;

  /**
   * Emits whenever the item's asks were (re)loaded, so the board can update the card while the
   * dialog is still open. The board subscribes through the dialog ref.
   */
  @Output() askSummaryChange = new EventEmitter<AskSummary>();

  /** True while creating a brand new item rather than editing an existing one. */
  get isNewItem(): boolean {
    return !this.data.item?.id;
  }

  /** Non-null accessor for template use inside @if (!isNewItem) blocks. */
  get item(): Item {
    return this.data.item!;
  }

  /** True when the title field holds more than whitespace. */
  get hasTitle(): boolean {
    return !!this.form.value.title?.trim();
  }

  /** The title as currently typed (unsaved edits included), shown in the header on every tab. */
  get displayTitle(): string {
    if (this.hasTitle) return this.form.value.title.trim();
    return this.isNewItem ? 'New item' : 'Untitled item';
  }

  /** Comments is a fixed tab position once past create-mode (Details/Relationships/Work
   * History/History/Comments/Info) — jump straight to it when opened from a mention deep link. */
  get initialTabIndex(): number {
    return this.data.focusCommentId != null ? 4 : 0;
  }

  /** The History tab's position (fixed past create mode): Chime In's "Full history" opens it. */
  readonly historyTabIndex = 3;

  /** The tab chosen since the dialog opened; until then, initialTabIndex. */
  selectedTabIndex: number | null = null;

  // ---- Chime In beside the fields: its width and visibility live only as long as this dialog.

  readonly detailsMainMin = DETAILS_MAIN_MIN;

  /** The rail's width in the rail layout; the divider changes it. */
  railWidth = CHIME_RAIL_DEFAULT;
  /** The Details layout's content width, as last observed; 0 until known. */
  layoutWidth = 0;
  /** Chime In hidden to focus on the fields; it stays loaded, so its counts stay current. */
  chimeHidden = false;
  /** The divider is being dragged. */
  resizing = false;

  private dragStartX = 0;
  private dragStartWidth = 0;
  private resizeObserver?: ResizeObserver;
  private observedLayout?: HTMLElement;
  private chimeHeadingFocusPending = false;

  /** The Details layout comes and goes with its tab: observe whichever element is current. */
  @ViewChild('detailsLayout') set detailsLayout(ref: ElementRef<HTMLElement> | undefined) {
    const element = ref?.nativeElement;
    if (element === this.observedLayout) return;

    this.resizeObserver?.disconnect();
    this.observedLayout = element;
    if (!element || typeof ResizeObserver === 'undefined') return;

    this.resizeObserver = new ResizeObserver(entries => {
      const width = entries[entries.length - 1]?.contentRect.width ?? 0;
      this.zone.run(() => this.onLayoutResized(width));
    });
    this.resizeObserver.observe(element);
  }

  private readonly currentUserId: string | null;

  constructor(
    public dialogRef: MatDialogRef<ItemDetailDialogComponent, ItemDetailDialogResult>,
    @Inject(MAT_DIALOG_DATA) public data: ItemDetailDialogData,
    private fb: FormBuilder,
    private boardService: BoardService,
    private userService: UserService,
    private calendarService: CalendarService,
    private router: Router,
    private askCompletion: AskCompletionService,
    private askService: BoardItemAskService,
    private snackBar: MatSnackBar,
    private zone: NgZone,
    private host: ElementRef<HTMLElement>,
    authService: AuthService
  ) {
    this.currentUserId = authService.getUserId();
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

  // ---- The divider ---------------------------------------------------------------------------

  /** The widest the rail may be while the fields keep their minimum. */
  get railMax(): number {
    return Math.max(CHIME_RAIL_MIN, this.layoutWidth - DETAILS_MAIN_MIN - CHIME_SEPARATOR_SPACE);
  }

  /** The fields' width (the divider's value, as the window-splitter pattern measures the primary pane). */
  get mainWidth(): number {
    return Math.max(0, this.layoutWidth - CHIME_SEPARATOR_SPACE - this.railWidth);
  }

  get mainMax(): number {
    return Math.max(DETAILS_MAIN_MIN, this.layoutWidth - CHIME_SEPARATOR_SPACE - CHIME_RAIL_MIN);
  }

  get separatorValueText(): string {
    return `Details ${this.mainWidth} pixels, Chime In ${this.railWidth} pixels`;
  }

  setRailWidth(width: number): void {
    const atLeastMin = Math.max(CHIME_RAIL_MIN, Math.round(width));
    // Until the layout has been measured there's no maximum to respect yet.
    this.railWidth = this.layoutWidth > 0 ? Math.min(atLeastMin, this.railMax) : atLeastMin;
  }

  onLayoutResized(width: number): void {
    this.layoutWidth = Math.round(width);
    this.setRailWidth(this.railWidth);
  }

  onSeparatorKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowLeft': this.setRailWidth(this.railWidth + CHIME_RESIZE_STEP); break;
      case 'ArrowRight': this.setRailWidth(this.railWidth - CHIME_RESIZE_STEP); break;
      case 'Home': this.setRailWidth(this.railMax); break;
      case 'End': this.setRailWidth(CHIME_RAIL_MIN); break;
      default: return;
    }
    event.preventDefault();
  }

  onSeparatorPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    // No text selection and no scrolling gesture while dragging.
    event.preventDefault();
    try {
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    } catch {
      // A pointer that's already gone can't be captured; the drag still ends on pointerup.
    }
    this.resizing = true;
    this.dragStartX = event.clientX;
    this.dragStartWidth = this.railWidth;
  }

  onSeparatorPointerMove(event: PointerEvent): void {
    if (!this.resizing) return;
    // The rail is on the right: dragging the divider left makes it wider.
    this.setRailWidth(this.dragStartWidth - (event.clientX - this.dragStartX));
  }

  /** pointerup, pointercancel and lostpointercapture all end it, so a drag can never get stuck. */
  endResize(): void {
    this.resizing = false;
  }

  resetRailWidth(): void {
    this.setRailWidth(CHIME_RAIL_DEFAULT);
  }

  // ---- Hiding and showing Chime In ------------------------------------------------------------

  get chimeOpenCount(): number {
    return this.askSummary?.openCount ?? 0;
  }

  /** Open asks the current user is asked to help with. */
  get chimeWaitingCount(): number {
    return this.askSummary?.openAsks.filter(a => a.recipientUserId === this.currentUserId).length ?? 0;
  }

  get chimeRevealLabel(): string {
    const open = this.chimeOpenCount;
    const waiting = this.chimeWaitingCount;
    if (open === 0) return 'Show Chime In';
    const asks = open === 1 ? '1 open ask' : `${open} open asks`;
    return waiting > 0 ? `Show Chime In: ${asks}, ${waiting} waiting for you` : `Show Chime In: ${asks}`;
  }

  hideChime(): void {
    this.chimeHidden = true;
    // The panel's hide button is gone: focus goes to the button that brings it back.
    setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>('.chime-reveal')?.focus());
  }

  showChime(): void {
    this.chimeHidden = false;
    this.selectedTabIndex = 0;
    // Announce the panel that came back: right away on Details, or once the Details tab has rendered again.
    this.chimeHeadingFocusPending = true;
    setTimeout(() => this.focusChimeHeading());
  }

  focusChimeHeading(): void {
    if (!this.chimeHeadingFocusPending) return;
    const heading = this.host.nativeElement.querySelector<HTMLElement>('#asks-heading');
    if (heading) {
      heading.focus();
      this.chimeHeadingFocusPending = false;
    }
  }

  onAskSummaryChange(summary: AskSummary): void {
    this.askSummary = summary;
    this.askSummaryChange.emit(summary);
  }

  /** Open asks or unmet requirements, but nobody responsible for the item. */
  get showsNoAssigneeHint(): boolean {
    return !this.form.value.assigneeId
      && !!this.askSummary
      && (this.askSummary.openCount > 0 || this.askSummary.unmetRequiredCount > 0);
  }

  private isCompletedStatusId(statusId: number | null | undefined): boolean {
    return isCompletedStatus(this.statuses.find(s => s.id === statusId)?.name);
  }

  ngOnInit(): void {
    this.buildForm();

    if (this.data.columns?.length) {
      this.columns = this.data.columns;

      this.form.patchValue({
        boardColumnId:
          this.data.item?.boardColumnId ?? this.columns[0]?.id ?? null
      });
    } else {
      this.boardService
        .getBoardItemsByBoardId(this.data.boardId)
        .subscribe(columns => {
          this.columns = columns;

          this.form.patchValue({
            boardColumnId:
              this.data.item?.boardColumnId ?? columns[0]?.id ?? null
          });
        });
    }

    this.fetchTags();
    this.fetchStatuses();
    this.fetchPriorities();
    this.fetchAssignees();

    if (!this.isNewItem) {
      this.fetchMarkAsWorkedHistory();
    }

    this.originalItemData = structuredClone(this.form.value);
    this.trackFormChanges();
  }

  // Items arrive as the API returns them: status and priority as nested objects, without
  // statusId/priorityId (those are only sent on create/update). Read both, like the board card does.
  private get currentStatusId(): number | undefined {
    return this.data.item?.statusId ?? this.data.item?.status?.id;
  }

  private get currentPriorityId(): number | undefined {
    return this.data.item?.priorityId ?? this.data.item?.priority?.id;
  }

  private buildForm(): void {
    const item = this.data.item;

    this.form = this.fb.group({
      title: [item?.title ?? '', Validators.required],
      description: [item?.description ?? ''],
      statusId: [this.currentStatusId ?? null],
      priorityId: [this.currentPriorityId ?? null],
      tags: [item?.tags?.map(t => t.id) ?? []],
      assigneeId: [item?.assigneeId ?? null],
      boardColumnId: [
        item?.boardColumnId ?? null,
        Validators.required
      ],
      dueDate: [item?.dueDate ? new Date(item.dueDate) : null],
      estimatedTime: [item?.estimatedTime ?? null],
      timeSpent: [item?.timeSpent ?? null]
    });
  }

  private trackFormChanges(): void {
    this.form.valueChanges.subscribe(currentValue => {
      this.hasUnsavedChanges =
        JSON.stringify(currentValue) !== JSON.stringify(this.originalItemData);
    });
  }

  onSave(): void {
    if (this.form.invalid) return;

    const formValue = this.form.value;
    const selectedPriority = this.priorities.find(p => p.id === formValue.priorityId);
    const selectedStatus = this.statuses.find(s => s.id === formValue.statusId);

    if (this.isNewItem) {
      const newItem: Partial<Item> = {
        ...formValue,
        boardId: this.data.boardId,
        priority: selectedPriority ?? undefined,
        status: selectedStatus ?? undefined,
        tagIds: formValue.tags
      };

      this.boardService.createBoardItem(newItem).subscribe(createdItem => {
        this.hasUnsavedChanges = false;
        this.dialogRef.close({ type: 'saved', item: createdItem });
      });
      return;
    }

    const updateData: ItemUpdate = {
      ...this.data.item,
      ...formValue,
      priority: selectedPriority ?? undefined,
      status: selectedStatus ?? undefined,
      tagIds: formValue.tags
    };

    // Moving the item to Done settles its asks first: the prompt (when any are open or
    // required) decides what happens to them, and the save carries that decision.
    const completes = this.isCompletedStatusId(formValue.statusId) && !this.isCompletedStatusId(this.currentStatusId);
    const save = (askClosure: AskClosure | null) =>
      this.boardService.updateBoardItem(askClosure ? { ...updateData, askClosure } : updateData);

    const saved$: Observable<{ item: Item; askSummary: AskSummary | null } | null> = completes
      ? this.askCompletion.completeItem(this.item.id, this.displayTitle, save).pipe(
        // Completing changed the asks: reload them so the card shows what happened.
        switchMap(item => item === null
          ? of(null)
          : this.askService.getForItem(this.item.id).pipe(map(asks => ({ item, askSummary: toAskSummary(asks) })))))
      : save(null).pipe(map(item => ({ item, askSummary: this.askSummary })));

    saved$.subscribe({
      next: result => {
        if (!result) return; // the user cancelled the completion prompt; nothing was saved

        this.hasUnsavedChanges = false;
        this.dialogRef.close({
          type: 'saved',
          item: {
            ...result.item,
            boardColumnId: this.data.item!.boardColumnId,
            ...(result.askSummary ? { askSummary: result.askSummary } : {})
          }
        });
      },
      error: error => this.snackBar.open(askErrorMessage(error, 'The item could not be saved.'), 'Dismiss', { duration: 8000 })
    });
  }

  onDelete(): void {
    if (this.isNewItem) return;

    if (window.confirm('Are you absolutely sure you want to delete this item?')) {
      const itemId = this.data.item!.id;
      this.boardService.deleteBoardItem(itemId).subscribe(() => {
        this.dialogRef.close({ type: 'deleted', itemId });
      });
    }
  }

  onCancel(): void {
    if (this.hasUnsavedChanges) {
      const confirmCancel = window.confirm('You have unsaved changes. Do you want to discard them?');
      if (!confirmCancel) return;
    }
    this.dialogRef.close();
  }

  fetchTags(): void {
    this.boardService.getTags(this.data.boardId).subscribe(tags => this.tags = tags);
  }

  fetchStatuses(): void {
    this.boardService.getStatuses(this.data.boardId).subscribe(data => {
      this.statuses = data;
      this.form.patchValue(
        { statusId: this.currentStatusId ?? data[0]?.id ?? null },
        { emitEvent: false }
      );
    });
  }

  fetchPriorities(): void {
    this.boardService.getPriorities(this.data.boardId).subscribe(data => {
      this.priorities = data;
      this.form.patchValue(
        { priorityId: this.currentPriorityId ?? data[0]?.id ?? null },
        { emitEvent: false }
      );
    });
  }

  fetchAssignees(): void {
    this.userService.getAssignees(this.data.boardId).subscribe(members => {
      this.assignees = this.withCurrentAssignee(members);
      this.form.patchValue(
        { assigneeId: this.data.item?.assigneeId ?? null },
        { emitEvent: false }
      );
    });
  }

  /**
   * Only board members can be newly assigned, but an item may still be assigned to someone who
   * has since left the board. Keep them selectable so the picker doesn't go blank and saving an
   * unrelated change leaves the assignment as it is.
   */
  private withCurrentAssignee(members: Assignee[]): Assignee[] {
    const item = this.data.item;
    if (!item?.assigneeId || members.some(m => m.id === item.assigneeId)) {
      return members;
    }

    const name = [item.assigneeFirstName, item.assigneeLastName].filter(Boolean).join(' ') || 'Unknown user';
    return [...members, { id: item.assigneeId, fullName: `${name} (not a board member)` }];
  }

  fetchMarkAsWorkedHistory(): void {
    if (!this.data.item?.id) return;

    this.calendarService.GetWorkHistory(this.data.item.id).subscribe(history => {
      this.markAsWorkedHistory = history.map(entry => ({
        id: entry.id,
        dateCreated: this.convertToLocalDate(entry.dateCreated).toISOString(),
        actionBy: entry.actionByFullName
      }));
    });
  }

  openWorkHistoryEvent(entry: { id: number; dateCreated: string }): void {
    const urlTree = this.router.createUrlTree(['/calendar'], {
      queryParams: { eventId: entry.id, date: entry.dateCreated }
    });
    window.open(this.router.serializeUrl(urlTree), '_blank');
  }

  convertToLocalDate(utcDate: string): Date {
    const date = new Date(utcDate);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  }

  markAsWorked(): void {
    if (this.isNewItem) return; // needs a saved id to link the calendar event to

    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 1);

    const formValue = this.form.value;

    const calendarEvent: CalendarEventUI = {
      subject: formValue.title,
      comment: formValue.description,
      startDate: startDate,
      endDate: endDate,
      allDayEvent: true,
      importance: 1,
      linkedBoardItemId: this.data.item!.id,
    };

    this.calendarService.saveEvent(calendarEvent).subscribe(() => {
      this.fetchMarkAsWorkedHistory();
      this.dialogRef.close();
    });
  }

  openItemInNewTab(): void {
    const item = this.data.item;

    if (!item?.id) return;

    const queryParams: Record<string, any> = {
      openItemId: item.id
    };

    if (item.boardId != null) {
      queryParams['boardId'] = item.boardId;
    }

    const urlTree = this.router.createUrlTree(['/board'], {
      queryParams
    });

    window.open(
      this.router.serializeUrl(urlTree),
      '_blank',
      'noopener,noreferrer'
    );
  }

  get selectedTags(): Tag[] {
    const selectedIds = this.form.value.tags || [];
    return this.tags.filter(t => selectedIds.includes(t.id));
  }

  get visibleTags(): Tag[] {
    return this.selectedTags.slice(0, 3);
  }

  get hiddenTagCount(): number {
    return Math.max(this.selectedTags.length - 3, 0);
  }

  get hiddenTagsTooltip(): string {
    return this.selectedTags.slice(3).map(t => t.name).join(', ');
  }
}