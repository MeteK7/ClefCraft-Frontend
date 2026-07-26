import { Injectable } from '@angular/core';

import {
    RelationshipCard,
    RelationshipHub,
    RelationshipType
} from '../../models/board.model';

import { GraphEdge, GraphEdgeFactory } from '../visualization/graph-edge.model';
import { GraphNode, GraphNodeFactory } from '../visualization/graph-node.model';
import { GraphViewModel, GraphViewModelFactory, rebuildIndex } from '../visualization/graph-view-model';

@Injectable({
    providedIn: 'root'
})
export class RelationshipGraphBuilder {

    build(centerItemId: number, hub: RelationshipHub): GraphViewModel {

        const nodes: GraphNode[] = [this.createCenterNode(centerItemId)];
        const edges: GraphEdge[] = [];

        let nextEdgeId = 1;

        for (const group of hub.groups) {
            for (const relationship of group.items) {

                if (relationship.itemId === centerItemId) {
                    // Guard against a self-referencing relationship producing
                    // a silent self-loop edge.
                    continue;
                }

                if (!nodes.some(n => n.id === relationship.itemId)) {
                    nodes.push(this.createNode(relationship, group.relationType));
                }

                edges.push(
                    GraphEdgeFactory.create(
                        nextEdgeId++,
                        centerItemId,
                        relationship.itemId,
                        group.relationType,
                        this.labelFor(group.relationType)
                    )
                );
            }
        }

        return GraphViewModelFactory.create(centerItemId, nodes, edges);
    }

    expand(graph: GraphViewModel, itemId: number, hub: RelationshipHub): GraphViewModel {

        if (!graph.nodeMap.has(itemId)) {
            throw new Error(`Cannot expand from item ${itemId} — it is not yet in the graph.`);
        }

        let nextEdgeId = graph.edges.reduce((max, e) => Math.max(max, e.id), 0) + 1;

        for (const group of hub.groups) {
            for (const relationship of group.items) {

                if (relationship.itemId === itemId) {
                    continue;
                }

                if (!graph.nodeMap.has(relationship.itemId)) {
                    const node = this.createNode(relationship, group.relationType);
                    graph.nodes.push(node);
                    graph.nodeMap.set(node.id, node);
                }

                // in expand(), replace the alreadyLinked check:
                const alreadyLinked = graph.edges.some(e =>
                    (e.sourceId === itemId && e.targetId === relationship.itemId) ||
                    (e.sourceId === relationship.itemId && e.targetId === itemId)
                );

                if (!alreadyLinked) {
                    graph.edges.push(
                        GraphEdgeFactory.create(
                            nextEdgeId++,
                            itemId,
                            relationship.itemId,
                            group.relationType,
                            this.labelFor(group.relationType)
                        )
                    );
                }
            }
        }

        rebuildIndex(graph);

        return graph;
    }

    private createCenterNode(id: number): GraphNode {

        const node = GraphNodeFactory.create(id, 'Current Item', '', '');

        node.radius = 42;
        node.color = '#3f51b5';
        node.selected = true;

        return node;
    }

    private createNode(relationship: RelationshipCard, relationType: RelationshipType): GraphNode {

        const node = GraphNodeFactory.create(
            relationship.itemId,
            relationship.title,
            relationship.status,
            relationship.priority
        );

        node.relationshipType = relationType;
        node.assignee = relationship.assigneeId;
        node.dueDate = relationship.dueDate;
        node.radius = 28;
        node.color = this.getColor(relationType);

        return node;
    }

    private getColor(relationType: RelationshipType): string {

        switch (relationType) {
            case RelationshipType.Parent:
                return '#1976d2';
            case RelationshipType.Blocks:
                return '#e53935';
            case RelationshipType.DependsOn:
                return '#7b1fa2';
            case RelationshipType.Related:
                return '#43a047';
            case RelationshipType.Duplicate:
                return '#fb8c00';
            case RelationshipType.SplitFrom:
                return '#00897b';
            default:
                return '#757575';
        }
    }

    private labelFor(relationType: RelationshipType): string {

        switch (relationType) {
            case RelationshipType.Parent: return 'Parent';
            case RelationshipType.Blocks: return 'Blocks';
            case RelationshipType.DependsOn: return 'Depends On';
            case RelationshipType.Related: return 'Related';
            case RelationshipType.Duplicate: return 'Duplicate';
            case RelationshipType.SplitFrom: return 'Split From';
            default: return 'Related';
        }
    }
}