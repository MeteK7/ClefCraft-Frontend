// models/board.model.ts
export interface Board {
  id: number;
  title: string;
  boardColumns: Column[];
}

export interface CreateBoardRequest {
  title: string;
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

  // ✅ persistence — sent on create/update only. API responses (BoardItemDto) don't include them;
  // read status?.id / priority?.id there.
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
  /** Board of the related item. */
  boardId: number;
  /** True when the item the hub was loaded for is the relation's source ("this item Blocks itemId"). */
  isOutgoing: boolean;
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
    expanded?: boolean;
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

/**
 * How a relation reads from one of its two items. A relation is stored once as
 * "source <type> target"; the source sees the outgoing wording ("Blocks"), the target
 * the inverse ("Blocked by").
 */
const RELATIONSHIP_LABELS: Record<RelationshipType, { outgoing: string; incoming: string }> = {
  [RelationshipType.Parent]: { outgoing: 'Parent of', incoming: 'Child of' },
  [RelationshipType.Blocks]: { outgoing: 'Blocks', incoming: 'Blocked by' },
  [RelationshipType.DependsOn]: { outgoing: 'Depends on', incoming: 'Required by' },
  [RelationshipType.Related]: { outgoing: 'Related to', incoming: 'Related to' },
  [RelationshipType.Duplicate]: { outgoing: 'Duplicate of', incoming: 'Duplicated by' },
  [RelationshipType.SplitFrom]: { outgoing: 'Split from', incoming: 'Split into' }
};

export function relationshipLabel(type: RelationshipType, isOutgoing: boolean): string {
  const labels = RELATIONSHIP_LABELS[type] ?? RELATIONSHIP_LABELS[RelationshipType.Related];
  return isOutgoing ? labels.outgoing : labels.incoming;
}

/** Options for adding a relation; the item it is added from becomes the source. */
export const RELATIONSHIP_TYPES: RelationshipTypeOption[] = [
  RelationshipType.Parent,
  RelationshipType.Blocks,
  RelationshipType.DependsOn,
  RelationshipType.Related,
  RelationshipType.Duplicate,
  RelationshipType.SplitFrom
].map(value => ({ value, name: relationshipLabel(value, true) }));