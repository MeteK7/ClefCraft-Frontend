import { RelationshipType } from '../../models/board.model';
import { GraphEdge, GraphEdgeFactory } from '../visualization/graph-edge.model';
import { GraphNode, GraphNodeFactory } from '../visualization/graph-node.model';
import { GraphViewModel, GraphViewModelFactory } from '../visualization/graph-view-model';
import { CycleDetector } from './cycle-detector';

function node(id: number, status = 'To Do'): GraphNode {
    return GraphNodeFactory.create(id, `Item ${id}`, status, 'High');
}

/** A relation as it is stored: "source <type> target", with an explicit edge id. */
function edge(id: number, sourceId: number, type: RelationshipType, targetId: number): GraphEdge {
    return GraphEdgeFactory.create(id, sourceId, targetId, type, '');
}

function graph(nodes: GraphNode[], edges: GraphEdge[]): GraphViewModel {
    return GraphViewModelFactory.create(nodes[0].id, nodes, edges);
}

describe('CycleDetector', () => {

    let detector: CycleDetector;

    const cyclicEdgeIds = (g: GraphViewModel) =>
        detector.markCycles(g).edges.filter(e => e.cyclic).map(e => e.id).sort((a, b) => a - b);

    const cyclicNodeIds = (g: GraphViewModel) =>
        detector.markCycles(g).nodes.filter(n => n.cyclic).map(n => n.id).sort((a, b) => a - b);

    beforeEach(() => detector = new CycleDetector());

    it('does not report Related plus Blocks between the same items as a cycle', () => {
        const g = graph([node(1), node(2)], [
            edge(1, 1, RelationshipType.Related, 2),
            edge(2, 2, RelationshipType.Blocks, 1)
        ]);

        expect(detector.detectCycles(g)).toEqual([]);
        expect(cyclicEdgeIds(g)).toEqual([]);
    });

    it('never reports loops made only of Duplicate or Split from links', () => {
        const duplicates = graph([node(1), node(2)], [
            edge(1, 1, RelationshipType.Duplicate, 2),
            edge(2, 2, RelationshipType.Duplicate, 1)
        ]);
        const splits = graph([node(1), node(2), node(3)], [
            edge(1, 1, RelationshipType.SplitFrom, 2),
            edge(2, 2, RelationshipType.SplitFrom, 3),
            edge(3, 3, RelationshipType.SplitFrom, 1)
        ]);

        expect(detector.hasCycles(duplicates)).toBeFalse();
        expect(detector.hasCycles(splits)).toBeFalse();
    });

    it('finds a Blocks cycle and marks all of its edges', () => {
        const g = graph([node(1), node(2), node(3)], [
            edge(1, 1, RelationshipType.Blocks, 2),
            edge(2, 2, RelationshipType.Blocks, 3),
            edge(3, 3, RelationshipType.Blocks, 1)
        ]);

        const cycles = detector.detectCycles(g);

        expect(cycles.length).toBe(1);
        expect(cycles[0].nodeIds).toEqual([1, 2, 3, 1]);
        expect(cycles[0].nodeTitles).toEqual(['Item 1', 'Item 2', 'Item 3', 'Item 1']);
        expect(cyclicEdgeIds(g)).toEqual([1, 2, 3]);
    });

    it('treats "A Blocks B" plus "A Depends on B" as a cycle even though both are stored A -> B', () => {
        // Blocks: 1 before 2. Depends on: 2 before 1.
        const g = graph([node(1), node(2)], [
            edge(10, 1, RelationshipType.Blocks, 2),
            edge(11, 1, RelationshipType.DependsOn, 2)
        ]);

        expect(detector.detectCycles(g).map(c => c.nodeIds)).toEqual([[1, 2, 1]]);
        expect(cyclicEdgeIds(g)).toEqual([10, 11]);
    });

    it('treats a parent that blocks its own child as a cycle', () => {
        // 1 Parent of 2 (2 before 1); 1 Blocks 2 (1 before 2)
        const g = graph([node(1), node(2)], [
            edge(1, 1, RelationshipType.Parent, 2),
            edge(2, 1, RelationshipType.Blocks, 2)
        ]);

        expect(cyclicEdgeIds(g)).toEqual([1, 2]);
    });

    it('marks every parallel edge on a cycle', () => {
        // Edges 1 and 2 both say "1 before 2"; edge 3 says "2 before 1".
        const g = graph([node(1), node(2)], [
            edge(1, 1, RelationshipType.Blocks, 2),
            edge(2, 2, RelationshipType.DependsOn, 1),
            edge(3, 2, RelationshipType.Blocks, 1)
        ]);

        expect(cyclicEdgeIds(g)).toEqual([1, 2, 3]);
    });

    it('marks every edge when two loops share an item, and reports the group once', () => {
        // 1 <-> 2 and 1 <-> 3
        const g = graph([node(1), node(2), node(3)], [
            edge(1, 1, RelationshipType.Blocks, 2),
            edge(2, 2, RelationshipType.Blocks, 1),
            edge(3, 1, RelationshipType.Blocks, 3),
            edge(4, 3, RelationshipType.Blocks, 1)
        ]);

        expect(detector.detectCycles(g).length).toBe(1);
        expect(cyclicEdgeIds(g)).toEqual([1, 2, 3, 4]);
        expect(cyclicNodeIds(g)).toEqual([1, 2, 3]);
    });

    it('reports separate loops separately', () => {
        const g = graph([node(1), node(2), node(3), node(4)], [
            edge(1, 1, RelationshipType.Blocks, 2),
            edge(2, 2, RelationshipType.Blocks, 1),
            edge(3, 3, RelationshipType.Blocks, 4),
            edge(4, 4, RelationshipType.Blocks, 3)
        ]);

        expect(detector.detectCycles(g).map(c => c.nodeIds)).toEqual([[1, 2, 1], [3, 4, 3]]);
    });

    it('does not mark edges or items that only lead into or out of a cycle', () => {
        // 1 <-> 2 is the loop; 3 -> 1 and 2 -> 4 hang off it
        const g = graph([node(1), node(2), node(3), node(4)], [
            edge(1, 1, RelationshipType.Blocks, 2),
            edge(2, 2, RelationshipType.Blocks, 1),
            edge(3, 3, RelationshipType.Blocks, 1),
            edge(4, 2, RelationshipType.Blocks, 4)
        ]);

        expect(cyclicEdgeIds(g)).toEqual([1, 2]);
        expect(cyclicNodeIds(g)).toEqual([1, 2]);
    });

    it('reports a self-loop as a cycle', () => {
        const g = graph([node(1), node(2)], [
            edge(1, 1, RelationshipType.Blocks, 1),
            edge(2, 1, RelationshipType.Blocks, 2)
        ]);

        expect(detector.detectCycles(g).map(c => c.nodeIds)).toEqual([[1, 1]]);
        expect(cyclicEdgeIds(g)).toEqual([1]);
        expect(cyclicNodeIds(g)).toEqual([1]);
    });

    it('still reports a cycle whose items are Done', () => {
        const g = graph([node(1, 'Done'), node(2, 'Done')], [
            edge(1, 1, RelationshipType.Blocks, 2),
            edge(2, 2, RelationshipType.Blocks, 1)
        ]);

        expect(detector.hasCycles(g)).toBeTrue();
        expect(cyclicEdgeIds(g)).toEqual([1, 2]);
    });

    it('ignores edges whose other end is not in the graph', () => {
        const g = graph([node(1), node(2)], [
            edge(1, 1, RelationshipType.Blocks, 99),
            edge(2, 99, RelationshipType.Blocks, 1),
            edge(3, 1, RelationshipType.Blocks, 2)
        ]);

        expect(detector.detectCycles(g)).toEqual([]);
        expect(cyclicEdgeIds(g)).toEqual([]);
    });
});
