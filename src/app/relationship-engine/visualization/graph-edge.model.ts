/**
 * Represents a connection between two GraphNodes.
 *
 * The graph is directed:
 *
 *      source ---------> target
 *
 * This model is independent from Angular or any rendering engine.
 * It is intended to be consumed by:
 *
 * • Graph Builder
 * • Layout Engine
 * • Navigation Engine
 * • Dependency Engine
 * • Critical Path Engine
 * • Cycle Detector
 * • SVG Renderer
 * * Canvas/WebGL renderers
 */

export interface GraphEdge {

    /**
     * Unique edge identifier.
     */
    id: number;

    /**
     * Source node id.
     */
    source: number;

    /**
     * Target node id.
     */
    target: number;

    /**
     * Relationship type.
     *
     * Corresponds to your existing
     * RelationshipType enum.
     */
    relationshipType: number;

    /**
     * Human-readable relationship label.
     */
    label: string;

    /**
     * Rendering state.
     */
    visible: boolean;

    /**
     * Selected by the user.
     */
    selected: boolean;

    /**
     * Hovered by the pointer.
     */
    hovered: boolean;

    /**
     * Highlighted by analytics/navigation.
     */
    highlighted: boolean;

    /**
     * Edge participates in a dependency cycle.
     */
    cyclic: boolean;

    /**
     * Edge belongs to the current critical path.
     */
    critical: boolean;

    /**
     * Edge currently blocks downstream work.
     */
    blocking: boolean;

    /**
     * Edge weight.
     *
     * Used by future layout algorithms
     * and relationship scoring.
     */
    weight: number;

    /**
     * Rendering thickness.
     */
    thickness: number;

    /**
     * Curvature used by the renderer.
     *
     * Straight = 0
     */
    curvature: number;

    /**
     * Display color.
     *
     * Left undefined so the renderer
     * can apply theme colors.
     */
    color?: string;

    /**
     * Optional metadata.
     */
    metadata: Record<string, unknown>;
}

/**
 * Helper methods for GraphEdge.
 */
export class GraphEdgeFactory {

    /**
     * Creates a new edge with sensible defaults.
     */
    static create(
        id: number,
        source: number,
        target: number,
        relationshipType: number,
        label: string
    ): GraphEdge {

        return {

            id,

            source,

            target,

            relationshipType,

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

    /**
     * Determines whether the edge connects
     * the specified node.
     */
    static touchesNode(
        edge: GraphEdge,
        nodeId: number
    ): boolean {

        return edge.source === nodeId
            || edge.target === nodeId;

    }

    /**
     * Returns the opposite endpoint.
     */
    static opposite(
        edge: GraphEdge,
        nodeId: number
    ): number | null {

        if (edge.source === nodeId) {
            return edge.target;
        }

        if (edge.target === nodeId) {
            return edge.source;
        }

        return null;
    }

    /**
     * Returns true if the edge direction
     * matches source -> target.
     */
    static isForward(
        edge: GraphEdge,
        source: number,
        target: number
    ): boolean {

        return edge.source === source
            && edge.target === target;

    }

    /**
     * Returns true if two edges connect
     * the same endpoints regardless of direction.
     */
    static connectsSameNodes(
        a: GraphEdge,
        b: GraphEdge
    ): boolean {

        return (
            a.source === b.source &&
            a.target === b.target
        ) || (
            a.source === b.target &&
            a.target === b.source
        );

    }

    /**
     * Creates a shallow copy.
     */
    static clone(
        edge: GraphEdge
    ): GraphEdge {

        return {

            ...edge,

            metadata: {

                ...edge.metadata

            }

        };

    }
}