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

export interface Item {
    id: number;
    title: string;
    description: string;
    status: string;
    boardColumnId: number;
    createdBy?: string; 
    modifiedBy?: string; 
    createdByFullName:string;
    modifiedByFullName:string;
    dateCreated?: Date; 
    dateModified?: Date; 
    linkedItems?: Item[];
  }
  
  