import { Component, Input } from '@angular/core';
import { Task } from '../../models/kanban.model';
import { CommonModule } from '@angular/common';
import { DragDropModule } from '@angular/cdk/drag-drop';

@Component({
  selector: 'app-kanban-task',
  standalone: true,
  imports: [CommonModule, DragDropModule],
  templateUrl: './kanban-task.component.html',
  styleUrls: ['./kanban-task.component.css']
})
export class KanbanTaskComponent {
  @Input() task!: Task;
}
