import { Rect } from './edge-router';

/**
 * Where the node tooltip goes: beside the hovered card, in the nearby spot that covers the fewest
 * other cards, kept inside the visible graph area. Everything here is in graph-container pixels,
 * the space the tooltip is absolutely positioned in.
 */

export interface TooltipSize {
    width: number;
    height: number;
}

export interface TooltipPlacementInput {
    /** The hovered card. */
    anchor: Rect;
    /** The other cards. */
    obstacles: Rect[];
    size: TooltipSize;
    /** The visible graph area. */
    bounds: Rect;
    /** Space between the card and the tooltip. */
    gap?: number;
    /** Space kept from the bounds. */
    margin?: number;
}

export interface TooltipPosition {
    left: number;
    top: number;
}

const DEFAULT_GAP = 12;
const DEFAULT_MARGIN = 8;

/** Covering the hovered card itself costs this much more than covering another card. */
const ANCHOR_WEIGHT = 4;

/**
 * The spots tried, in order of preference: right, left, below, above the card, each centered on it
 * first, then aligned with its start and its end. Each is moved inside the bounds.
 */
export function tooltipCandidates(input: TooltipPlacementInput): TooltipPosition[] {

    const { anchor, size } = input;
    const gap = input.gap ?? DEFAULT_GAP;

    const centerTop = (anchor.top + anchor.bottom) / 2 - size.height / 2;
    const centerLeft = (anchor.left + anchor.right) / 2 - size.width / 2;
    const tops = [centerTop, anchor.top, anchor.bottom - size.height];
    const lefts = [centerLeft, anchor.left, anchor.right - size.width];

    const right = anchor.right + gap;
    const left = anchor.left - gap - size.width;
    const below = anchor.bottom + gap;
    const above = anchor.top - gap - size.height;

    return [
        ...tops.map(top => ({ left: right, top })),
        ...tops.map(top => ({ left, top })),
        ...lefts.map(l => ({ left: l, top: below })),
        ...lefts.map(l => ({ left: l, top: above }))
    ].map(position => clampToBounds(position, input));
}

/** How much a tooltip at this spot hides: the area it covers of other cards, and of the hovered card weighted up. */
export function placementScore(input: TooltipPlacementInput, position: TooltipPosition): number {

    const tooltip = rectAt(position, input.size);
    const covered = input.obstacles.reduce((sum, card) => sum + overlapArea(tooltip, card), 0);

    return covered + ANCHOR_WEIGHT * overlapArea(tooltip, input.anchor);
}

/** The lowest-scoring spot; ties go to the more preferred one, so free space always wins. */
export function placeTooltip(input: TooltipPlacementInput): TooltipPosition {

    let best: TooltipPosition | null = null;
    let bestScore = Infinity;

    for (const candidate of tooltipCandidates(input)) {
        const score = placementScore(input, candidate);
        if (score < bestScore) {
            best = candidate;
            bestScore = score;
        }
    }

    return best!;
}

// ---- Coordinate mapping ----------------------------------------------------------------------

/** The parts of the root <svg>'s getScreenCTM() used here; the graph never rotates or skews (b = c = 0). */
export interface ScreenMatrix {
    a: number;
    d: number;
    e: number;
    f: number;
}

/** The graph container as measured in the browser. */
export interface ContainerMetrics {
    /** getBoundingClientRect() left/top. */
    left: number;
    top: number;
    /** Border widths. */
    clientLeft: number;
    clientTop: number;
    scrollLeft: number;
    scrollTop: number;
    /** Visible padding-box size. */
    clientWidth: number;
    clientHeight: number;
}

/** viewBox -> container px: x = a·vx + ox, y = d·vy + oy, plus the visible graph area in container px. */
export interface ContainerFrame {
    a: number;
    d: number;
    ox: number;
    oy: number;
    bounds: Rect;
}

/**
 * Builds the viewBox -> container mapping from the root <svg>'s screen matrix (which includes the
 * viewBox letterboxing and where the svg sits) and the container's position, borders and scroll.
 * The bounds are the svg's area, as far as the container shows it.
 */
export function containerFrame(ctm: ScreenMatrix, container: ContainerMetrics, svgRect: Rect): ContainerFrame {

    const shiftX = -container.left - container.clientLeft + container.scrollLeft;
    const shiftY = -container.top - container.clientTop + container.scrollTop;

    return {
        a: ctm.a,
        d: ctm.d,
        ox: ctm.e + shiftX,
        oy: ctm.f + shiftY,
        bounds: {
            left: Math.max(svgRect.left + shiftX, container.scrollLeft),
            right: Math.min(svgRect.right + shiftX, container.scrollLeft + container.clientWidth),
            top: Math.max(svgRect.top + shiftY, container.scrollTop),
            bottom: Math.min(svgRect.bottom + shiftY, container.scrollTop + container.clientHeight)
        }
    };
}

/** A rect in graph units -> container px, through the pan/zoom viewport (viewBox = pan + zoom·graph). */
export function graphRectToContainer(
    frame: ContainerFrame,
    viewport: { zoom: number; panX: number; panY: number },
    rect: Rect
): Rect {
    const x = (gx: number) => frame.a * (viewport.panX + viewport.zoom * gx) + frame.ox;
    const y = (gy: number) => frame.d * (viewport.panY + viewport.zoom * gy) + frame.oy;

    return { left: x(rect.left), right: x(rect.right), top: y(rect.top), bottom: y(rect.bottom) };
}

// ---- Helpers ---------------------------------------------------------------------------------

function clampToBounds(position: TooltipPosition, input: TooltipPlacementInput): TooltipPosition {

    const margin = input.margin ?? DEFAULT_MARGIN;
    const { bounds, size } = input;

    // When the tooltip is larger than the bounds, the lower limit wins: it starts at the top-left margin.
    const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

    return {
        left: clamp(position.left, bounds.left + margin, bounds.right - margin - size.width),
        top: clamp(position.top, bounds.top + margin, bounds.bottom - margin - size.height)
    };
}

function rectAt(position: TooltipPosition, size: TooltipSize): Rect {
    return { left: position.left, top: position.top, right: position.left + size.width, bottom: position.top + size.height };
}

function overlapArea(a: Rect, b: Rect): number {
    const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return width > 0 && height > 0 ? width * height : 0;
}
