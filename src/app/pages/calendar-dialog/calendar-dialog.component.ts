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
  hasUnsavedChanges = false;

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
      allDay: [false],
      importance: ['Normal'],
      comment: [''],
    });
  }

  ngOnInit(): void {
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

    // 🔴 Global dirty tracking
    this.generalForm.valueChanges.subscribe(() => {
      this.hasUnsavedChanges = true;
    });
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

  onFileSelected(event: any): void {
    const files = Array.from(event.target.files) as File[];
    this.stagedAttachments.push(...files);
    this.hasUnsavedChanges = true;
  }

  removeStagedFile(file: File): void {
    this.stagedAttachments = this.stagedAttachments.filter(f => f !== file);
    this.hasUnsavedChanges = true;
  }

  deleteAttachment(id: number): void {
    this.calendarService.deleteAttachment(id).subscribe(() => {
      this.existingAttachments =
        this.existingAttachments.filter(a => a.id !== id);
      this.hasUnsavedChanges = true;
    });
  }


  // ============================
  // SAVE / CANCEL
  // ============================

  handleSave(): void {
    const record = {
      ...this.generalForm.value,
      id: this.eventId
    };

    this.onSave.emit({
      record,
      attachments: this.stagedAttachments
    });

    this.hasUnsavedChanges = false;
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
}