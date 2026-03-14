import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Item } from '../../models/board.model';
import { CommonModule } from '@angular/common';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { MatTooltipModule } from '@angular/material/tooltip';

@Component({
  selector: 'app-board-item',
  standalone: true,
  imports: [CommonModule, DragDropModule, MatTooltipModule],
  templateUrl: './board-item.component.html',
  styleUrls: ['./board-item.component.css']
})
export class BoardItemComponent {
  @Input() item!: Item;
  @Output() itemClicked = new EventEmitter<Item>();

  onClick(): void {
    this.itemClicked.emit(this.item);
  }

  // ✅ Build full name safely
  get fullName(): string {
    const first = this.item?.assigneeFirstName ?? '';
    const last = this.item?.assigneeLastName ?? '';
    return `${first} ${last}`.trim();
  }

  // ✅ Generate initials safely
  get initials(): string {
    const first = this.item?.assigneeFirstName?.charAt(0) ?? '';
    const last = this.item?.assigneeLastName?.charAt(0) ?? '';
    return (first + last).toUpperCase();
  }
}