//add an @Input() to receive the list of all column IDs.
import { Component, Input } from '@angular/core';
import { Column, Item } from '../../models/board.model';
import { CommonModule } from '@angular/common';
import { CdkDragDrop, DragDropModule, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
//The BoardItemComponent is a child component of the BoardColumnComponent because items are part of a column in the Board board. Therefore, it makes sense to import BoardItemComponent inside BoardColumnComponent rather than directly in BoardComponent.
import { BoardItemComponent } from '../board-item/board-item.component';
import { BoardService } from '../../_services/board.service';

@Component({
  selector: 'app-board-column',
  standalone: true,
  imports: [CommonModule, DragDropModule, BoardItemComponent],
  templateUrl: './board-column.component.html',
  styleUrls: ['./board-column.component.css']
})
export class BoardColumnComponent {
  @Input() column!: Column;
  @Input() allColumnIds!: string[];

  constructor(private boardService: BoardService) {}
  
  get connectedTo(): string[] {
    return this.allColumnIds;
  }

  drop(event: CdkDragDrop<Item[]>) {
    console.log('Drop event:', event);
    console.log('Previous Container ID:', event.previousContainer.id);
    console.log('Current Container ID:', event.container.id);

    if (event.previousContainer === event.container) {
      // Moving item within the same column
      console.log('Moving item within the same column');
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
    } else {
      // Moving item to a different column
      console.log('Moving item to a different column');
      
      transferArrayItem(
        event.previousContainer.data,
        event.container.data,
        event.previousIndex,
        event.currentIndex
      );

            // Update item’s column on the server
            const item = event.container.data[event.currentIndex];
            const newColumnId = this.column.id;
            this.updateItemColumn(item.id, newColumnId);
    }
  }
  updateItemColumn(itemId: number, newColumnId: number) {
    const updatedItem = {
      id: itemId,
      boardColumnId: newColumnId
    };

    this.boardService.updateBoardItemColumn(updatedItem).subscribe(
      (response) => {
        console.log('Item updated successfully:', response);
      },
      (error) => {
        console.error('Error updating item:', error);
      }
    );
  }
}