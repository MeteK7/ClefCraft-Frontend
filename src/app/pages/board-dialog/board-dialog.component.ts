import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { Board } from '../../models/board.model';

/**
 * Create-only today (data.board is always null) — the null-vs-existing data shape
 * matches the create/edit convention used by CalendarDialogComponent/ItemDetailDialogComponent
 * elsewhere in the app, so this dialog can grow an edit path later without rework.
 */
@Component({
  selector: 'app-board-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
  ],
  templateUrl: './board-dialog.component.html',
  styleUrls: ['./board-dialog.component.css'],
})
export class BoardDialogComponent {
  form: FormGroup;
  saving = false;

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<BoardDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { board: Board | null }
  ) {
    this.form = this.fb.group({
      title: [data?.board?.title ?? '', [Validators.required, Validators.maxLength(200)]],
    });
  }

  get isEdit(): boolean {
    return !!this.data?.board;
  }

  handleSave(): void {
    // Validators.required alone doesn't catch a whitespace-only title (it's a non-empty
    // string as far as the validator is concerned) — check the trimmed value directly.
    const title = ((this.form.value.title as string) ?? '').trim();

    if (this.form.invalid || !title) {
      this.form.markAllAsTouched();
      this.form.get('title')?.setErrors({ required: true });
      return;
    }

    this.saving = true;
    this.dialogRef.close({ title });
  }

  handleCancel(): void {
    this.dialogRef.close(null);
  }
}
