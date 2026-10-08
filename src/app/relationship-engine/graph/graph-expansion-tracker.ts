import { RelationshipHub, RelationshipType } from '../../models/board.model';
import { GraphViewModel, rebuildIndex } from '../visualization/graph-view-model';
import { GraphLayoutEngine, NodeShifts } from './graph-layout-engine';

/** Who put an edge on the graph: the initial build, or the expansion of a node (by node id). */
type EdgeOwner = 'build' | number;

/**
 * Bookkeeping that lets a collapse undo exactly what its expansion did.
 *
 * - Edge ownership: an edge between two items can be discovered by the initial build and by any
 *   number of expansions; the builder only draws it once. An edge stays while anything still
 *   claims it, so collapsing one expansion never removes an edge another one also found.
 * - Shifts: the nodes each expansion pushed aside, undone newest first on collapse.
 *
 * A full re-layout moves every node, which makes both records meaningless: invalidate() drops them
 * until the next reset(). Expansions made meanwhile are still placed incrementally, and collapsing
 * them only removes their nodes and edges.
 *
 * One instance per graph view; not a singleton.
 */
export class GraphExpansionTracker {

    private valid = true;
    private seq = 0;
    private readonly owners = new Map<string, Set<EdgeOwner>>();
    private readonly shifts = new Map<number, { seq: number; shifts: NodeShifts }>();

    constructor(private readonly layoutEngine: GraphLayoutEngine) { }

    /** Same identity the builder uses to skip duplicates: the two items, either direction, and the type. */
    static edgeKey(a: number, b: number, type: RelationshipType): string {
        return `${Math.min(a, b)}-${Math.max(a, b)}-${type}`;
    }

    get isValid(): boolean {
        return this.valid;
    }

    /** Starts over for a freshly built graph, owned by the build. */
    reset(rootId: number, rootHub: RelationshipHub): void {
        this.valid = true;
        this.seq = 0;
        this.owners.clear();
        this.shifts.clear();
        this.claim('build', rootId, rootHub);
    }

    /** Call after any full layout(): the recorded shifts and ownership no longer describe the graph. */
    invalidate(): void {
        this.valid = false;
        this.owners.clear();
        this.shifts.clear();
    }

    /**
     * Places the nodes an expansion added (see GraphLayoutEngine.placeExpansion) and records what it
     * discovered and pushed. `graph` must already contain the expansion (builder.expand).
     */
    recordExpansion(graph: GraphViewModel, nodeId: number, hub: RelationshipHub, addedIds: ReadonlySet<number>): NodeShifts {

        const pushed = this.layoutEngine.placeExpansion(graph, nodeId, addedIds);

        if (this.valid) {
            this.claim(nodeId, nodeId, hub);
            this.shifts.set(nodeId, { seq: ++this.seq, shifts: pushed });
        }

        return pushed;
    }

    /**
     * Collapses expansions: removes `removedIds` and their edges, then (while the records are valid)
     * every edge no remaining owner claims, and undoes the collapsed expansions' pushes.
     *
     * @param collapsedExpansionIds the collapsed node and every expanded node among its descendants
     */
    collapse(graph: GraphViewModel, removedIds: ReadonlySet<number>, collapsedExpansionIds: readonly number[]): void {

        graph.nodes = graph.nodes.filter(n => !removedIds.has(n.id));
        graph.edges = graph.edges.filter(e => !removedIds.has(e.sourceId) && !removedIds.has(e.targetId));

        if (!this.valid) {
            rebuildIndex(graph);
            this.layoutEngine.resolveOverlaps(graph);
            return;
        }

        const collapsed = new Set<EdgeOwner>(collapsedExpansionIds);
        const unclaimed = new Set<string>();
        for (const [key, owners] of this.owners) {
            collapsed.forEach(owner => owners.delete(owner));
            if (!owners.size) {
                this.owners.delete(key);
                unclaimed.add(key);
            }
        }

        graph.edges = graph.edges.filter(e =>
            !unclaimed.has(GraphExpansionTracker.edgeKey(e.sourceId, e.targetId, e.relationType)));

        rebuildIndex(graph);

        const undo = collapsedExpansionIds
            .map(id => this.shifts.get(id))
            .filter((record): record is { seq: number; shifts: NodeShifts } => !!record)
            .sort((a, b) => b.seq - a.seq)
            .map(record => record.shifts);

        collapsedExpansionIds.forEach(id => this.shifts.delete(id));

        this.layoutEngine.undoExpansions(graph, undo);
    }

    private claim(owner: EdgeOwner, anchorId: number, hub: RelationshipHub): void {
        for (const group of hub.groups) {
            for (const relationship of group.items) {
                if (relationship.itemId === anchorId) continue;

                const key = GraphExpansionTracker.edgeKey(anchorId, relationship.itemId, group.relationType);
                if (!this.owners.has(key)) this.owners.set(key, new Set());
                this.owners.get(key)!.add(owner);
            }
        }
    }
}
