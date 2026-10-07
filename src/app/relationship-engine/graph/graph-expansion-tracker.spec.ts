import { RelationshipCard, RelationshipHub, RelationshipType } from '../../models/board.model';
import { GraphViewModel } from '../visualization/graph-view-model';
import { GraphExpansionTracker } from './graph-expansion-tracker';
import { GraphLayoutEngine } from './graph-layout-engine';
import { RelationshipGraphBuilder } from './relationship-graph-builder';

const SPACING = 280;
const ROW = 200;

function card(itemId: number, isOutgoing = true): RelationshipCard {
    return { relationId: itemId, itemId, boardId: 1, isOutgoing, title: `Item ${itemId}`, status: 'To Do', priority: 'Medium' };
}

function dependsOn(...items: (number | RelationshipCard)[]): RelationshipHub {
    return {
        groups: [{
            relationType: RelationshipType.DependsOn,
            name: '',
            items: items.map(i => typeof i === 'number' ? card(i) : i)
        }],
        parentCount: 0,
        blockCount: 0,
        relatedCount: 0,
        dependencyCount: 0
    };
}

function positions(graph: GraphViewModel): Map<number, string> {
    return new Map([...graph.nodes].sort((a, b) => a.id - b.id).map(n => [n.id, `${n.x},${n.y}`]));
}

function edgePairs(graph: GraphViewModel): string[] {
    return graph.edges.map(e => `${e.sourceId}->${e.targetId}`).sort();
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

describe('GraphExpansionTracker', () => {

    let builder: RelationshipGraphBuilder;
    let engine: GraphLayoutEngine;
    let tracker: GraphExpansionTracker;
    let graph: GraphViewModel;

    /** What the component does: build + full layout + reset. Root 1 -> 2, 3, 4 at x -280, 0, 280. */
    function start(rootHub = dependsOn(2, 3, 4)): void {
        graph = builder.build(1, rootHub, '', '');
        engine.layout(graph);
        tracker.reset(1, rootHub);
    }

    /** What onExpandClick does. */
    function expand(nodeId: number, nodeHub: RelationshipHub) {
        const before = new Set(graph.nodes.map(n => n.id));
        builder.expand(graph, nodeId, nodeHub);
        const added = new Set(graph.nodes.map(n => n.id).filter(id => !before.has(id)));
        return tracker.recordExpansion(graph, nodeId, nodeHub, added);
    }

    /** What expandFullyConnected does after expanding everything. */
    function fullLayout(): void {
        engine.layout(graph);
        tracker.invalidate();
    }

    beforeEach(() => {
        builder = new RelationshipGraphBuilder();
        engine = new GraphLayoutEngine();
        tracker = new GraphExpansionTracker(engine);
    });

    describe('edge ownership', () => {

        it('removes the edges an expansion drew between existing nodes when it is collapsed', () => {
            start(dependsOn(2, 3));
            const before = positions(graph);

            expand(2, dependsOn(card(1, false), 3, 10));      // draws 2->3 between existing nodes
            expect(edgePairs(graph)).toContain('2->3');

            tracker.collapse(graph, new Set([10]), [2]);

            expect(edgePairs(graph)).toEqual(['1->2', '1->3']);
            expect(positions(graph)).toEqual(before);
        });

        it('keeps an edge another expansion also discovered', () => {
            start(dependsOn(2, 3));

            expand(2, dependsOn(card(1, false), 3, 10));       // draws 2->3
            expand(3, dependsOn(card(1, false), card(2, false))); // rediscovers it; the builder skips it

            tracker.collapse(graph, new Set([10]), [2]);
            expect(edgePairs(graph)).toEqual(['1->2', '1->3', '2->3']);

            tracker.collapse(graph, new Set(), [3]);
            expect(edgePairs(graph)).toEqual(['1->2', '1->3']);
        });

        it('never removes an edge from the initial build', () => {
            start(dependsOn(2, 3));

            expand(2, dependsOn(card(1, false), 10));          // 1-2 is also claimed by the build
            tracker.collapse(graph, new Set([10]), [2]);

            expect(edgePairs(graph)).toEqual(['1->2', '1->3']);
        });
    });

    describe('after a full layout', () => {

        it('applies no stale shifts on collapse and leaves no overlaps', () => {
            start();
            expand(2, dependsOn(12, 13));
            expand(3, dependsOn(10, 11));              // pushes 12 and 13
            fullLayout();
            const laidOut = positions(graph);

            tracker.collapse(graph, new Set([10, 11]), [3]);

            laidOut.delete(10);
            laidOut.delete(11);
            expect(positions(graph)).toEqual(laidOut);
            expectNoOverlaps(graph);
            expect(tracker.isValid).toBeFalse();
        });

        it('still places new expansions incrementally, and collapses them without undoing anything', () => {
            start();
            expand(2, dependsOn(12, 13));
            expand(3, dependsOn(10, 11));
            fullLayout();
            const anchorBefore = positions(graph).get(4);

            expand(4, dependsOn(14, 15));
            const expanded = positions(graph);

            expect(positions(graph).get(4)).toBe(anchorBefore);
            const anchor = graph.nodeMap.get(4)!;
            expect(graph.nodeMap.get(14)!.y).toBe(anchor.y + ROW);
            expectNoOverlaps(graph);

            tracker.collapse(graph, new Set([14, 15]), [4]);

            expanded.delete(14);
            expanded.delete(15);
            expect(positions(graph)).toEqual(expanded);   // pushes made while invalid stay; nothing older is undone
            expectNoOverlaps(graph);
            expect(tracker.isValid).toBeFalse();
        });

        it('becomes valid again after reset', () => {
            start();
            fullLayout();
            start();
            expect(tracker.isValid).toBeTrue();
        });
    });

    it('keeps visible nodes in place across a chain of expansions, pushing only the minimum', () => {
        start();

        const steps: [number, RelationshipHub][] = [
            [3, dependsOn(10, 11)],
            [10, dependsOn(20, 21)],
            [2, dependsOn(12, 13)],
            [4, dependsOn(14)]
        ];

        for (const [anchorId, nodeHub] of steps) {
            const before = positions(graph);

            const shifts = expand(anchorId, nodeHub);

            expect(positions(graph).get(anchorId)).withContext(`anchor ${anchorId}`).toBe(before.get(anchorId));

            before.forEach((pos, id) => {
                const shift = shifts.get(id);
                if (!shift) {
                    expect(positions(graph).get(id)).withContext(`node ${id} after expanding ${anchorId}`).toBe(pos);
                    return;
                }
                // Minimal push: it now sits exactly one spacing from the node it was pushed by.
                const node = graph.nodeMap.get(id)!;
                const towardBlock = shift.to > shift.from ? -SPACING : SPACING;
                const neighbour = graph.nodes.find(n => n.y === node.y && n.x === node.x + towardBlock);
                expect(neighbour).withContext(`pushed node ${id} after expanding ${anchorId}`).toBeDefined();
            });

            expectNoOverlaps(graph);
        }
    });
});
