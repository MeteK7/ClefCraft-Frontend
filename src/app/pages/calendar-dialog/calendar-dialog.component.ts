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

  constructor(private fb: FormBuilder, @Inject(MAT_DIALOG_DATA) public data: any) {
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
      this.generalForm.patchValue(this.data.eventData); // Populate form with event data
    }
  }

  handleSave(): void {
    const record = this.generalForm.value;
    this.onSave.emit(record);
  }

  handleCancel(): void {
    this.onCancel.emit();
  }
}