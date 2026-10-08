import { RelationshipCard, RelationshipHub, RelationshipType } from '../../models/board.model';
import { GraphViewModel, rebuildIndex } from '../visualization/graph-view-model';
import { GraphLayoutEngine, NodeShifts } from './graph-layout-engine';
import { RelationshipGraphBuilder } from './relationship-graph-builder';

const SPACING = 280; // every card is 220 wide: max(260, 220 + 60)
const ROW = 200;

function card(itemId: number, isOutgoing = true): RelationshipCard {
    return { relationId: itemId, itemId, boardId: 1, isOutgoing, title: `Item ${itemId}`, status: 'To Do', priority: 'Medium' };
}

function hub(...groups: [RelationshipType, RelationshipCard[]][]): RelationshipHub {
    return {
        groups: groups.map(([relationType, items]) => ({ relationType, name: '', items })),
        parentCount: 0,
        blockCount: 0,
        relatedCount: 0,
        dependencyCount: 0
    };
}

const dependsOn = (...ids: number[]) => hub([RelationshipType.DependsOn, ids.map(id => card(id))]);

function positions(graph: GraphViewModel): Map<number, string> {
    return new Map([...graph.nodes].sort((a, b) => a.id - b.id).map(n => [n.id, `${n.x},${n.y}`]));
}

function expectNoOverlaps(graph: GraphViewModel): void {
    const rows = new Map<number, number[]>();
    graph.nodes.forEach(n => rows.set(n.y, [...(rows.get(n.y) ?? []), n.x]));
    for (const [y, xs] of rows) {
        xs.sort((a, b) => a - b);
        for (let i = 1; i < xs.length; i++) {
            expect(xs[i] - xs[i - 1]).withContext(`row y=${y}`).toBeGreaterThanOrEqual(SPACING);
        }
    }
}

describe('GraphLayoutEngine', () => {

    let builder: RelationshipGraphBuilder;
    let engine: GraphLayoutEngine;

    beforeEach(() => {
        builder = new RelationshipGraphBuilder();
        engine = new GraphLayoutEngine();
    });

    /** Root 1 with neighbours 2, 3, 4 at x -280, 0, 280 in row 1. */
    function rootGraph(rootHub = dependsOn(2, 3, 4)): GraphViewModel {
        const graph = builder.build(1, rootHub, '', '');
        engine.layout(graph);
        return graph;
    }

    function expand(graph: GraphViewModel, nodeId: number, nodeHub: RelationshipHub): NodeShifts {
        const before = new Set(graph.nodes.map(n => n.id));
        builder.expand(graph, nodeId, nodeHub);
        const added = new Set(graph.nodes.map(n => n.id).filter(id => !before.has(id)));
        return engine.placeExpansion(graph, nodeId, added);
    }

    /** What a collapse does to the layout: drop the nodes, then undo the pushes newest first. */
    function collapse(graph: GraphViewModel, removed: number[], newestFirst: NodeShifts[]): void {
        graph.nodes = graph.nodes.filter(n => !removed.includes(n.id));
        graph.edges = graph.edges.filter(e => !removed.includes(e.sourceId) && !removed.includes(e.targetId));
        rebuildIndex(graph);
        engine.undoExpansions(graph, newestFirst);
    }

    const at = (graph: GraphViewModel, id: number) => {
        const node = graph.nodeMap.get(id)!;
        return [node.x, node.y];
    };

    describe('full layout', () => {

        it('gives the same positions when run twice', () => {
            const graph = rootGraph();
            expand(graph, 2, dependsOn(5, 6));

            engine.layout(graph);
            const first = positions(graph);
            engine.layout(graph);

            expect(positions(graph)).toEqual(first);
        });

        it('does not depend on the order the relations were added in', () => {
            const a = rootGraph(dependsOn(2, 3, 4));
            expand(a, 2, dependsOn(5));
            expand(a, 3, dependsOn(5));
            engine.layout(a);

            const b = rootGraph(dependsOn(4, 3, 2));
            expand(b, 3, dependsOn(5));
            expand(b, 2, dependsOn(5));
            engine.layout(b);

            expect(positions(b)).toEqual(positions(a));
        });
    });

    describe('placeExpansion', () => {

        it('keeps the expanded node and every existing node where they were', () => {
            const graph = rootGraph();
            const before = positions(graph);

            const shifts = expand(graph, 3, dependsOn(10, 11));

            expect(shifts.size).toBe(0);
            before.forEach((pos, id) => expect(positions(graph).get(id)).withContext(`node ${id}`).toBe(pos));
        });

        it('puts the new nodes one row below, as a block centred under the expanded node', () => {
            const graph = rootGraph();

            expand(graph, 3, dependsOn(10, 11));

            expect(at(graph, 10)).toEqual([-SPACING / 2, 2 * ROW]);
            expect(at(graph, 11)).toEqual([SPACING / 2, 2 * ROW]);
        });

        it('orders the block by relation type, then id', () => {
            const graph = rootGraph();

            expand(graph, 3, hub(
                [RelationshipType.DependsOn, [card(11), card(10)]],
                [RelationshipType.Parent, [card(12)]]
            ));

            expect([12, 10, 11].map(id => at(graph, id)[0])).toEqual([-SPACING, 0, SPACING]);
        });

        it('pushes only the overlapping nodes in the target row, by the minimum distance', () => {
            const graph = rootGraph();
            expand(graph, 2, dependsOn(12, 13));      // 12 at -420, 13 at -140
            const before = positions(graph);

            const shifts = expand(graph, 3, dependsOn(10, 11));   // block at -140, 140

            expect(shifts).toEqual(new Map([
                [13, { from: -140, to: -420 }],
                [12, { from: -420, to: -700 }]
            ]));
            // Each pushed node ends exactly one spacing from its neighbour on the block's side.
            expect(at(graph, 10)[0] - at(graph, 13)[0]).toBe(SPACING);
            expect(at(graph, 13)[0] - at(graph, 12)[0]).toBe(SPACING);
            [1, 2, 3, 4].forEach(id => expect(positions(graph).get(id)).toBe(before.get(id)));
            expectNoOverlaps(graph);
        });

        it('does not push a node that has room', () => {
            const graph = rootGraph();
            expand(graph, 2, dependsOn(12));          // 12 at -280

            const shifts = expand(graph, 4, dependsOn(14));       // 14 at 280

            expect(shifts.size).toBe(0);
            expect(at(graph, 12)).toEqual([-SPACING, 2 * ROW]);
        });
    });

    describe('undoExpansions', () => {

        it('restores every position after a collapse, pushed nodes included', () => {
            const graph = rootGraph();
            expand(graph, 2, dependsOn(12, 13));
            const before = positions(graph);

            const shifts = expand(graph, 3, dependsOn(10, 11));
            collapse(graph, [10, 11], [shifts]);

            expect(positions(graph)).toEqual(before);
        });

        it('restores the original layout when nested expansions are collapsed in reverse order', () => {
            const graph = rootGraph();
            const original = positions(graph);

            const s3 = expand(graph, 3, dependsOn(10, 11));
            const s10 = expand(graph, 10, dependsOn(20, 21));
            const afterNested = positions(graph);
            const s2 = expand(graph, 2, dependsOn(12, 13));       // pushes 10 and 11 right
            expect(s2.size).toBeGreaterThan(0);

            collapse(graph, [12, 13], [s2]);
            expect(positions(graph)).toEqual(afterNested);

            collapse(graph, [10, 11, 20, 21], [s10, s3]);
            expect(positions(graph)).toEqual(original);
        });

        it('leaves no overlaps when an older expansion is collapsed first', () => {
            const graph = rootGraph();
            expand(graph, 2, dependsOn(12, 13));
            const s3 = expand(graph, 3, dependsOn(10, 11));
            expand(graph, 4, dependsOn(14));

            collapse(graph, [10, 11], [s3]);

            expectNoOverlaps(graph);
        });
    });
});
