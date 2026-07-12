import { RelationshipType } from '../../models/board.model';

/**
 * Represents a directed connection between two GraphNodes:
 *
 *      sourceId ---------> targetId
 *
 * This is the ONE GraphEdge contract for the whole engine.
 * Field names (sourceId/targetId) intentionally match what
 * DependencyEngine, CriticalPathEngine, CycleDetector, and
 * GraphNavigationEngine already assume.
 */
export interface GraphEdge {

    id: number;

    sourceId: number;
    targetId: number;

    relationType: RelationshipType;

    /** Human-readable relationship label, e.g. "Blocks". */
    label: string;

    visible: boolean;
    selected: boolean;
    hovered: boolean;
    highlighted: boolean;

    /** Edge participates in a dependency cycle. Set by CycleDetector. */
    cyclic: boolean;

    /** Edge belongs to the current critical path. Set by CriticalPathEngine. */
    critical: boolean;

    /** Edge currently blocks downstream work. */
    blocking: boolean;

    /** Used by layout algorithms and relationship scoring. */
    weight: number;

    thickness: number;

    /** Straight = 0. */
    curvature: number;

    /** Left undefined so the renderer can apply theme colors. */
    color?: string;

    metadata: Record<string, unknown>;
}

export class GraphEdgeFactory {

    static create(
        id: number,
        sourceId: number,
        targetId: number,
        relationType: RelationshipType,
        label: string
    ): GraphEdge {

        return {
            id,
            sourceId,
            targetId,
            relationType,
            label,

            visible: true,
            selected: false,
            hovered: false,
            highlighted: false,

            cyclic: false,
            critical: false,
            blocking: false,

            weight: 1,
            thickness: 2,
            curvature: 0,
            color: undefined,

            metadata: {}
        };
    }

    static touchesNode(edge: GraphEdge, nodeId: number): boolean {
        return edge.sourceId === nodeId || edge.targetId === nodeId;
    }

    static opposite(edge: GraphEdge, nodeId: number): number | null {
        if (edge.sourceId === nodeId) return edge.targetId;
        if (edge.targetId === nodeId) return edge.sourceId;
        return null;
    }

    static isForward(edge: GraphEdge, sourceId: number, targetId: number): boolean {
        return edge.sourceId === sourceId && edge.targetId === targetId;
    }

    static connectsSameNodes(a: GraphEdge, b: GraphEdge): boolean {
        return (a.sourceId === b.sourceId && a.targetId === b.targetId) ||
               (a.sourceId === b.targetId && a.targetId === b.sourceId);
    }

    static clone(edge: GraphEdge): GraphEdge {
        return { ...edge, metadata: { ...edge.metadata } };
    }
}