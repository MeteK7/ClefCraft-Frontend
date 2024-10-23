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

  constructor(private boardService: BoardService) {}

  onSave(): void {
    // Logic to save the item
    this.boardService.updateBoardItem(this.item).subscribe();
  }

  onDelete(): void {
    this.boardService.deleteBoardItem(this.item.id).subscribe();
  }
}