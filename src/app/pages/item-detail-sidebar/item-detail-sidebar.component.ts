import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Item } from '../../models/board.model';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BoardService } from '../../_services/board.service';

@Component({
  selector: 'app-item-detail-sidebar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './item-detail-sidebar.component.html',
  styleUrl: './item-detail-sidebar.component.css'
})
export class ItemDetailSidebarComponent {
  @Input() item!: Item;
  @Output() itemUpdated = new EventEmitter<Item>();

  constructor(private boardService: BoardService) {}

  onSave(): void {
    this.boardService.updateBoardItem(this.item).subscribe((updatedItem) => {
      // Ensure boardColumnId is present in updatedItem
      updatedItem.boardColumnId = this.item.boardColumnId || updatedItem.boardColumnId;
      this.itemUpdated.emit(updatedItem);  // Emit the updated item back to the parent
    });
  }

  onDelete(): void {
    this.boardService.deleteBoardItem(this.item.id).subscribe();
  }
}