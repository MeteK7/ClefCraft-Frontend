/**
 * Represents one node inside the Relationship Graph.
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

    /**
     * Board Item Id
     */
    id: number;

    /**
     * Display title.
     */
    title: string;

    /**
     * Relationship type from parent.
     *
     * Undefined for the root node.
     */
    relationshipType?: number;

    /**
     * Current workflow status.
     */
    status: string;

    /**
     * Priority text.
     */
    priority: string;

    /**
     * Optional assignee.
     */
    assignee?: string;

    /**
     * Optional due date.
     */
    dueDate?: Date;

    /**
     * Graph hierarchy depth.
     *
     * Root = 0
     */
    level: number;

    /**
     * Parent node id.
     */
    parentId?: number;

    /**
     * Child node ids.
     */
    children: number[];

    /**
     * Incoming edge ids.
     */
    incoming: number[];

    /**
     * Outgoing edge ids.
     */
    outgoing: number[];

    /**
     * Layout position.
     */
    x: number;

    y: number;

    /**
     * Render size.
     */
    width: number;

    height: number;

    /**
     * Visibility.
     */
    visible: boolean;

    /**
     * Selection.
     */
    selected: boolean;

    /**
     * Hover state.
     */
    hovered: boolean;

    /**
     * Collapsed subtree.
     */
    collapsed: boolean;

    /**
     * Highlighted from analytics/navigation.
     */
    highlighted: boolean;

    /**
     * Is part of the current critical path.
     */
    critical: boolean;

    /**
     * Is currently blocked.
     */
    blocked: boolean;

    /**
     * Is inside a dependency cycle.
     */
    cyclic: boolean;

    /**
     * Total descendants.
     */
    descendants: number;

    /**
     * Total ancestors.
     */
    ancestors: number;

    /**
     * Number of connected edges.
     */
    degree: number;

    /**
     * Number of incoming edges.
     */
    inDegree: number;

    /**
     * Number of outgoing edges.
     */
    outDegree: number;

    /**
     * Calculated impact score.
     */
    impactScore: number;

    /**
     * Calculated relationship score.
     */
    relationshipScore: number;

    /**
     * Optional custom data.
     */
    metadata: Record<string, unknown>;
}

/**
 * Factory helper.
 *
 * Keeps creation consistent across the entire engine.
 */
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

            incoming: [],

            outgoing: [],

            x: 0,

            y: 0,

            width: 260,

            height: 84,

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