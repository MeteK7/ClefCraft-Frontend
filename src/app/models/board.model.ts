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

  assigneeId?: string;
  assigneeFirstName?: string;
  assigneeLastName?: string;

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

export interface BoardItemSearchResult {
  id: number;
  title: string;
  status: string;
  priority: string;
}

export interface RelationshipCard {
  relationId: number;
  itemId: number;
  title: string;
  status: string;
  priority: string;
  assigneeId?: string;
  dueDate?: Date;
}

export interface RelationshipGroup {

    relationType:number;
    name:string;
    items:RelationshipCard[];
}

export interface RelationshipHub {

    groups:RelationshipGroup[];
    parentCount:number;
    blockCount:number;
    relatedCount:number;
    dependencyCount:number;
}

export interface CreateRelationshipRequest{

    sourceBoardItemId:number;
    targetBoardItemId:number;
    relationType:number;
}