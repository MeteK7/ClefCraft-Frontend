import { Component, EventEmitter, Input, Output, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { MatTooltipModule } from '@angular/material/tooltip';
import { BoardItemView } from '../../board-engine/models/board-item-view.model';

@Component({
    selector: 'app-board-item',
    imports: [CommonModule, DragDropModule, MatTooltipModule],
    templateUrl: './board-item.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrls: ['./board-item.component.css']
})
export class BoardItemComponent {
  @Input() item!: BoardItemView;
  @Output() itemClicked = new EventEmitter<BoardItemView>();

  /** How many of the item's asks are the viewer's move. */
  get yourMove(): number {
    return this.item.askAttention?.yourMove ?? 0;
  }

  /** The count as the signal shows it: two digits ("06"), and "99+" past 99 as the header tray does. */
  get countLabel(): string {
    return this.yourMove > 99 ? '99+' : String(this.yourMove).padStart(2, '0');
  }

  onClick(): void {
    this.itemClicked.emit(this.item);
  }
}
