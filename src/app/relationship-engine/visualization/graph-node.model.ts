import { RelationshipType } from '../../models/board.model';

/**
 * Represents one node inside the Relationship Graph.
 *
 * This is the ONE GraphNode contract for the whole engine. Every
 * analytics/graph/visualization file must import this exact type —
 * do not redeclare a lighter-weight shape elsewhere. That divergence
 * is what caused the previous version of this engine to not compile.
 *
 * This model is intentionally independent from any UI framework
 * so it can be consumed by:
 *
 * • SVG renderer
 * • Canvas renderer
 * • WebGL renderer
 * • Cytoscape
 * • D3
 * • Future AI engines
 * • Analytics engines
 *
 * without requiring modifications.
 */

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

    // ---- Domain fields consumed by analytics engines ----
    // These must stay in sync with whatever the backend RelationshipCard /
    // Item payload actually provides. Populate them when building nodes;
    // engines (Impact, CriticalPath, Score) read them directly.

    estimatedHours?: number;
    storyPoints?: number;
    isMilestone?: boolean;
    completed?: boolean;

    // ---- Render state ----
    // Framework-agnostic position/size/color state, shared by any renderer.

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

    // ---- Computed graph metrics ----
    // Populated by analytics engines (DependencyEngine, RelationshipScoreEngine,
    // etc). Treat these as a cache, not hand-authored input.

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
            width: 260,
            height: 84,
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