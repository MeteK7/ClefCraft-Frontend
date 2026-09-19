import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatRadioModule } from '@angular/material/radio';
import { MatIconModule } from '@angular/material/icon';
import { RecurrenceDeleteScope } from '../../models/recurrence-delete-scope.model';

@Component({
  selector: 'app-recurrence-delete-scope-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatRadioModule,
    MatIconModule,
  ],
  templateUrl: './recurrence-delete-scope-dialog.component.html',
  styleUrls: ['./recurrence-delete-scope-dialog.component.css'],
})
export class RecurrenceDeleteScopeDialogComponent {

  scope: RecurrenceDeleteScope = 'this';

  constructor(
    private dialogRef: MatDialogRef<RecurrenceDeleteScopeDialogComponent>
  ) {}

  confirm(): void {
    this.dialogRef.close(this.scope);
  }

  cancel(): void {
    this.dialogRef.close(null);
  }
}
