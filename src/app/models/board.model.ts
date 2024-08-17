// models/board.model.ts
export interface Item {
    id: number;
    title: string;
    description: string;
    status: string; // Add the status property
  }
  
  export interface Column {
    id: number;
    title: string;
    items: Item[];
  }
  