import {
  Component,
  EventEmitter,
  Inject,
  Input,
  OnInit,
  Output
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators
} from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog } from '@angular/material/dialog';
import { CalendarService } from '../../_services/calendar.service';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSelectModule } from '@angular/material/select';
import { MatTabsModule } from '@angular/material/tabs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { ItemDetailDialogComponent } from '../item-detail-dialog/item-detail-dialog.component';

@Component({
  selector: 'app-calendar-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatCheckboxModule,
    MatSelectModule,
    MatTabsModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    MatDatepickerModule,
    MatNativeDateModule
  ],
  templateUrl: './calendar-dialog.component.html',
  styleUrls: ['./calendar-dialog.component.css'],
})
export class CalendarDialogComponent implements OnInit {

  @Output() onSave = new EventEmitter<any>();
  @Output() onCancel = new EventEmitter<void>();

  generalForm: FormGroup;

  importanceLevels = ['Low', 'Normal', 'High'];

  existingAttachments: any[] = [];
  stagedAttachments: File[] = [];

  eventId: number | null = null;
  hasFormChanges = false;
  hasAttachmentChanges = false;

  get hasUnsavedChanges(): boolean {
    return this.hasFormChanges || this.hasAttachmentChanges;
  }
  private originalFormValue!: any;

  constructor(
    private fb: FormBuilder,
    @Inject(MAT_DIALOG_DATA) public data: any,
    private calendarService: CalendarService,
    private dialog: MatDialog
  ) {
    this.generalForm = this.fb.group({
      subject: ['', Validators.required],
      location: [''],
      startDate: ['', Validators.required],
      endDate: ['', Validators.required],
      startTime: [''],
      endTime: [''],
      allDayEvent: [false],
      importance: ['Normal'],
      comment: [''],
    });
  }

  ngOnInit(): void {
    this.generalForm.get('allDayEvent')?.valueChanges.subscribe(isAllDay => {
      const startTime = this.generalForm.get('startTime');
      const endTime = this.generalForm.get('endTime');

      if (!isAllDay) {
        startTime?.setValidators([Validators.required]);
        endTime?.setValidators([Validators.required]);
      } else {
        startTime?.clearValidators();
        endTime?.clearValidators();
      }

      startTime?.updateValueAndValidity();
      endTime?.updateValueAndValidity();
    });

    if (this.data.eventData) {
      this.generalForm.patchValue(this.data.eventData);
      this.eventId = this.data.eventData.id;
      this.fetchAttachments(this.eventId!);
    } else {
      this.generalForm.patchValue({
        startDate: this.data.date,
        endDate: this.data.date
      });
    }

    this.originalFormValue = this.normalizeForm(this.generalForm.value);
    this.trackFormChanges();
  }

  private trackFormChanges(): void {
    this.generalForm.valueChanges.subscribe(value => {
      const current = this.normalizeForm(value);
      this.hasFormChanges =
        JSON.stringify(current) !== JSON.stringify(this.originalFormValue);
    });
  }

  private normalizeForm(value: any) {
    return {
      ...value,
      startDate: value.startDate
        ? new Date(value.startDate).toISOString()
        : null,
      endDate: value.endDate
        ? new Date(value.endDate).toISOString()
        : null
    };
  }

  fetchAttachments(eventId: number): void {
    this.calendarService.getAttachments(eventId).subscribe(a => {
      this.existingAttachments = a;
    });
  }

  /*uploadAttachments(): void {
    if (!this.eventId) return;

    const formData = new FormData();
    this.attachments.forEach(file => formData.append('files', file));

    this.calendarService.uploadAttachments(this.eventId, formData).subscribe(
      () => {
        this.fetchAttachments(this.eventId!);
        this.attachments = [];
      },
      (error: any) => console.error('Upload failed', error) // Explicitly type 'error'
    );
  }*/

  downloadAttachment(attachment: any): void {
    this.calendarService.downloadAttachment(attachment.id).subscribe(
      (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = attachment.fileName;
        a.click();
        window.URL.revokeObjectURL(url);
      },
      (error: any) => console.error('Download failed', error)
    );
  }

  // ============================
  // ATTACHMENTS (STAGED)
  // ============================

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;

    if (!input.files || input.files.length === 0) return;

    this.stagedAttachments.push(...Array.from(input.files));
    this.hasAttachmentChanges = true;
  }

  removeStagedFile(file: File): void {
    this.stagedAttachments = this.stagedAttachments.filter(f => f !== file);
    this.hasAttachmentChanges = true;
  }

  deleteAttachment(id: number): void {
    if (!confirm('Delete this attachment?')) return;

    this.calendarService.deleteAttachment(id).subscribe(() => {
      this.existingAttachments =
        this.existingAttachments.filter(a => a.id !== id);
      this.hasAttachmentChanges = true;
    });
  }

  private combineDateAndTime(date: Date, time: string): Date {
    const [hours, minutes] = time.split(':').map(Number);

    const result = new Date(date);
    result.setHours(hours, minutes, 0, 0);

    return result;
  }

  // ============================
  // SAVE / CANCEL
  // ============================

  handleSave(): void {
    if (this.generalForm.invalid) {
      this.generalForm.markAllAsTouched();
      return;
    }

    let startDate = this.generalForm.value.startDate;
    let endDate = this.generalForm.value.endDate;

    if (!this.generalForm.value.allDayEvent) {
      startDate = this.combineDateAndTime(
        startDate,
        this.generalForm.value.startTime
      );

      endDate = this.combineDateAndTime(
        endDate,
        this.generalForm.value.endTime
      );
    } else {
      // Normalize all-day to midnight UTC
      startDate = new Date(startDate.setHours(0, 0, 0, 0));
      endDate = new Date(endDate.setHours(23, 59, 59, 999));
    }

    this.onSave.emit({
      record: {
        ...this.generalForm.value,
        startDate,
        endDate,
        id: this.eventId
      },
      attachments: this.stagedAttachments
    });

    this.originalFormValue = this.normalizeForm(this.generalForm.value);
    this.hasFormChanges = false;
    this.hasAttachmentChanges = false;
  }


  handleCancel(): void {
    if (!this.hasUnsavedChanges) {
      this.onCancel.emit();
      return;
    }

    const confirm = window.confirm(
      'You have unsaved changes, including attachments.\n\nDiscard them?'
    );

    if (confirm) {
      this.onCancel.emit();
    }
  }

  openLinkedBoardItem(): void {
    this.dialog.open(ItemDetailDialogComponent, {
      width: '70%',
      data: {
        itemId: this.data.eventData.linkedBoardItemId
      }
    });
  }
}