import { Injectable } from '@angular/core';

import { GraphViewModel } from '../visualization/graph-view-model';
import { GraphNode } from '../visualization/graph-node.model';
import { GraphEdge } from '../visualization/graph-edge.model';

import {
    RelationshipType
} from '../../models/board.model';

@Injectable({
    providedIn: 'root'
})
export class GraphLayoutEngine {

    readonly centerX = 0;
    readonly centerY = 0;

    readonly ringDistance = 220;

    layout(
        graph: GraphViewModel
    ): GraphViewModel {

        const center = graph.nodes.find(x => x.center);

        if (!center) {
            return graph;
        }

        center.x = this.centerX;
        center.y = this.centerY;

        const grouped =
            this.groupEdges(graph);

        this.layoutGroup(
            grouped.parents,
            graph.nodes,
            -90
        );

        this.layoutGroup(
            grouped.dependencies,
            graph.nodes,
            0
        );

        this.layoutGroup(
            grouped.children,
            graph.nodes,
            90
        );

        this.layoutGroup(
            grouped.blockers,
            graph.nodes,
            180
        );

        this.layoutOrbit(
            grouped.related,
            graph.nodes
        );

        return graph;

    }

    //------------------------------------------------------

    private groupEdges(
        graph: GraphViewModel
    ) {

        return {

            parents:
                graph.edges.filter(
                    x => x.relationType === RelationshipType.Parent
                ),

            children:
                graph.edges.filter(
                    x => x.relationType === RelationshipType.Child
                ),

            dependencies:
                graph.edges.filter(
                    x => x.relationType === RelationshipType.Dependency
                ),

            blockers:
                graph.edges.filter(
                    x =>
                        x.relationType === RelationshipType.BlockedBy ||
                        x.relationType === RelationshipType.Blocks
                ),

            related:
                graph.edges.filter(
                    x => x.relationType === RelationshipType.Related
                )

        };

    }

    //------------------------------------------------------

    private layoutGroup(

        edges: GraphEdge[],

        nodes: GraphNode[],

        direction: number

    ) {

        if (edges.length === 0) {
            return;
        }

        const spacing = 60;

        const start =
            -((edges.length - 1) * spacing) / 2;

        edges.forEach((edge, index) => {

            const node =
                nodes.find(
                    x => x.id === edge.targetId
                );

            if (!node) {
                return;
            }

            const offset =
                start + index * spacing;

            const radians =
                direction * Math.PI / 180;

            node.x =
                Math.cos(radians) *
                this.ringDistance;

            node.y =
                Math.sin(radians) *
                this.ringDistance;

            if (direction === -90 || direction === 90) {
                node.x += offset;
            }
            else {
                node.y += offset;
            }

        });

    }

    //------------------------------------------------------

    private layoutOrbit(

        edges: GraphEdge[],

        nodes: GraphNode[]

    ) {

        if (!edges.length) {
            return;
        }

        const angleStep =
            (Math.PI * 2) / edges.length;

        edges.forEach((edge, index) => {

            const node =
                nodes.find(
                    x => x.id === edge.targetId
                );

            if (!node) {
                return;
            }

            const angle =
                angleStep * index;

            node.x =
                Math.cos(angle) *
                (this.ringDistance + 120);

            node.y =
                Math.sin(angle) *
                (this.ringDistance + 120);

        });

    }

}