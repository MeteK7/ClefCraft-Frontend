import { RelationshipType } from '../../models/board.model';

export interface GraphNode {

    /** Board Item Id */
    id: number;

    title: string;

    /** Relationship type from the root node. Undefined for the root itself. */
    relationshipType?: RelationshipType;

    status: string;
    priority: string;
    assignee?: string;
    dueDate?: Date;

    /** Graph hierarchy depth relative to the root. Root = 0. */
    level: number;

    parentId?: number;
    children: number[];
    estimatedHours?: number;
    storyPoints?: number;
    isMilestone?: boolean;
    completed?: boolean;
    x: number;
    y: number;
    width: number;
    height: number;
    radius: number;
    color?: string;

    visible: boolean;
    selected: boolean;
    hovered: boolean;
    collapsed: boolean;
    highlighted: boolean;
    critical: boolean;
    blocked: boolean;
    cyclic: boolean;
    descendants: number;
    ancestors: number;
    degree: number;
    inDegree: number;
    outDegree: number;
    impactScore: number;
    relationshipScore: number;

    metadata: Record<string, unknown>;
}

/** Factory helper. Keeps node creation consistent across the entire engine. */
export class GraphNodeFactory {

    /** Single source of truth for default card size — CSS reads 100% of this via the foreignObject. */
    static readonly DEFAULT_WIDTH = 220;
    static readonly DEFAULT_HEIGHT = 108;

    static create(
        id: number,
        title: string,
        status: string,
        priority: string
    ): GraphNode {

        return {
            id,
            title,
            status,
            priority,

            relationshipType: undefined,
            assignee: undefined,
            dueDate: undefined,

            level: 0,
            parentId: undefined,
            children: [],

            estimatedHours: undefined,
            storyPoints: undefined,
            isMilestone: undefined,
            completed: undefined,

            x: 0,
            y: 0,
            width: GraphNodeFactory.DEFAULT_WIDTH,
            height: GraphNodeFactory.DEFAULT_HEIGHT,
            radius: 28,
            color: undefined,

            visible: true,
            selected: false,
            hovered: false,
            collapsed: false,
            highlighted: false,
            critical: false,
            blocked: false,
            cyclic: false,

            descendants: 0,
            ancestors: 0,
            degree: 0,
            inDegree: 0,
            outDegree: 0,
            impactScore: 0,
            relationshipScore: 0,

            metadata: {}
        };
    }
}