import { Component, Inject, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
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
import { MatNativeDateModule } from '@angular/material/core';   
import { MatRippleModule } from '@angular/material/core'; 

import { Item, Priority, Status, Tag } from '../../models/board.model';
import { BoardService } from '../../_services/board.service';
import { CalendarService } from '../../_services/calendar.service';
import { Assignee } from '../../models/assignee.model';
import { UserService } from '../../_services/user.service';

@Component({
  selector: 'app-item-detail-dialog',
  standalone: true,
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
    MatRippleModule
  ],
  templateUrl: './item-detail-dialog.component.html',
  styleUrl: './item-detail-dialog.component.css'
})
export class ItemDetailDialogComponent implements OnInit {
  form!: FormGroup;

  markAsWorkedHistory: { id: number; dateCreated: string; actionBy: string }[] = [];

  assignees: Assignee[] = [];
  tags: Tag[] = [];
  statuses: Status[] = [];
  priorities: Priority[] = [];

  hasUnsavedChanges = false;
  originalItemData!: Item;

  constructor(
    public dialogRef: MatDialogRef<ItemDetailDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { item: Item },
    private fb: FormBuilder,
    private boardService: BoardService,
    private userService: UserService,
    private calendarService: CalendarService,
    private router: Router
  ) { }

  ngOnInit(): void {
    this.buildForm();
    this.fetchTags();
    this.fetchStatuses();
    this.fetchPriorities();
    this.fetchAssignees();
    this.fetchMarkAsWorkedHistory();

    this.originalItemData = structuredClone(this.form.value);

    this.trackFormChanges();
  }

  private buildForm(): void {
    const item = this.data.item;

    this.form = this.fb.group({
      title: [item.title],
      description: [item.description],
      statusId: [item.status?.id ?? null],
      priorityId: [item.priority?.id ?? null],
      tags: [item.tags?.map(t => t.id) ?? []],
      assigneeId: [item.assigneeId ?? null],
      // Parsed as a Date object so matDatepicker functions properly out-of-the-box
      dueDate: [item.dueDate ? new Date(item.dueDate) : null], 
      estimatedTime: [item.estimatedTime],
      timeSpent: [item.timeSpent]
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

    const selectedPriority = this.priorities.find(
      p => p.id === formValue.priorityId
    );

    const selectedStatus = this.statuses.find(
      s => s.id === formValue.statusId
    );

    const updateData = {
      ...this.data.item,
      ...formValue,
      priority: selectedPriority ?? undefined,
      status: selectedStatus ?? undefined,
      tagIds: formValue.tags
    };

    this.boardService.updateBoardItem(updateData).subscribe((updatedItemFromApi) => {
      this.hasUnsavedChanges = false;
      this.dialogRef.close({
        ...updatedItemFromApi,
        boardColumnId: this.data.item.boardColumnId
      });
    });
  }

  onDelete(): void {
    if (window.confirm('Are you absolutely sure you want to delete this item?')) {
      this.boardService.deleteBoardItem(this.data.item.id).subscribe(() => {
        this.dialogRef.close(this.data.item);
      });
    }
  }

  onCancel(): void {
    if (this.hasUnsavedChanges) {
      const confirmCancel = window.confirm(
        'You have unsaved changes. Do you want to discard them?'
      );
      if (!confirmCancel) return;
    }
    this.dialogRef.close();
  }

  fetchTags(): void {
    this.boardService.getTags(this.data.item.boardId)
      .subscribe(tags => this.tags = tags);
  }

  fetchStatuses(): void {
    this.boardService
      .getStatuses(this.data.item.boardId)
      .subscribe(data => this.statuses = data);
  }

  fetchPriorities(): void {
    this.boardService
      .getPriorities(this.data.item.boardId)
      .subscribe(data => this.priorities = data);
  }

  fetchAssignees(): void {
    this.userService.getAssignees().subscribe(data => {
      this.assignees = data;

      this.form.patchValue(
        {
          assigneeId: this.data.item.assigneeId
        },
        { emitEvent: false }
      );
    });
  }

  fetchMarkAsWorkedHistory(): void {
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
      queryParams: {
        eventId: entry.id,
        date: entry.dateCreated
      }
    });
    const url = this.router.serializeUrl(urlTree);
    window.open(url, '_blank');
  }

  convertToLocalDate(utcDate: string): Date {
    const date = new Date(utcDate);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  }

  markAsWorked(): void {
    const currentDate = new Date();
    const endDate = new Date(currentDate.getTime() + 1);

    const formValue = this.form.value;

    const calendarEvent = {
      subject: formValue.title,
      comment: formValue.description,
      startDate: currentDate,
      endDate: endDate,
      allDayEvent: false,
      importance: 1,
      linkedBoardItemId: this.data.item.id,
    };

    this.calendarService.saveEvent(calendarEvent).subscribe(() => {
      this.fetchMarkAsWorkedHistory();
      this.dialogRef.close();
    });
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
    return this.selectedTags
      .slice(3)
      .map(t => t.name)
      .join(', ');
  }
}