import { Rect } from './edge-router';
import {
    TooltipPlacementInput,
    containerFrame,
    graphRectToContainer,
    placeTooltip,
    placementScore,
    tooltipCandidates
} from './tooltip-placement';

const rect = (left: number, top: number, width: number, height: number): Rect =>
    ({ left, top, right: left + width, bottom: top + height });

const overlapArea = (a: Rect, b: Rect) => {
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return w > 0 && h > 0 ? w * h : 0;
};

const size = { width: 200, height: 100 };
const bounds = rect(0, 0, 1000, 600);
const tooltipAt = (p: { left: number; top: number }) => rect(p.left, p.top, size.width, size.height);

describe('placeTooltip', () => {

    it('goes to the right of the card when everything is free', () => {
        const anchor = rect(300, 200, 220, 100);

        const placed = placeTooltip({ anchor, obstacles: [], size, bounds });

        expect(placed).toEqual({ left: anchor.right + 12, top: 200 });
    });

    it('goes below a card that has neighbours on both sides, covering nothing', () => {
        // A row of three cards with free space under it.
        const anchor = rect(400, 100, 220, 100);
        const obstacles = [rect(140, 100, 220, 100), rect(660, 100, 220, 100)];

        const placed = placeTooltip({ anchor, obstacles, size, bounds });
        const tooltip = tooltipAt(placed);

        expect(placed.top).toBe(anchor.bottom + 12);
        for (const card of [anchor, ...obstacles]) {
            expect(overlapArea(tooltip, card)).toBe(0);
        }
    });

    it('takes the least obstructed spot when every spot covers something', () => {
        // Cards all around the anchor, tightly packed: no candidate is free.
        const anchor = rect(400, 250, 220, 100);
        const obstacles = [
            rect(150, 250, 240, 100), rect(630, 250, 240, 100),   // left, right
            rect(300, 120, 420, 120), rect(300, 360, 420, 120),   // above, below
            rect(120, 120, 170, 360), rect(730, 120, 170, 360)    // far left, far right
        ];
        const input: TooltipPlacementInput = { anchor, obstacles, size, bounds };

        const placed = placeTooltip(input);
        const best = placementScore(input, placed);

        expect(best).toBeGreaterThan(0);
        for (const candidate of tooltipCandidates(input)) {
            expect(best).toBeLessThanOrEqual(placementScore(input, candidate));
        }
    });

    it('stays inside the bounds, minus the margin, next to every edge', () => {
        const corners = [rect(0, 0, 220, 100), rect(780, 0, 220, 100), rect(0, 500, 220, 100), rect(780, 500, 220, 100)];

        for (const anchor of corners) {
            const tooltip = tooltipAt(placeTooltip({ anchor, obstacles: [], size, bounds }));

            expect(tooltip.left).toBeGreaterThanOrEqual(8);
            expect(tooltip.top).toBeGreaterThanOrEqual(8);
            expect(tooltip.right).toBeLessThanOrEqual(992);
            expect(tooltip.bottom).toBeLessThanOrEqual(592);
        }
    });

    it('starts a tooltip larger than the bounds at the top-left margin', () => {
        const placed = placeTooltip({ anchor: rect(50, 50, 100, 50), obstacles: [], size: { width: 400, height: 300 }, bounds: rect(0, 0, 300, 200) });

        expect(placed).toEqual({ left: 8, top: 8 });
    });
});

describe('graph to container coordinates', () => {

    it('accounts for the svg letterbox, the container border and scroll', () => {
        // Container at (100, 50) on screen, 2px border, scrolled by (5, 7), 800x500 inside.
        // The svg starts 40px below the container's padding box (a toolbar above it), and its viewBox
        // is letterboxed: scale 0.5, content offset 150px right of the svg's left edge.
        const container = { left: 100, top: 50, clientLeft: 2, clientTop: 2, scrollLeft: 5, scrollTop: 7, clientWidth: 800, clientHeight: 500 };
        const svgRect = { left: 102, top: 92, right: 902, bottom: 552 };
        const ctm = { a: 0.5, d: 0.5, e: 102 + 150, f: 92 };

        const frame = containerFrame(ctm, container, svgRect);
        const onScreen = graphRectToContainer(frame, { zoom: 2, panX: 100, panY: 20 }, rect(10, 10, 100, 50));

        // viewBox x = 100 + 2·10 = 120 -> client 0.5·120 + 252 = 312 -> container 312 - 100 - 2 + 5 = 215
        // viewBox y = 20 + 2·10 = 40   -> client 0.5·40 + 92 = 112  -> container 112 - 50 - 2 + 7 = 67
        expect(onScreen).toEqual({ left: 215, top: 67, right: 315, bottom: 117 });

        // The svg area in container px (0 + 5 .. 800 + 5, 40 + 7 .. 500 + 7), within the visible padding box.
        expect(frame.bounds).toEqual({ left: 5, right: 805, top: 47, bottom: 507 });
    });
});
