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
    relationType: RelationshipType;
    name: string;
    items: RelationshipCard[];
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
    relationType:RelationshipType;
}

export enum RelationshipType {
  Parent = 0,
  Blocks = 1,
  DependsOn = 2,
  Related = 3,
  Duplicate = 4,
  SplitFrom = 5
}

export interface RelationshipTypeOption {
  value: RelationshipType;
  name: string;
}

export const RELATIONSHIP_TYPES: RelationshipTypeOption[] = [
  {
    value: RelationshipType.Parent,
    name: 'Parent'
  },
  {
    value: RelationshipType.Blocks,
    name: 'Blocks'
  },
  {
    value: RelationshipType.DependsOn,
    name: 'Depends On'
  },
  {
    value: RelationshipType.Related,
    name: 'Related'
  },
  {
    value: RelationshipType.Duplicate,
    name: 'Duplicate'
  },
  {
    value: RelationshipType.SplitFrom,
    name: 'Split From'
  }
];