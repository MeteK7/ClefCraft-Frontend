//add an @Input() to receive the list of all column IDs.
import { Component, Input } from '@angular/core';
import { Column, Task } from '../../models/kanban.model';
import { CommonModule } from '@angular/common';
import { CdkDragDrop, DragDropModule, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
//The KanbanTaskComponent is a child component of the KanbanColumnComponent because tasks are part of a column in the Kanban board. Therefore, it makes sense to import KanbanTaskComponent inside KanbanColumnComponent rather than directly in KanbanBoardComponent.
import { KanbanTaskComponent } from '../kanban-task/kanban-task.component';

@Component({
  selector: 'app-kanban-column',
  standalone: true,
  imports: [CommonModule, DragDropModule, KanbanTaskComponent],
  templateUrl: './kanban-column.component.html',
  styleUrls: ['./kanban-column.component.css']
})
export class KanbanColumnComponent {
  @Input() column!: Column;
  @Input() allColumnIds!: string[];

  get connectedTo(): string[] {
    return this.allColumnIds;
  }

  drop(event: CdkDragDrop<Task[]>) {
    console.log('Drop event:', event);
    console.log('Previous Container ID:', event.previousContainer.id);
    console.log('Current Container ID:', event.container.id);

    if (event.previousContainer === event.container) {
      // Moving task within the same column
      console.log('Moving task within the same column');
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
    } else {
      // Moving task to a different column
      console.log('Moving task to a different column');
      
      transferArrayItem(
        event.previousContainer.data,
        event.container.data,
        event.previousIndex,
        event.currentIndex
      );
    }
  }

  
}
