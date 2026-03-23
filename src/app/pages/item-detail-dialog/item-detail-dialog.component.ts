import { Component, Inject, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { MatTabsModule } from '@angular/material/tabs';
import { MatSelectModule } from '@angular/material/select';
import { MatRadioModule } from '@angular/material/radio';

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
    MatRadioModule
  ],
  templateUrl: './item-detail-dialog.component.html',
  styleUrl: './item-detail-dialog.component.css'
})
export class ItemDetailDialogComponent implements OnInit {
  form!: FormGroup;

  markAsWorkedHistory: { dateCreated: string; actionBy: string }[] = [];
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
    private calendarService: CalendarService
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
      dueDate: [item.dueDate],
      estimatedTime: [item.estimatedTime],
      timeSpent: [item.timeSpent]
    });
  }

  private trackFormChanges(): void {
    this.form.valueChanges.subscribe(currentValue => {
      // Compare current value with original
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
    this.boardService.deleteBoardItem(this.data.item.id).subscribe(() => {
      this.dialogRef.close(this.data.item);
    });
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
        dateCreated: this.convertToLocalDate(entry.dateCreated).toISOString(),
        actionBy: entry.actionByFullName
      }));
    });
  }

  convertToLocalDate(utcDate: string): Date {
    const date = new Date(utcDate);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  }

  markAsWorked(): void {
    const currentDate = new Date();
    const endDate = new Date(currentDate.getTime() + 1); // +1 millisecond

    const formValue = this.form.value;

    const calendarEvent = {
      subject: formValue.title,
      comment: formValue.description,
      startDate: currentDate,
      endDate: endDate,
      allDayEvent: false,
      importance: 'Normal',
      linkedBoardItemId: this.data.item.id,
    };

    this.calendarService.saveEvent(calendarEvent).subscribe(() => {
      // After saving, optionally refresh history from backend
      this.fetchMarkAsWorkedHistory();
      this.dialogRef.close();
    });
  }
}
