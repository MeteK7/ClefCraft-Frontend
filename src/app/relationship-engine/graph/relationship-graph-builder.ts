import { Injectable } from '@angular/core';

import {
    GraphNode
} from '../visualization/graph-node.model';

import {
    GraphEdge
} from '../visualization/graph-edge.model';

import {
    GraphViewModel
} from '../visualization/graph-view-model';

import {
    RelationshipCard,
    RelationshipHub,
    RelationshipGroup,
    RelationshipType
} from '../../models/board.model';

@Injectable({
    providedIn: 'root'
})
export class RelationshipGraphBuilder {

    build(
        centerItemId: number,
        hub: RelationshipHub
    ): GraphViewModel {

        const nodes = new Map<number, GraphNode>();

        const edges: GraphEdge[] = [];

        //--------------------------------------------------
        // Center node
        //--------------------------------------------------

        nodes.set(
            centerItemId,
            this.createCenterNode(centerItemId)
        );

        //--------------------------------------------------
        // Groups
        //--------------------------------------------------

        for (const group of hub.groups) {

            this.processGroup(
                group,
                centerItemId,
                nodes,
                edges
            );

        }

        //--------------------------------------------------
        // Final layout
        //--------------------------------------------------

        return {

            centerNodeId: centerItemId,

            nodes: Array.from(nodes.values()),

            edges

        };

    }

    //----------------------------------------------------------
    // Process every relationship category
    //----------------------------------------------------------

    private processGroup(

        group: RelationshipGroup,

        centerItemId: number,

        nodes: Map<number, GraphNode>,

        edges: GraphEdge[]

    ): void {

        for (const relationship of group.items) {

            this.addRelationship(

                relationship,

                group.relationType,

                centerItemId,

                nodes,

                edges

            );

        }

    }

    //----------------------------------------------------------
    // Relationship
    //----------------------------------------------------------

    private addRelationship(

        relationship: RelationshipCard,

        relationType: RelationshipType,

        centerItemId: number,

        nodes: Map<number, GraphNode>,

        edges: GraphEdge[]

    ): void {

        //---------------------------------------
        // Node
        //---------------------------------------

        if (!nodes.has(relationship.itemId)) {

            nodes.set(

                relationship.itemId,

                this.createNode(
                    relationship,
                    relationType
                )

            );

        }

        //---------------------------------------
        // Edge
        //---------------------------------------

        edges.push({

            sourceId: centerItemId,

            targetId: relationship.itemId,

            relationType,

            animated: false,

            highlighted: false

        });

    }

    //----------------------------------------------------------
    // Center
    //----------------------------------------------------------

    private createCenterNode(

        id: number

    ): GraphNode {

        return {

            id,

            title: 'Current Item',

            status: '',

            priority: '',

            x: 0,

            y: 0,

            radius: 42,

            color: '#3f51b5',

            selected: true,

            center: true

        };

    }

    //----------------------------------------------------------
    // Child node
    //----------------------------------------------------------

    private createNode(

        relationship: RelationshipCard,

        relationType: RelationshipType

    ): GraphNode {

        return {

            id: relationship.itemId,

            title: relationship.title,

            status: relationship.status,

            priority: relationship.priority,

            x: 0,

            y: 0,

            radius: 28,

            color: this.getColor(relationType),

            selected: false,

            center: false

        };

    }

    //----------------------------------------------------------
    // Colors
    //----------------------------------------------------------

    private getColor(

        relationType: RelationshipType

    ): string {

        switch (relationType) {

            case RelationshipType.Parent:

                return '#1976d2';

            case RelationshipType.Child:

                return '#42a5f5';

            case RelationshipType.Dependency:

                return '#7b1fa2';

            case RelationshipType.BlockedBy:

                return '#e53935';

            case RelationshipType.Blocks:

                return '#ef6c00';

            case RelationshipType.Related:

                return '#43a047';

            default:

                return '#757575';

        }

    }

}