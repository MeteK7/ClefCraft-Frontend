import { RelationshipType } from '../../models/board.model';
import { GraphEdge } from '../visualization/graph-edge.model';
import { GraphViewModel } from '../visualization/graph-view-model';

/**
 * The scheduling reading of the stored relations. A relation is stored once as
 * "source <type> target"; this turns it into "before must finish before after",
 * which is the direction work waits in. Impact and cycle analysis both read the
 * graph through this, never through the stored (drawn) direction.
 */

export interface FinishBeforeStep {
    /** The item that waits on the indexed one. */
    nextId: number;
    /** The drawn edge this step comes from. */
    edgeId: number;
}

/**
 * [before, after] for a scheduling relation, null for one that orders nothing.
 * - "A Blocks B": A before B.
 * - "A Depends on B": B before A.
 * - "P Parent of C": C before P (a parent isn't finished until its children are).
 */
export function finishBeforeEnds(edge: GraphEdge): [before: number, after: number] | null {
    switch (edge.relationType) {
        case RelationshipType.Blocks:
            return [edge.sourceId, edge.targetId];
        case RelationshipType.DependsOn:
        case RelationshipType.Parent:
            return [edge.targetId, edge.sourceId];
        default:
            // Related, Duplicate and SplitFrom don't order work.
            return null;
    }
}

/**
 * nodeId -> the items waiting directly on it. Edges whose ends aren't in the graph are
 * skipped, as buildGraphIndex does. Self-loops are kept so cycle detection can report them.
 */
export function buildFinishBeforeIndex(graph: GraphViewModel): Map<number, FinishBeforeStep[]> {

    const index = new Map<number, FinishBeforeStep[]>();

    for (const node of graph.nodes) {
        index.set(node.id, []);
    }

    for (const edge of graph.edges) {

        const ends = finishBeforeEnds(edge);
        if (!ends) {
            continue;
        }

        const [before, after] = ends;
        if (!graph.nodeMap.has(before) || !graph.nodeMap.has(after)) {
            continue;
        }

        index.get(before)!.push({ nextId: after, edgeId: edge.id });
    }

    return index;
}

/** Matches the backend's completed status (UpdateBoardItemCommandHandler.CompletedStatusName). */
export const COMPLETED_STATUS_NAME = 'Done';

export function isCompletedStatus(status: string | null | undefined): boolean {
    return status === COMPLETED_STATUS_NAME;
}

/**
 * A due date as the API sends it (an ISO string, despite the Date typing) or as a Date.
 * Unset, unparseable and DateTime.MinValue ("0001-01-01", what the update endpoint
 * returns for an empty due date) all mean "no due date".
 */
export function toDueDate(value: Date | string | null | undefined): Date | undefined {

    if (value == null || value === '') {
        return undefined;
    }

    const date = value instanceof Date ? value : new Date(value);

    if (isNaN(date.getTime()) || date.getFullYear() <= 1) {
        return undefined;
    }

    return date;
}
