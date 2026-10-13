import { RelationshipType } from '../../models/board.model';
import { GraphEdge, GraphEdgeFactory } from '../visualization/graph-edge.model';
import { GraphNode, GraphNodeFactory } from '../visualization/graph-node.model';
import { GraphViewModel, GraphViewModelFactory } from '../visualization/graph-view-model';
import { ImpactEngine } from './impact-engine';

function node(id: number, extra: Partial<GraphNode> = {}): GraphNode {
    return { ...GraphNodeFactory.create(id, `Item ${id}`, 'To Do', 'High'), ...extra };
}

let nextEdgeId = 1;

/** A relation as it is stored: "source <type> target". */
function edge(sourceId: number, type: RelationshipType, targetId: number): GraphEdge {
    return GraphEdgeFactory.create(nextEdgeId++, sourceId, targetId, type, '');
}

function graph(nodes: GraphNode[], edges: GraphEdge[]): GraphViewModel {
    return GraphViewModelFactory.create(nodes[0].id, nodes, edges);
}

describe('ImpactEngine', () => {

    let engine: ImpactEngine;

    const waitingOn = (g: GraphViewModel, id: number) => engine.impactedIds(g, id).sort((a, b) => a - b);

    beforeEach(() => {
        engine = new ImpactEngine();
        nextEdgeId = 1;
    });

    it('A Blocks B: B waits on A', () => {
        const g = graph([node(1), node(2)], [edge(1, RelationshipType.Blocks, 2)]);

        expect(waitingOn(g, 1)).toEqual([2]);
        expect(waitingOn(g, 2)).toEqual([]);
    });

    it('A Depends on B: A waits on B, not the other way round', () => {
        const g = graph([node(1), node(2)], [edge(1, RelationshipType.DependsOn, 2)]);

        expect(waitingOn(g, 1)).toEqual([]);
        expect(waitingOn(g, 2)).toEqual([1]);
    });

    it('P Parent of C: the parent waits on its child', () => {
        const g = graph([node(1), node(2)], [edge(1, RelationshipType.Parent, 2)]);

        expect(waitingOn(g, 2)).toEqual([1]);
        expect(waitingOn(g, 1)).toEqual([]);
    });

    it('Related, Duplicate and Split from create no impact in either direction', () => {
        const g = graph([node(1), node(2), node(3), node(4)], [
            edge(1, RelationshipType.Related, 2),
            edge(1, RelationshipType.Duplicate, 3),
            edge(1, RelationshipType.SplitFrom, 4)
        ]);

        for (const id of [1, 2, 3, 4]) {
            expect(waitingOn(g, id)).withContext(`item ${id}`).toEqual([]);
        }
    });

    it('a Done item has no impact', () => {
        const g = graph([node(1, { status: 'Done' }), node(2)], [edge(1, RelationshipType.Blocks, 2)]);

        const impact = engine.analyze(g, 1);

        expect(impact.totalAffected).toBe(0);
        expect(impact.impactedNodes).toEqual([]);
    });

    it('a Done item downstream is neither counted nor walked through', () => {
        // 1 blocks 2 (Done) blocks 3; 1 also blocks 4
        const g = graph([node(1), node(2, { status: 'Done' }), node(3), node(4)], [
            edge(1, RelationshipType.Blocks, 2),
            edge(2, RelationshipType.Blocks, 3),
            edge(1, RelationshipType.Blocks, 4)
        ]);

        expect(waitingOn(g, 1)).toEqual([4]);
    });

    it('counts an item reachable along two paths once, estimate included', () => {
        // 1 -> 2 -> 4 and 1 -> 3 -> 4
        const g = graph([node(1), node(2, { estimatedHours: 1 }), node(3, { estimatedHours: 1 }), node(4, { estimatedHours: 2 })], [
            edge(1, RelationshipType.Blocks, 2),
            edge(1, RelationshipType.Blocks, 3),
            edge(2, RelationshipType.Blocks, 4),
            edge(3, RelationshipType.Blocks, 4)
        ]);

        const impact = engine.analyze(g, 1);

        expect(impact.totalAffected).toBe(3);
        expect(impact.estimatedHours).toBe(4);
        expect(impact.withoutEstimate).toBe(0);
    });

    it('sums only recorded estimates and counts the items without one', () => {
        const g = graph([node(1), node(2, { estimatedHours: 2.5 }), node(3), node(4, { estimatedHours: 0 })], [
            edge(1, RelationshipType.Blocks, 2),
            edge(1, RelationshipType.Blocks, 3),
            edge(1, RelationshipType.Blocks, 4)
        ]);

        const impact = engine.analyze(g, 1);

        expect(impact.estimatedHours).toBe(2.5);
        expect(impact.withoutEstimate).toBe(1);
    });

    it('reports every waiting item as without an estimate when none has one', () => {
        const g = graph([node(1), node(2), node(3)], [
            edge(1, RelationshipType.Blocks, 2),
            edge(1, RelationshipType.Blocks, 3)
        ]);

        const impact = engine.analyze(g, 1);

        expect(impact.estimatedHours).toBe(0);
        expect(impact.withoutEstimate).toBe(impact.totalAffected);
    });

    it('picks the earliest due date, reading ISO strings and ignoring missing and empty-date values', () => {
        const g = graph([
            node(1),
            node(2, { dueDate: new Date(2026, 9, 20) }),
            node(3, { dueDate: '2026-10-16T00:00:00' as unknown as Date }),
            node(4, { dueDate: '0001-01-01T00:00:00' as unknown as Date }),
            node(5)
        ], [
            edge(1, RelationshipType.Blocks, 2),
            edge(1, RelationshipType.Blocks, 3),
            edge(1, RelationshipType.Blocks, 4),
            edge(1, RelationshipType.Blocks, 5)
        ]);

        const impact = engine.analyze(g, 1);

        expect(impact.earliestDueDate).toEqual(new Date(2026, 9, 16));
        expect(impact.earliestDueItems.map(n => n.id)).toEqual([3]);
    });

    it('names every waiting item due on the earliest day, nearest first', () => {
        // 1 -> 2 -> 3 and 1 -> 4; 3 and 4 are due the same day, at different times.
        const g = graph([
            node(1),
            node(2),
            node(3, { dueDate: new Date(2026, 9, 16, 9) }),
            node(4, { dueDate: new Date(2026, 9, 16, 17) }),
            node(5, { dueDate: new Date(2026, 9, 17) })
        ], [
            edge(1, RelationshipType.Blocks, 2),
            edge(2, RelationshipType.Blocks, 3),
            edge(1, RelationshipType.Blocks, 4),
            edge(1, RelationshipType.Blocks, 5)
        ]);

        expect(engine.analyze(g, 1).earliestDueItems.map(n => n.id)).toEqual([4, 3]);
    });

    it('does not count the hovered item\'s own due date', () => {
        const g = graph([node(1, { dueDate: new Date(2026, 9, 1) }), node(2, { dueDate: new Date(2026, 9, 20) })], [
            edge(1, RelationshipType.Blocks, 2)
        ]);

        const impact = engine.analyze(g, 1);

        expect(impact.earliestDueDate).toEqual(new Date(2026, 9, 20));
        expect(impact.earliestDueItems.map(n => n.id)).toEqual([2]);
    });

    it('has no earliest due date when no waiting item has one', () => {
        const g = graph([node(1), node(2)], [edge(1, RelationshipType.Blocks, 2)]);

        const impact = engine.analyze(g, 1);

        expect(impact.earliestDueDate).toBeUndefined();
        expect(impact.earliestDueItems).toEqual([]);
    });

    it('measures depth as the shortest distance', () => {
        // 1 -> 2 -> 3, plus the shortcut 1 -> 3; 3 -> 4
        const g = graph([node(1), node(2), node(3), node(4)], [
            edge(1, RelationshipType.Blocks, 2),
            edge(2, RelationshipType.Blocks, 3),
            edge(1, RelationshipType.Blocks, 3),
            edge(3, RelationshipType.Blocks, 4)
        ]);

        const impact = engine.analyze(g, 1);
        const depthOf = (id: number) => impact.impactedNodes.find(x => x.node.id === id)!.depth;

        expect(depthOf(2)).toBe(1);
        expect(depthOf(3)).toBe(1);
        expect(depthOf(4)).toBe(2);
        expect(impact.maxDepth).toBe(2);
    });

    it('follows mixed relation types along one chain', () => {
        // 3 Depends on 2, 2 is blocked by 1, 4 is the parent of 3: 1 -> 2 -> 3 -> 4
        const g = graph([node(1), node(2), node(3), node(4)], [
            edge(1, RelationshipType.Blocks, 2),
            edge(3, RelationshipType.DependsOn, 2),
            edge(4, RelationshipType.Parent, 3)
        ]);

        expect(waitingOn(g, 1)).toEqual([2, 3, 4]);
        expect(engine.analyze(g, 1).maxDepth).toBe(3);
    });

    it('ignores an edge whose other end is not in the graph', () => {
        const g = graph([node(1), node(2)], [
            edge(1, RelationshipType.Blocks, 99),
            edge(1, RelationshipType.Blocks, 2)
        ]);

        expect(waitingOn(g, 1)).toEqual([2]);
    });
});
