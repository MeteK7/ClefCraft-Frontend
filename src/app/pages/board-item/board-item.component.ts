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

  onClick(): void {
    this.itemClicked.emit(this.item);
  }
}
