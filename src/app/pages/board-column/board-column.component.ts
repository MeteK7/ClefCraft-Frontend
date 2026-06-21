import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { BoardItemComponent } from '../board-item/board-item.component';
import { BoardEngineService } from '../../board-engine/services/board-engine.service';
import { BoardColumnView } from '../../board-engine/models/board-column-view.model';
import { BoardItemView } from '../../board-engine/models/board-item-view.model';
import { handleBoardDrop } from '../../board-engine/interactions/board-drop-engine';

@Component({
  selector: 'app-board-column',
  standalone: true,
  imports: [CommonModule, DragDropModule, BoardItemComponent],
  templateUrl: './board-column.component.html',
  styleUrls: ['./board-column.component.css'],
})
export class BoardColumnComponent {
  @Input() column!: BoardColumnView;
  @Input() allColumnIds!: string[];
  @Output() itemClicked = new EventEmitter<BoardItemView>();

  constructor(private boardEngine: BoardEngineService) { }

  get connectedTo(): string[] {
    return this.allColumnIds;
  }

  drop(event: CdkDragDrop<BoardItemView[]>) {
    const result = handleBoardDrop(event, this.column);

    if (!result.sameColumn) {
      this.updateItemColumn(result.item.id, result.newColumnId);
    }
  }

  updateItemColumn(itemId: number, newColumnId: number) {
    this.boardEngine
      .switchBoardItemColumn({ id: itemId, boardColumnId: newColumnId })
      .subscribe(
        response => {
          console.log('Item updated successfully:', response);
        },
        error => {
          console.error('Error updating item:', error);
        }
      );
  }

  onItemClick(item: BoardItemView): void {
    this.itemClicked.emit({
      ...item,
      boardColumnId: this.column.id,
      boardId: item.boardId,
    });
  }
}
