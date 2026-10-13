import { Injectable } from '@angular/core';
import { GraphEdge } from '../visualization/graph-edge.model';
import { GraphNode } from '../visualization/graph-node.model';
import { GraphViewModel } from '../visualization/graph-view-model';
import { FinishBeforeStep, buildFinishBeforeIndex } from './finish-before';

export interface RelationshipCycle {

    /** One closed loop in finish-before order, starting and ending at the lowest id. */
    nodeIds: number[];

    nodeTitles: string[];

    size: number;
}

interface CycleAnalysis {
    cycles: RelationshipCycle[];
    cyclicNodeIds: Set<number>;
    cyclicEdgeIds: Set<number>;
}

/**
 * Finds dependency cycles: items that, through Blocks / Depends on / Parent links, would each
 * have to finish before themselves. Related, Duplicate and Split-from links never form one.
 * Completion status doesn't matter — a loop is wrong however far along its items are.
 */
@Injectable({
    providedIn: 'root'
})

export class CycleDetector {

    /** One representative loop per group of mutually dependent items. */
    detectCycles(graph: GraphViewModel): RelationshipCycle[] {
        return this.analyze(graph).cycles;
    }

    hasCycles(graph: GraphViewModel): boolean {
        return this.detectCycles(graph).length > 0;
    }

    findFirstCycle(graph: GraphViewModel): RelationshipCycle | null {
        const cycles = this.detectCycles(graph);
        return cycles.length ? cycles[0] : null;
    }

    findSelfReferences(graph: GraphViewModel): GraphNode[] {

        const ids = graph.edges
            .filter(edge => edge.sourceId === edge.targetId)
            .map(edge => edge.sourceId);

        return graph.nodes.filter(node => ids.includes(node.id));
    }

    getCycleNodes(graph: GraphViewModel): GraphNode[] {
        const { cyclicNodeIds } = this.analyze(graph);
        return graph.nodes.filter(node => cyclicNodeIds.has(node.id));
    }

    /** Marks every node and edge that lies on any dependency cycle, edges by id. */
    markCycles(graph: GraphViewModel): { nodes: GraphNode[]; edges: GraphEdge[] } {

        const { cyclicNodeIds, cyclicEdgeIds } = this.analyze(graph);

        const nodes = graph.nodes.map(node => ({
            ...node,
            cyclic: cyclicNodeIds.has(node.id),
            highlighted: cyclicNodeIds.has(node.id)
        }));

        const edges = graph.edges.map(edge => {
            const isCyclic = cyclicEdgeIds.has(edge.id);
            return { ...edge, cyclic: isCyclic, highlighted: isCyclic };
        });

        return { nodes, edges };
    }

    /**
     * An edge is on a cycle exactly when both of its finish-before ends are in the same strongly
     * connected component: a multi-item component, or a one-item component through a self-loop.
     */
    private analyze(graph: GraphViewModel): CycleAnalysis {

        const index = buildFinishBeforeIndex(graph);
        const componentOf = this.stronglyConnectedComponents(index);

        const cyclicNodeIds = new Set<number>();
        const cyclicEdgeIds = new Set<number>();
        const cyclicComponents = new Map<number, number[]>();

        for (const [nodeId, steps] of index) {
            for (const step of steps) {

                const component = componentOf.get(nodeId)!;
                if (componentOf.get(step.nextId) !== component) {
                    continue;
                }

                cyclicEdgeIds.add(step.edgeId);
                cyclicNodeIds.add(nodeId);
                cyclicNodeIds.add(step.nextId);

                if (!cyclicComponents.has(component)) {
                    cyclicComponents.set(component, []);
                }
            }
        }

        for (const nodeId of cyclicNodeIds) {
            cyclicComponents.get(componentOf.get(nodeId)!)!.push(nodeId);
        }

        const cycles = [...cyclicComponents.values()]
            .map(members => this.representativeCycle(graph, index, componentOf, Math.min(...members)))
            .sort((a, b) => a.nodeIds[0] - b.nodeIds[0]);

        return { cycles, cyclicNodeIds, cyclicEdgeIds };
    }

    /** Tarjan's algorithm: nodeId -> component number. */
    private stronglyConnectedComponents(index: Map<number, FinishBeforeStep[]>): Map<number, number> {

        const order = new Map<number, number>();
        const low = new Map<number, number>();
        const onStack = new Set<number>();
        const stack: number[] = [];
        const componentOf = new Map<number, number>();
        let counter = 0;
        let components = 0;

        const visit = (nodeId: number): void => {

            order.set(nodeId, counter);
            low.set(nodeId, counter);
            counter++;
            stack.push(nodeId);
            onStack.add(nodeId);

            for (const { nextId } of index.get(nodeId) ?? []) {
                if (!order.has(nextId)) {
                    visit(nextId);
                    low.set(nodeId, Math.min(low.get(nodeId)!, low.get(nextId)!));
                } else if (onStack.has(nextId)) {
                    low.set(nodeId, Math.min(low.get(nodeId)!, order.get(nextId)!));
                }
            }

            if (low.get(nodeId) === order.get(nodeId)) {
                let member: number;
                do {
                    member = stack.pop()!;
                    onStack.delete(member);
                    componentOf.set(member, components);
                } while (member !== nodeId);
                components++;
            }
        };

        for (const nodeId of index.keys()) {
            if (!order.has(nodeId)) {
                visit(nodeId);
            }
        }

        return componentOf;
    }

    /** The shortest loop from start back to itself inside start's component, for the banner. */
    private representativeCycle(
        graph: GraphViewModel,
        index: Map<number, FinishBeforeStep[]>,
        componentOf: Map<number, number>,
        start: number
    ): RelationshipCycle {

        const component = componentOf.get(start);
        const previous = new Map<number, number>();
        const queue = [start];
        let closingNode: number | null = null;

        while (queue.length && closingNode === null) {

            const current = queue.shift()!;

            for (const { nextId } of index.get(current) ?? []) {

                if (componentOf.get(nextId) !== component) {
                    continue;
                }

                if (nextId === start) {
                    closingNode = current;
                    break;
                }

                if (!previous.has(nextId)) {
                    previous.set(nextId, current);
                    queue.push(nextId);
                }
            }
        }

        // Walk back from the node that closes the loop; a component with a cycle always has one.
        const path = [start];
        for (let id = closingNode!; id !== start; id = previous.get(id)!) {
            path.splice(1, 0, id);
        }
        path.push(start);

        return {
            nodeIds: path,
            nodeTitles: path.map(id => this.getTitle(graph, id)),
            size: path.length
        };
    }

    private getTitle(graph: GraphViewModel, id: number): string {
        return graph.nodeMap.get(id)?.title ?? `#${id}`;
    }
}
