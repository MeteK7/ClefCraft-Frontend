import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-this-and-following-warning-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule
  ],
  templateUrl: './this-and-following-warning-dialog.component.html',
  styleUrls: ['./this-and-following-warning-dialog.component.css']
})
export class ThisAndFollowingWarningDialogComponent {

  constructor(
    private dialogRef: MatDialogRef<ThisAndFollowingWarningDialogComponent>
  ) { }

  continue(): void {
    this.dialogRef.close(true);
  }

  cancel(): void {
    this.dialogRef.close(false);
  }
}