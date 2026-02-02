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
  availableAssignees = ['User 1', 'User 2', 'User 3'];
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
    private calendarService: CalendarService
  ) { }

  ngOnInit(): void {
    this.originalItemData = structuredClone(this.data.item);

    this.buildForm();
    this.fetchTags();
    this.fetchStatuses();
    this.fetchPriorities();
    this.fetchMarkAsWorkedHistory();
    this.trackFormChanges();
  }

  private buildForm(): void {
    const item = this.data.item;

    this.form = this.fb.group({
      title: [item.title],
      description: [item.description],
      statusId: [item.statusId],
      priorityId: [item.priorityId],
      tags: [item.tags ?? []],
      assignee: [item.assignee],
      dueDate: [item.dueDate],
      estimatedTime: [item.estimatedTime],
      timeSpent: [item.timeSpent]
    });
  }

  private trackFormChanges(): void {
    this.form.valueChanges.subscribe(value => {
      const current = { ...this.originalItemData, ...value };
      this.hasUnsavedChanges =
        JSON.stringify(current) !== JSON.stringify(this.originalItemData);
    });
  }

  onSave(): void {
    if (this.form.invalid) return;

    const formValue = this.form.value;

    const updateData = {
      ...this.data.item,
      ...formValue,
      tagIds: formValue.tags?.map((t: Tag) => t.id) ?? []
    };

    this.boardService.updateBoardItem(updateData).subscribe(() => {
      this.hasUnsavedChanges = false;
      this.dialogRef.close(updateData);
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
    const boardId = this.data.item.boardId;

    this.boardService.getTags(boardId).subscribe(tags => {
      this.tags = tags;

      const selected = this.form.get('tags')?.value ?? [];
      this.form.patchValue({
        tags: selected.map((t: Tag) =>
          this.tags.find(tag => tag.id === t.id) || t
        )
      });
    });
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
    const currentDate = new Date().toISOString();
    const formValue = this.form.value;

    const calendarEvent = {
      subject: formValue.title,
      comment: formValue.description,
      startDate: currentDate,
      endDate: currentDate,
      allDayEvent: true,
      importance: 'Normal',
      linkedBoardItemId: this.data.item.id,
      userId: '944d0156-cb3d-466f-a1ea-5f53e3a10f8e'
    };

    this.calendarService.saveEvent(calendarEvent).subscribe(() => {
      this.markAsWorkedHistory.push({
        dateCreated: currentDate,
        actionBy: 'Current User'
      });
      this.dialogRef.close();
    });
  }
}
