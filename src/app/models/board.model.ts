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

export interface Status {
  id: number;
  name: string;
}

export interface Priority {
  id: number;
  name: string;
}

export interface Tag {
  id: number;
  name: string;
}

export interface Item {
  id: number;
  title: string;
  description: string;

  // ✅ persistence
  statusId: number;
  priorityId: number;

  // ✅ display (optional)
  status?: Status;
  priority?: Priority;

  boardId: number;
  boardColumnId: number;

  linkedItems?: Item[];
  tags?: Tag[];
  assignee?: string;
  dueDate?: Date;
  estimatedTime?: number;
  timeSpent?: number;

  createdByFullName: string;
  modifiedByFullName: string;
  dateCreated?: Date;
  dateModified?: Date;
  createdBy?: string;
  modifiedBy?: string;
}