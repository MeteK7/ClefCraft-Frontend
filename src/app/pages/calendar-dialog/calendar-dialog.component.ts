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
import { EventType } from '../../models/event-type.model';
import { NgxMatTimepickerModule } from 'ngx-mat-timepicker';
import { QuillModule } from 'ngx-quill';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatRadioModule } from '@angular/material/radio';

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
    MatNativeDateModule,
    NgxMatTimepickerModule,
    QuillModule,
    MatAutocompleteModule,
    MatRadioModule
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


  eventTypeName: string | null = null;
  eventColor: string | null = null;
  eventTypes: EventType[] = [];

  weekdays: string[] = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  aiComment: string | null = null;

  quillModules = {
    toolbar: [
      [{ header: [1, 2, 3, false] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ color: [] }, { background: [] }],
      [{ list: 'ordered' }, { list: 'bullet' }, { indent: '-1' }, { indent: '+1' }],
      ['link', 'blockquote', 'code-block', 'clean'],
      ['undo', 'redo']
    ]
  };

  filteredLocations: string[] = [];
  allLocations: string[] = [];

  clearNotes(): void {
    this.generalForm.get('comment')?.setValue('');
  }

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
      eventTypeId: [null],
      isRecurring: [false],
      frequency: ['WEEKLY'],
      interval: [1],
      daysOfWeek: [[]],
      endType: ['never'],
      recurrenceEndDate: [null],
      recurrenceCount: [null]
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
      const start = new Date(this.data.eventData.startDate);
      let end = new Date(this.data.eventData.endDate);

      if (this.data.eventData.allDayEvent) {
        end = new Date(end);
        end.setDate(end.getDate() - 1); // convert exclusive end -> inclusive UI end
      }

      const startTime = start.toTimeString().slice(0, 5);
      const endTime = end.toTimeString().slice(0, 5);

      this.generalForm.patchValue({
        ...this.data.eventData,
        startDate: start,
        endDate: end,
        startTime,
        endTime,
        eventTypeId: this.data.eventData.eventTypeId
      });

      this.eventTypeName = this.data.eventData.eventTypeName; // local field
      this.eventColor = this.data.eventData.eventColor;

      this.eventId = this.data.eventData.id;
      this.fetchAttachments(this.eventId!);
    } else {
      const date = new Date(this.data.date);

      this.generalForm.patchValue({
        startDate: date,
        endDate: date,
        startTime: '09:00',
        endTime: '10:00'
      });
    }

    this.loadEventTypes();

    // Patch eventTypeId if editing an existing event
    if (this.data.eventData) {
      this.generalForm.patchValue({
        eventTypeId: this.data.eventData.eventTypeId
      });
    }

    // Track form changes
    this.originalFormValue = this.normalizeForm(this.generalForm.value);
    this.trackFormChanges();

    this.allLocations = ['Istanbul', 'Ankara', 'Berlin', 'London'];

    this.generalForm.get('location')?.valueChanges.subscribe(value => {
      this.filteredLocations = this.filterLocations(value || '');
    });
  }

  private loadEventTypes(): void {
    this.calendarService.getEventTypes().subscribe((types) => {
      this.eventTypes = types;

      // If editing, make sure form shows the right type
      if (this.data.eventData) {
        const currentType = this.eventTypes.find(
          t => t.id === this.data.eventData.eventTypeId
        );
        if (currentType) {
          this.eventTypeName = currentType.name;
          this.eventColor = currentType.color;
        }
      }
    });
  }

  getAttendanceLabel(score?: number): string {
    if (score == null) return '';
    if (score > 0.8) return 'Very Likely';
    if (score > 0.6) return 'Likely';
    if (score > 0.4) return 'Uncertain';
    if (score > 0.2) return 'Unlikely';
    return 'Very Unlikely';
  }

  getAttendanceColor(score?: number): string {
    if (score == null) return '#999';
    if (score > 0.8) return '#2ecc71';
    if (score > 0.6) return '#27ae60';
    if (score > 0.4) return '#f39c12';
    if (score > 0.2) return '#e67e22';
    return '#e74c3c';
  }

  private filterLocations(value: string): string[] {
    const filterValue = value.toLowerCase();
    return this.allLocations.filter(loc =>
      loc.toLowerCase().includes(filterValue)
    );
  }

  onEventTypeChange(selectedId: number | null): void {
    if (selectedId == null) {
      this.eventTypeName = null;
      this.eventColor = null;
      this.generalForm.patchValue({ eventTypeId: null });
      return;
    }

    const selectedType = this.eventTypes.find(t => t.id === selectedId);
    if (selectedType) {
      this.eventTypeName = selectedType.name;
      this.eventColor = selectedType.color;
    }
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

  private normalizeTime(time: string): string {
    if (!time) return time;

    // Convert 12h → 24h if needed
    if (time.toLowerCase().includes('am') || time.toLowerCase().includes('pm')) {
      const date = new Date(`1970-01-01 ${time}`);
      return date.toTimeString().slice(0, 5); // "HH:mm"
    }

    return time;
  }

  fetchAttachments(eventId: number): void {
    this.calendarService.getAttachments(eventId).subscribe(a => {
      this.existingAttachments = a;
    });
  }

  toggleDay(index: number) {
    const days = this.generalForm.value.daysOfWeek || [];

    if (days.includes(index)) {
      this.generalForm.patchValue({
        daysOfWeek: days.filter((d: number) => d !== index)
      });
    } else {
      this.generalForm.patchValue({
        daysOfWeek: [...days, index]
      });
    }
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
        this.normalizeTime(this.generalForm.value.startTime)
      );

      endDate = this.combineDateAndTime(
        endDate,
        this.normalizeTime(this.generalForm.value.endTime)
      );
    } else {
      // Normalize both dates to midnight
      startDate = new Date(startDate);
      endDate = new Date(endDate);

      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(0, 0, 0, 0);

      // Convert inclusive UI end date → exclusive DB end date
      endDate.setDate(endDate.getDate() + 1);
    }

    const recurrenceRule = this.generalForm.value.isRecurring
      ? {
        Frequency: this.generalForm.value.frequency,
        Interval: this.generalForm.value.interval,
        DaysOfWeek: this.generalForm.value.daysOfWeek,
        EndDate: this.generalForm.value.recurrenceEndDate,
        Count: this.generalForm.value.recurrenceCount
      }
      : null;

    this.onSave.emit({
      record: {
        ...this.generalForm.value,
        startDate,
        endDate,
        id: this.eventId,
        isRecurring: this.generalForm.value.isRecurring,
        recurrenceRuleJson: this.generalForm.value.isRecurring
          ? JSON.stringify(recurrenceRule)
          : null
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

  get recurrenceSummary(): string {
    if (!this.generalForm.value.isRecurring) return '';

    const { frequency, interval, daysOfWeek, endType, recurrenceEndDate, recurrenceCount } =
      this.generalForm.value;

    let text = 'Repeats every ';

    // Interval + frequency
    const freqMap: any = {
      DAILY: 'day',
      WEEKLY: 'week',
      MONTHLY: 'month',
      YEARLY: 'year'
    };

    text += `${interval} ${freqMap[frequency]}${interval > 1 ? 's' : ''}`;

    // Weekly days
    if (frequency === 'WEEKLY' && daysOfWeek?.length) {
      const selectedDays = daysOfWeek
        .sort()
        .map((d: number) => this.weekdays[d].slice(0, 3));

      text += ` on ${selectedDays.join(', ')}`;
    }

    // End condition
    if (endType === 'until' && recurrenceEndDate) {
      const date = new Date(recurrenceEndDate).toLocaleDateString();
      text += ` until ${date}`;
    }

    if (endType === 'count' && recurrenceCount) {
      text += ` for ${recurrenceCount} times`;
    }

    return text;
  }
}