import { Component, EventEmitter, Inject, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSelectModule } from '@angular/material/select';
import { MatTabsModule } from '@angular/material/tabs';
import { MatButtonModule } from '@angular/material/button';
import { Item } from '../../models/board.model';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { CalendarService } from '../../_services/calendar.service';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-calendar-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    MatCheckboxModule,
    MatSelectModule,
    MatTabsModule,
    MatButtonModule,
    MatIconModule,
  ],
  templateUrl: './calendar-dialog.component.html',
  styleUrls: ['./calendar-dialog.component.css'],
})
export class CalendarDialogComponent implements OnInit {
  @Input() date: Date = new Date();
  @Input() linkedRecord: any | null = null;
  @Output() onSave = new EventEmitter<any>();
  @Output() onCancel = new EventEmitter<void>();

  generalForm: FormGroup;
  importanceLevels: string[] = ['Low', 'Normal', 'High'];
  attachments: File[] = [];
  existingAttachments: any[] = [];
  eventId: number | null = null;
  
  constructor(private fb: FormBuilder, @Inject(MAT_DIALOG_DATA) public data: any, private calendarService: CalendarService) {
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
      this.fetchAttachments(this.eventId!); // Use non-null assertion operator
    }
  }  

  fetchAttachments(eventId: number): void {
    this.calendarService.getAttachments(eventId).subscribe(
      (attachments: any[]) => (this.existingAttachments = attachments), // Explicitly type attachments
      (error: any) => console.error('Failed to load attachments', error) // Explicitly type error
    );
  }
  
  onFileSelected(event: any): void {
    const selectedFiles = Array.from(event.target.files) as File[];
    this.attachments.push(...selectedFiles);
  }
  
  uploadAttachments(): void {
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
  }

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
  
  deleteAttachment(id: number): void {
    this.calendarService.deleteAttachment(id).subscribe(
      () => {
        this.existingAttachments = this.existingAttachments.filter(a => a.id !== id);
      },
      (error: any) => console.error('Delete failed', error) // Explicitly type 'error'
    );
  }

  
  handleSave(): void {
    const record = this.generalForm.value;
    this.onSave.emit(record);
  }

  handleCancel(): void {
    this.onCancel.emit();
  }
}