import {
    RelationshipCard,
    RelationshipHub,
    RelationshipType,
    relationshipLabel
} from '../../models/board.model';
import { RelationshipGraphBuilder } from './relationship-graph-builder';

function card(itemId: number, isOutgoing: boolean, boardId = 3): RelationshipCard {
    return { relationId: itemId * 10, itemId, boardId, isOutgoing, title: `Item ${itemId}`, status: 'To Do', priority: 'High' };
}

function hub(groups: { type: RelationshipType; items: RelationshipCard[] }[]): RelationshipHub {
    return {
        groups: groups.map(g => ({ relationType: g.type, name: '', items: g.items })),
        parentCount: 0,
        blockCount: 0,
        relatedCount: 0,
        dependencyCount: 0
    };
}

const edgeEnds = (graph: { edges: { sourceId: number; targetId: number }[] }) =>
    graph.edges.map(e => [e.sourceId, e.targetId]);

describe('RelationshipGraphBuilder', () => {

    let builder: RelationshipGraphBuilder;

    beforeEach(() => builder = new RelationshipGraphBuilder());

    it('draws outgoing relations from the center item and incoming ones into it', () => {
        // 1 Blocks 2 (outgoing), 3 Blocks 1 (incoming)
        const graph = builder.build(1, hub([{ type: RelationshipType.Blocks, items: [card(2, true), card(3, false)] }]), 'In Progress', 'High');

        expect(edgeEnds(graph)).toEqual([[1, 2], [3, 1]]);
        expect(graph.outgoing.get(1)).toEqual([2]);
        expect(graph.incoming.get(1)).toEqual([3]);
    });

    it('keeps the stored direction when expanding a node, without duplicating known edges', () => {
        // 1 DependsOn 2; expanding 2 lists 1 (incoming, already drawn) and 2 DependsOn 4
        const graph = builder.build(1, hub([{ type: RelationshipType.DependsOn, items: [card(2, true)] }]), '', '');

        builder.expand(graph, 2, hub([{ type: RelationshipType.DependsOn, items: [card(1, false), card(4, true)] }]));

        expect(edgeEnds(graph)).toEqual([[1, 2], [2, 4]]);
    });

    it('draws an edge to an expanded node when that node is the target', () => {
        // 1 Parent 2; expanding 2 shows 5 Blocks 2
        const graph = builder.build(1, hub([{ type: RelationshipType.Parent, items: [card(2, true)] }]), '', '');

        builder.expand(graph, 2, hub([
            { type: RelationshipType.Parent, items: [card(1, false)] },
            { type: RelationshipType.Blocks, items: [card(5, false)] }
        ]));

        expect(edgeEnds(graph)).toEqual([[1, 2], [5, 2]]);
    });

    it('keeps each item\'s board on its node', () => {
        const graph = builder.build(1, hub([{ type: RelationshipType.Related, items: [card(2, true, 9)] }]), '', '', 3);

        expect(graph.nodeMap.get(1)!.boardId).toBe(3);
        expect(graph.nodeMap.get(2)!.boardId).toBe(9);
    });
});

describe('relationshipLabel', () => {

    it('reads a relation from its source and from its target', () => {
        expect(relationshipLabel(RelationshipType.Blocks, true)).toBe('Blocks');
        expect(relationshipLabel(RelationshipType.Blocks, false)).toBe('Blocked by');
        expect(relationshipLabel(RelationshipType.Parent, true)).toBe('Parent of');
        expect(relationshipLabel(RelationshipType.Parent, false)).toBe('Child of');
        expect(relationshipLabel(RelationshipType.DependsOn, false)).toBe('Required by');
        expect(relationshipLabel(RelationshipType.SplitFrom, false)).toBe('Split into');
        expect(relationshipLabel(RelationshipType.Duplicate, false)).toBe('Duplicated by');
        expect(relationshipLabel(RelationshipType.Related, false)).toBe('Related to');
    });
});
