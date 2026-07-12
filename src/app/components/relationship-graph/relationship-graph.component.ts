import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges
} from '@angular/core';

import { CommonModule } from '@angular/common';

import { RelationshipHub } from '../../models/board.model';

import { RelationshipGraphBuilder } from '../../relationship-engine/graph/relationship-graph-builder';
import { GraphLayoutEngine } from '../../relationship-engine/graph/graph-layout-engine';

import { GraphViewModel } from '../../relationship-engine/visualization/graph-view-model';
import { GraphNode } from '../../relationship-engine/visualization/graph-node.model';
import { GraphEdge } from '../../relationship-engine/visualization/graph-edge.model';

@Component({
    selector: 'app-relationship-graph',
    standalone: true,
    imports: [
        CommonModule
    ],
    templateUrl: './relationship-graph.component.html',
    styleUrls: ['./relationship-graph.component.css']
})
export class RelationshipGraphComponent implements OnChanges {

    @Input({ required: true })
    hub!: RelationshipHub;

    @Input({ required: true })
    rootItemId!: number;

    @Output()
    openItem = new EventEmitter<number>();

    graph!: GraphViewModel;

    readonly nodeWidth = 220;
    readonly nodeHeight = 70;

    constructor(
        private graphBuilder: RelationshipGraphBuilder,
        private layoutEngine: GraphLayoutEngine
    ) { }

    ngOnChanges(changes: SimpleChanges): void {

        if (!this.hub || !this.rootItemId) {
            return;
        }

        this.buildGraph();

    }

    private buildGraph(): void {

        this.graph = this.graphBuilder.build(
            this.rootItemId,
            this.hub
        );

        this.graph = this.layoutEngine.layout(this.graph);

    }

    nodeX(node: GraphNode): number {
        return node.x - this.nodeWidth / 2;
    }

    nodeY(node: GraphNode): number {
        return node.y - this.nodeHeight / 2;
    }

    edgeX1(edge: GraphEdge): number {
        return this.graph.nodeMap.get(edge.sourceId)?.x ?? 0;
    }

    edgeY1(edge: GraphEdge): number {
        return this.graph.nodeMap.get(edge.sourceId)?.y ?? 0;
    }

    edgeX2(edge: GraphEdge): number {
        return this.graph.nodeMap.get(edge.targetId)?.x ?? 0;
    }

    edgeY2(edge: GraphEdge): number {
        return this.graph.nodeMap.get(edge.targetId)?.y ?? 0;
    }

    clickNode(node: GraphNode): void {

        this.openItem.emit(node.id);

    }

    trackNode(_: number, node: GraphNode): number {
        return node.id;
    }

    trackEdge(_: number, edge: GraphEdge): number {
        return edge.id;
    }

}