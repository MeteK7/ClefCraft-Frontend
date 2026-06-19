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
import { getAttendanceColor, getAttendanceLabel } from '../../utils/attendance.utils';
import { RecurrenceScopeDialogComponent, RecurrenceUpdateScope } from '../recurrence-scope-dialog/recurrence-scope-dialog.component';
import { Subscription } from 'rxjs';

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

  importanceLevels = [
    { label: 'Low', value: 0 },
    { label: 'Normal', value: 1 },
    { label: 'High', value: 2 }
  ];

  reminderOptions = [
    { label: 'At time of event', value: 0 },
    { label: '5 minutes before', value: 5 },
    { label: '15 minutes before', value: 15 },
    { label: '30 minutes before', value: 30 },
    { label: '1 hour before', value: 60 },
    { label: '2 hours before', value: 120 },
    { label: '1 day before', value: 1440 }
  ];

  existingAttachments: any[] = [];
  stagedAttachments: File[] = [];

  eventId: number | null = null;
  baseEventId: number | null = null;
  hasFormChanges = false;
  hasAttachmentChanges = false;

  /**
   * Captures the occurrence's original scheduled start date at the moment
   * the dialog opens — before the user makes any edits.
   *
   * This is used as the stable key for identifying which occurrence is being
   * targeted when the user saves. It is emitted inside the save payload so
   * that CalendarComponent can pass it to the correct CalendarService method,
   * regardless of whether the user also changed the startDate field.
   */
  originalOccurrenceDate: Date | null = null;

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

  attendanceLabel = getAttendanceLabel;
  attendanceColor = getAttendanceColor;

  clearNotes(): void {
    this.generalForm.get('comment')?.setValue('');
  }

  get hasUnsavedChanges(): boolean {
    return this.hasFormChanges || this.hasAttachmentChanges;
  }

  private originalFormValue!: any;
  private startChangesSubscription!: Subscription;

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
      importance: [1],
      comment: [''],
      eventTypeId: [null],
      isRecurring: [false],
      frequency: ['WEEKLY'],
      interval: [1],
      daysOfWeek: [[]],
      endType: ['never'],
      recurrenceEndDate: [null],
      recurrenceCount: [null],
      reminderMinutes: [[]]
    }, { validators: this.dateTimeOrderValidator });
  }

  ngOnInit(): void {
    this.generalForm.get('allDayEvent')?.valueChanges.subscribe(isAllDay => {
      const startTime = this.generalForm.get('startTime');
      const endTime = this.generalForm.get('endTime');

      if (isAllDay) {
        startTime?.clearValidators();
        endTime?.clearValidators();

        startTime?.disable({ emitEvent: false });
        endTime?.disable({ emitEvent: false });
      } else {
        startTime?.setValidators([Validators.required]);
        endTime?.setValidators([Validators.required]);

        startTime?.enable({ emitEvent: false });
        endTime?.enable({ emitEvent: false });
      }

      startTime?.updateValueAndValidity();
      endTime?.updateValueAndValidity();
    });

    this.generalForm.get('startTime')?.valueChanges.subscribe(() => {
      this.generalForm.updateValueAndValidity();
    });

    this.generalForm.get('endTime')?.valueChanges.subscribe(() => {
      this.generalForm.updateValueAndValidity();
    });

    if (this.data.eventData) {
      const start = new Date(this.data.eventData.startDate);
      let end = new Date(this.data.eventData.endDate);

      if (this.data.eventData.allDayEvent) {
        end = new Date(end);
        end.setDate(end.getDate() - 1);
      }

      const startTime = start.toTimeString().slice(0, 5);
      const endTime = end.toTimeString().slice(0, 5);

      this.generalForm.patchValue({
        ...this.data.eventData,
        startDate: start,
        endDate: end,
        startTime,
        endTime,
        eventTypeId: this.data.eventData.eventTypeId,
        reminderMinutes: this.data.eventData.reminderMinutes || []
      });

      const isAllDay = this.generalForm.get('allDayEvent')?.value;

      if (isAllDay) {
        this.generalForm.get('startTime')?.disable({ emitEvent: false });
        this.generalForm.get('endTime')?.disable({ emitEvent: false });
      }

      this.eventTypeName = this.data.eventData.eventTypeName;
      this.eventColor = this.data.eventData.eventColor;

      this.eventId = this.data.eventData.id;
      this.baseEventId = this.data.eventData.baseEventId;

      // ── Capture original occurrence date ──────────────────────────────────
      // Store this now, before the user edits startDate, so we have a stable
      // key to identify the occurrence on the server side.
      const isOccurrence =
        this.data.eventData.isRecurring &&
        this.data.eventData.id !== this.data.eventData.baseEventId;

      if (isOccurrence) {
        this.originalOccurrenceDate = new Date(this.data.eventData.startDate);
      }

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

    if (this.data.eventData) {
      this.generalForm.patchValue({
        eventTypeId: this.data.eventData.eventTypeId
      });
    }

    // Initialize your form tracking tracking after data is patched
    this.originalFormValue = this.normalizeForm(this.generalForm.value);
    this.trackFormChanges();

    // Setup the Proactive Time-Shift Syncing
    this.setupDateTimeInterlocking();

    this.allLocations = ['Istanbul', 'Ankara', 'Berlin', 'London'];
    this.generalForm.get('location')?.valueChanges.subscribe(value => {
      this.filteredLocations = this.filterLocations(value || '');
    });
  }

  private dateTimeOrderValidator = (group: FormGroup) => {
    const allDay = group.get('allDayEvent')?.value;
    if (allDay) return null;

    const startDate = group.get('startDate')?.value;
    const endDate = group.get('endDate')?.value;
    const startTime = group.get('startTime')?.value;
    const endTime = group.get('endTime')?.value;

    const startCtrl = group.get('startTime');
    const endCtrl = group.get('endTime');

    if (!startDate || !endDate || !startTime || !endTime) return null;

    const start = this.combineDateAndTime(startDate, this.normalizeTime(startTime));
    const end = this.combineDateAndTime(endDate, this.normalizeTime(endTime));

    const isInvalid = end <= start;

    if (isInvalid) {
      endCtrl?.setErrors({ ...(endCtrl.errors || {}), dateTimeOrderInvalid: true });
      return { dateTimeOrderInvalid: true };
    }

    // IMPORTANT: clear only our custom error, not others
    if (endCtrl?.hasError('dateTimeOrderInvalid')) {
      const errors = { ...(endCtrl.errors || {}) };
      delete errors['dateTimeOrderInvalid'];

      const hasOtherErrors = Object.keys(errors).length > 0;
      endCtrl.setErrors(hasOtherErrors ? errors : null);
    }

    return null;
  };

  /**
 * Monitors start date/time changes and intelligently slides 
 * the end date/time forward to maintain duration and prevent validation errors.
 */
  private setupDateTimeInterlocking(): void {
    // Combine value changes of startDate and startTime to handle them atomically
    this.generalForm.get('startDate')?.valueChanges.subscribe(() => this.adjustEndTimeWindow());
    this.generalForm.get('startTime')?.valueChanges.subscribe(() => this.adjustEndTimeWindow());
  }

  private adjustEndTimeWindow(): void {
    const formValues = this.generalForm.getRawValue();

    if (!formValues.startDate || !formValues.startTime) return;

    // Convert current UI state into concrete Date objects
    const currentStart = this.combineDateAndTime(formValues.startDate, this.normalizeTime(formValues.startTime));
    let currentEnd: Date;

    if (formValues.endDate && formValues.endTime) {
      currentEnd = this.combineDateAndTime(formValues.endDate, this.normalizeTime(formValues.endTime));
    } else {
      // Fallback if end time wasn't set yet
      currentEnd = new Date(currentStart.getTime() + 60 * 60 * 1000);
    }

    // If the user picked a start time that is now ahead of or equal to the end time
    if (currentStart >= currentEnd) {
      // Default fallback: Move end time exactly 1 hour ahead of the new start time
      const registrationBufferMs = 60 * 60 * 1000;
      const targetEndDateTime = new Date(currentStart.getTime() + registrationBufferMs);

      // Format new targets back into UI control inputs
      const updatedEndDate = new Date(targetEndDateTime);
      updatedEndDate.setHours(0, 0, 0, 0); // Match MatDatepicker normalization

      const updatedEndTime = targetEndDateTime.toTimeString().slice(0, 5);

      // Emit values silently to avoid triggering cyclic valueChanges cascades loop
      this.generalForm.patchValue({
        endDate: updatedEndDate,
        endTime: updatedEndTime
      }, { emitEvent: false });
    }
  }

  private loadEventTypes(): void {
    this.calendarService.getEventTypes().subscribe((types) => {
      this.eventTypes = types;

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

    if (time.toLowerCase().includes('am') || time.toLowerCase().includes('pm')) {
      const date = new Date(`1970-01-01 ${time}`);
      return date.toTimeString().slice(0, 5);
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
    const result = new Date(date);

    if (!time || !time.includes(':')) {
      result.setHours(0, 0, 0, 0);
      return result;
    }

    const [hours, minutes] = time.split(':').map(Number);

    const safeHours = isNaN(hours) ? 0 : hours;
    const safeMinutes = isNaN(minutes) ? 0 : minutes;

    result.setHours(safeHours, safeMinutes, 0, 0);
    return result;
  }

  handleSave(): void {
    if (this.generalForm.invalid) {
      this.generalForm.markAllAsTouched();
      return;
    }

    // 1. Determine if this is an edit to a recurring series instance
    const isRecurringInstance =
      this.data.eventData?.isRecurring ||
      this.generalForm.value.isRecurring;

    // We check if it has an ID, meaning it's an existing event being updated, not a brand new event creation
    if (this.eventId && isRecurringInstance) {
      // Open the recurrence scope prompt dialog
      const dialogRef = this.dialog.open(RecurrenceScopeDialogComponent, {
        disableClose: true // Prevents accidental closing by clicking backdrop
      });

      dialogRef.afterClosed().subscribe((scope: RecurrenceUpdateScope | null) => {
        // If the user cancelled out of the recurrence dialog, abort saving completely
        if (!scope) {
          return;
        }

        // Proceed with the save payload, attaching the chosen scope choice
        this.executeSave(scope);
      });
    } else {
      // It's a regular single event or a brand new recurring series initialization
      this.executeSave();
    }
  }

  // 2. Move your existing save logic into a separate reusable helper function
  private executeSave(recurrenceScope: RecurrenceUpdateScope | null = null): void {
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
      startDate = new Date(startDate);
      endDate = new Date(endDate);
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(0, 0, 0, 0);
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

    // Emit the data, now safely including the user's chosen recurrence selection scope
    this.onSave.emit({
      record: {
        ...this.generalForm.value,
        startDate,
        endDate,
        id: this.eventId,
        baseEventId: this.baseEventId,
        seriesUid: this.data.eventData?.seriesUid ?? null,
        isRecurring: this.generalForm.value.isRecurring,
        recurrenceRuleJson: recurrenceRule
          ? JSON.stringify(recurrenceRule)
          : null,
        reminderMinutes: this.generalForm.value.reminderMinutes ?? [],
        originalOccurrenceDate: this.originalOccurrenceDate,
        recurrenceScope: recurrenceScope // This will pass 'this', 'thisAndFollowing', 'allPreserve', or 'allOverride'
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

    const freqMap: any = {
      DAILY: 'day',
      WEEKLY: 'week',
      MONTHLY: 'month',
      YEARLY: 'year'
    };

    text += `${interval} ${freqMap[frequency]}${interval > 1 ? 's' : ''}`;

    if (frequency === 'WEEKLY' && daysOfWeek?.length) {
      const selectedDays = daysOfWeek
        .sort()
        .map((d: number) => this.weekdays[d].slice(0, 3));

      text += ` on ${selectedDays.join(', ')}`;
    }

    if (endType === 'until' && recurrenceEndDate) {
      const date = new Date(recurrenceEndDate).toLocaleDateString();
      text += ` until ${date}`;
    }

    if (endType === 'count' && recurrenceCount) {
      text += ` for ${recurrenceCount} times`;
    }

    return text;
  }

  ngOnDestroy(): void {
    if (this.startChangesSubscription) {
      this.startChangesSubscription.unsubscribe();
    }
  }
}