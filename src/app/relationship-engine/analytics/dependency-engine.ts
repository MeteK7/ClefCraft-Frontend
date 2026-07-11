import { GraphViewModel } from '../visualization/graph-view-model';
import { GraphNode } from '../visualization/graph-node.model';
import { GraphEdge } from '../visualization/graph-edge.model';

export interface DependencySummary {

    nodeId: number;

    prerequisites: GraphNode[];

    dependents: GraphNode[];

    transitivePrerequisites: GraphNode[];

    transitiveDependents: GraphNode[];

    canStart: boolean;

    dependencyDepth: number;

    impactSize: number;

}

export class DependencyEngine {

    /**
     * Returns complete dependency information for one node.
     */
    public analyze(
        graph: GraphViewModel,
        nodeId: number
    ): DependencySummary {

        const prerequisites =
            this.getImmediatePrerequisites(graph, nodeId);

        const dependents =
            this.getImmediateDependents(graph, nodeId);

        const allParents =
            this.getAllPrerequisites(graph, nodeId);

        const allChildren =
            this.getAllDependents(graph, nodeId);

        return {

            nodeId,

            prerequisites,

            dependents,

            transitivePrerequisites: allParents,

            transitiveDependents: allChildren,

            canStart: prerequisites.length === 0,

            dependencyDepth:
                this.calculateDepth(graph, nodeId),

            impactSize:
                allChildren.length

        };

    }

    /**
     * Immediate incoming dependencies.
     */
    public getImmediatePrerequisites(
        graph: GraphViewModel,
        nodeId: number
    ): GraphNode[] {

        const ids = graph.edges
            .filter(e => e.targetId === nodeId)
            .map(e => e.sourceId);

        return graph.nodes.filter(n =>
            ids.includes(n.id));

    }

    /**
     * Immediate outgoing dependencies.
     */
    public getImmediateDependents(
        graph: GraphViewModel,
        nodeId: number
    ): GraphNode[] {

        const ids = graph.edges
            .filter(e => e.sourceId === nodeId)
            .map(e => e.targetId);

        return graph.nodes.filter(n =>
            ids.includes(n.id));

    }

    /**
     * Every ancestor recursively.
     */
    public getAllPrerequisites(
        graph: GraphViewModel,
        nodeId: number
    ): GraphNode[] {

        const visited = new Set<number>();

        this.collectParents(
            graph,
            nodeId,
            visited
        );

        return graph.nodes.filter(n =>
            visited.has(n.id));

    }

    /**
     * Every descendant recursively.
     */
    public getAllDependents(
        graph: GraphViewModel,
        nodeId: number
    ): GraphNode[] {

        const visited = new Set<number>();

        this.collectChildren(
            graph,
            nodeId,
            visited
        );

        return graph.nodes.filter(n =>
            visited.has(n.id));

    }

    /**
     * Returns every root task.
     */
    public getRootTasks(
        graph: GraphViewModel
    ): GraphNode[] {

        return graph.nodes.filter(node =>
            this.getImmediatePrerequisites(
                graph,
                node.id
            ).length === 0);

    }

    /**
     * Returns every leaf task.
     */
    public getLeafTasks(
        graph: GraphViewModel
    ): GraphNode[] {

        return graph.nodes.filter(node =>
            this.getImmediateDependents(
                graph,
                node.id
            ).length === 0);

    }

    /**
     * Longest dependency chain ending at node.
     */
    public calculateDepth(
        graph: GraphViewModel,
        nodeId: number
    ): number {

        const parents =
            this.getImmediatePrerequisites(
                graph,
                nodeId
            );

        if (parents.length === 0) {

            return 0;

        }

        let maxDepth = 0;

        for (const parent of parents) {

            maxDepth = Math.max(

                maxDepth,

                this.calculateDepth(
                    graph,
                    parent.id
                )

            );

        }

        return maxDepth + 1;

    }

    /**
     * Returns nodes ordered by downstream impact.
     */
    public rankByImpact(
        graph: GraphViewModel
    ): GraphNode[] {

        return [...graph.nodes]
            .sort((a, b) =>

                this.getAllDependents(
                    graph,
                    b.id
                ).length -

                this.getAllDependents(
                    graph,
                    a.id
                ).length

            );

    }

    /**
     * Returns nodes ordered by dependency depth.
     */
    public rankByDepth(
        graph: GraphViewModel
    ): GraphNode[] {

        return [...graph.nodes]
            .sort((a, b) =>

                this.calculateDepth(
                    graph,
                    b.id
                ) -

                this.calculateDepth(
                    graph,
                    a.id
                )

            );

    }

    /**
     * True when nothing blocks this item.
     */
    public isReady(
        graph: GraphViewModel,
        nodeId: number
    ): boolean {

        return this.getImmediatePrerequisites(
            graph,
            nodeId
        ).length === 0;

    }

    /**
     * Counts direct + indirect dependents.
     */
    public calculateImpactSize(
        graph: GraphViewModel,
        nodeId: number
    ): number {

        return this.getAllDependents(
            graph,
            nodeId
        ).length;

    }

    /**
     * Returns nodes that nothing depends on.
     */
    public findIndependentTasks(
        graph: GraphViewModel
    ): GraphNode[] {

        return graph.nodes.filter(node =>

            this.getImmediateDependents(
                graph,
                node.id
            ).length === 0 &&

            this.getImmediatePrerequisites(
                graph,
                node.id
            ).length === 0

        );

    }

    /**
     * Returns edges connected to node.
     */
    public getDependencies(
        graph: GraphViewModel,
        nodeId: number
    ): GraphEdge[] {

        return graph.edges.filter(edge =>

            edge.sourceId === nodeId ||

            edge.targetId === nodeId

        );

    }

    private collectParents(
        graph: GraphViewModel,
        nodeId: number,
        visited: Set<number>
    ): void {

        const parents =
            this.getImmediatePrerequisites(
                graph,
                nodeId
            );

        for (const parent of parents) {

            if (!visited.has(parent.id)) {

                visited.add(parent.id);

                this.collectParents(
                    graph,
                    parent.id,
                    visited
                );

            }

        }

    }

    private collectChildren(
        graph: GraphViewModel,
        nodeId: number,
        visited: Set<number>
    ): void {

        const children =
            this.getImmediateDependents(
                graph,
                nodeId
            );

        for (const child of children) {

            if (!visited.has(child.id)) {

                visited.add(child.id);

                this.collectChildren(
                    graph,
                    child.id,
                    visited
                );

            }

        }

    }

}