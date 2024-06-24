// models/kanban.model.ts
export interface Task {
    id: number;
    title: string;
    description: string;
    status: string; // Add the status property
  }
  
  export interface Column {
    id: number;
    title: string;
    tasks: Task[];
  }
  