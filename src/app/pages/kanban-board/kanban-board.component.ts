// components/kanban-board/kanban-board.component.ts
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { KanbanColumnComponent } from '../kanban-column/kanban-column.component';
import { Column } from '../../models/kanban.model';
import { DragDropModule } from '@angular/cdk/drag-drop'

@Component({
  selector: 'app-kanban-board',
  standalone: true,
  imports: [CommonModule, KanbanColumnComponent, DragDropModule],
  templateUrl: './kanban-board.component.html',
  styleUrls: ['./kanban-board.component.css']
})

export class KanbanBoardComponent {
  columns: Column[] = [
    {
      id: 1,
      title: 'To Do',
      tasks: [
        { id: 1, title: 'Task 1', description: 'Description 1', status: 'todo' },
        { id: 2, title: 'Task 2', description: 'Description 2', status: 'todo' },
      ]
    },
    {
      id: 2,
      title: 'Analysis',
      tasks: [
        { id: 3, title: 'Task 2', description: 'Description 2', status: 'analysis' },
      ]
    },
    {
      id: 3,
      title: 'In Progress',
      tasks: [
        { id: 3, title: 'Task 3', description: 'Description 3', status: 'inprogress' },
      ]
    },
    {
      id: 4,
      title: 'On-Hold',
      tasks: [
        { id: 3, title: 'Task 4', description: 'Description 4', status: 'onhold' },
      ]
    },
    {
      id: 5,
      title: 'Test',
      tasks: [
        { id: 3, title: 'Task 5', description: 'Description 5', status: 'test' },
      ]
    },
    {
      id: 6,
      title: 'Go-Live',
      tasks: [
        { id: 3, title: 'Task 6', description: 'Description 6', status: 'golive' },
      ]
    },
    {
      id: 7,
      title: 'Done',
      tasks: [
        { id: 4, title: 'Task 7', description: 'Description 7', status: 'done' },
      ]
    }
  ];
  
  get allColumnIds(): string[] {
    return this.columns.map(column => 'column-' + column.title);
  }  
}
