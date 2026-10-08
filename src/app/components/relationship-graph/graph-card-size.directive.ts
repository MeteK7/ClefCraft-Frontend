import { Directive, ElementRef, EventEmitter, NgZone, OnDestroy, OnInit, Output } from '@angular/core';

import { cardHeightToGraphUnits } from '../../relationship-engine/visualization/edge-router';

/**
 * Reports a graph card's rendered height in graph units: once it is first laid out, whenever it
 * changes, and null when the card goes away. Uses the layout (border box) size, which ignores the
 * card's hover/selection transforms. ResizeObserver delivers before paint, so routes based on it are
 * in place for the first frame the card is drawn.
 */
@Directive({
    selector: '[appGraphCardSize]',
    standalone: true
})
export class GraphCardSizeDirective implements OnInit, OnDestroy {

    @Output() readonly cardSizeChange = new EventEmitter<number | null>();

    private observer?: ResizeObserver;
    private last?: number;

    constructor(
        private readonly element: ElementRef<HTMLElement>,
        private readonly zone: NgZone
    ) { }

    ngOnInit(): void {
        if (typeof ResizeObserver === 'undefined') return;

        this.observer = new ResizeObserver(entries => {
            const entry = entries[entries.length - 1];
            const box = entry.borderBoxSize?.[0];
            const height = cardHeightToGraphUnits(box ? box.blockSize : this.element.nativeElement.offsetHeight);

            if (!(height > 0)) return; // not laid out (e.g. hidden): not measured
            if (this.last !== undefined && Math.abs(height - this.last) <= 0.01) return;

            this.last = height;
            this.zone.run(() => this.cardSizeChange.emit(height));
        });
        this.observer.observe(this.element.nativeElement);
    }

    ngOnDestroy(): void {
        this.observer?.disconnect();
        this.cardSizeChange.emit(null);
    }
}
