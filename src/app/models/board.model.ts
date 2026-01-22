// models/board.model.ts
export interface Board {
  id: number;
  title: string;
  boardColumns: Column[];
}

export interface Column {
  id: number;
  title: string;
  boardItems: Item[];
}

export interface Tag{
  id: number;
  name: string;
}

export interface Item {
    id: number;
    title: string;
    description: string;
    status: string;
    boardId: number;
    boardColumnId: number;
    createdBy?: string; 
    modifiedBy?: string; 
    createdByFullName:string;
    modifiedByFullName:string;
    dateCreated?: Date; 
    dateModified?: Date; 
    linkedItems?: Item[];
    tags?: Tag[]; 
    estimatedTime?: number; // Estimated time in hours
    timeSpent?: number;     // Time spent in hours
    assignee?: string;  
    priority?: string; 
    dueDate?: Date; 
  }
  
  