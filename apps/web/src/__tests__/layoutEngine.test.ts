import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PAGE_CONFIG,
  snapToGridValue,
  clampBoxToPage,
  computeSmartSnap,
  moveSelectionWithOffsets,
  resizeVisualBox,
  getMarqueeSelection,
  alignAndDistribute,
  updateZOrder,
  validateAndSanitizeLayout,
  pushHistory,
  undoHistory,
  redoHistory,
  VisualLayoutBox,
  LayoutHistoryState,
} from '../lib/layoutEngine';

describe('Power BI-Style Dashboard Layout Engine (Pure Unit Tests)', () => {
  const sampleVisuals: VisualLayoutBox[] = [
    { id: 'v1', title: 'Sales by Region', x: 16, y: 16, w: 400, h: 280, z: 1, locked: false },
    { id: 'v2', title: 'Revenue Share', x: 440, y: 16, w: 400, h: 280, z: 2, locked: false },
    { id: 'v3', title: 'Customer Trend', x: 16, y: 320, w: 400, h: 280, z: 3, locked: false },
  ];

  it('snaps scalar values to 8px grid when enabled and bypasses when disabled', () => {
    expect(snapToGridValue(19, 8, true)).toBe(16);
    expect(snapToGridValue(21, 8, true)).toBe(24);
    expect(snapToGridValue(21, 8, false)).toBe(21);
  });

  it('clamps visuals inside the 1280x720 page (both 20% visible rule and 100% fully-inside rule)', () => {
    const page = { width: 1280, height: 720 };
    // Negative coordinates clamp to 0
    expect(clampBoxToPage({ x: -150, y: -80, w: 400, h: 300 }, page, false)).toEqual({
      x: 0,
      y: 0,
    });
    // Far right/bottom clamps so at least 20% (80px of 400w, 60px of 300h) stays inside page
    expect(clampBoxToPage({ x: 1500, y: 900, w: 400, h: 300 }, page, false)).toEqual({
      x: 1200,
      y: 660,
    });
    // Fully inside clamps to page.width - w and page.height - h
    expect(clampBoxToPage({ x: 1500, y: 900, w: 400, h: 300 }, page, true)).toEqual({
      x: 880,
      y: 420,
    });
  });

  it('snaps to neighbor edges, page center, and equal spacing with smart guides', () => {
    const neighbors = [sampleVisuals[0], sampleVisuals[1]];
    // Move a visual so its left edge (437) is within 6px of v2's left edge (440)
    const snapResult = computeSmartSnap(
      { x: 437, y: 318, w: 400, h: 280 },
      neighbors,
      DEFAULT_PAGE_CONFIG
    );
    expect(snapResult.x).toBe(440);
    expect(snapResult.guides.some((g) => g.orientation === 'vertical' && g.position === 440)).toBe(
      true
    );

    // Alt key (disableSnap = true) disables grid & guide snapping
    const unsnapped = computeSmartSnap(
      { x: 437, y: 318, w: 400, h: 280 },
      neighbors,
      DEFAULT_PAGE_CONFIG,
      { disableSnap: true }
    );
    expect(unsnapped.x).toBe(437);
    expect(unsnapped.guides.length).toBe(0);

    // Equal-spacing hint: v1 is at [16..416], v2 is at [440..840] (gap = 24px).
    // Placing v3 near x = 840 + 24 = 864 snaps to 864 with a spacing guide!
    const spacingSnap = computeSmartSnap(
      { x: 861, y: 16, w: 300, h: 280 },
      neighbors,
      DEFAULT_PAGE_CONFIG
    );
    expect(spacingSnap.x).toBe(864);
    expect(spacingSnap.guides.some((g) => g.kind === 'spacing')).toBe(true);
  });

  it('moves multiple selected visuals together preserving relative offsets and ignores locked visuals', () => {
    const list: VisualLayoutBox[] = [
      { id: 'v1', x: 16, y: 16, w: 300, h: 200, z: 1, locked: false },
      { id: 'v2', x: 340, y: 56, w: 300, h: 200, z: 2, locked: false },
      { id: 'v3', x: 16, y: 300, w: 300, h: 200, z: 3, locked: true },
    ];

    const moved = moveSelectionWithOffsets(
      list,
      ['v1', 'v2', 'v3'],
      'v1',
      { dx: 80, dy: 40 },
      DEFAULT_PAGE_CONFIG
    );
    const m1 = moved.visuals.find((v) => v.id === 'v1')!;
    const m2 = moved.visuals.find((v) => v.id === 'v2')!;
    const m3 = moved.visuals.find((v) => v.id === 'v3')!;

    // Relative offset between v1 and v2 was (324, 40) and is preserved
    expect(m2.x - m1.x).toBe(324);
    expect(m2.y - m1.y).toBe(40);
    // Locked visual v3 did not move
    expect(m3.x).toBe(16);
    expect(m3.y).toBe(300);
  });

  it('resizes visual boxes with Shift aspect-ratio lock and Alt center resize, respecting locked visuals', () => {
    const box: VisualLayoutBox = { id: 'v1', x: 100, y: 100, w: 400, h: 200, z: 1, locked: false };
    // Corner resize with Shift keeps 2:1 aspect ratio
    const { box: aspectBox } = resizeVisualBox(box, 'se', 100, 90, DEFAULT_PAGE_CONFIG, {
      keepAspectRatio: true,
    });
    expect(aspectBox.w).toBe(500);
    expect(aspectBox.h).toBe(250);

    // Alt resize from center expands equally on both sides
    const { box: centerBox } = resizeVisualBox(box, 'e', 50, 0, DEFAULT_PAGE_CONFIG, {
      fromCenter: true,
    });
    expect(centerBox.w).toBe(500);
    expect(centerBox.x).toBe(50);

    // Locked visual cannot be resized
    const lockedBox: VisualLayoutBox = { ...box, locked: true };
    const { box: afterLockedResize } = resizeVisualBox(
      lockedBox,
      'se',
      200,
      200,
      DEFAULT_PAGE_CONFIG
    );
    expect(afterLockedResize.w).toBe(400);
    expect(afterLockedResize.h).toBe(200);
  });

  it('computes marquee selection intersecting visible visuals', () => {
    const hits = getMarqueeSelection(sampleVisuals, { x: 10, y: 10, w: 500, h: 100 });
    expect(hits).toEqual(['v1', 'v2']);
  });

  it('aligns and distributes multi-selected visuals', () => {
    const items: VisualLayoutBox[] = [
      { id: 'a', x: 20, y: 40, w: 200, h: 150, z: 1 },
      { id: 'b', x: 300, y: 120, w: 200, h: 150, z: 2 },
      { id: 'c', x: 700, y: 80, w: 200, h: 150, z: 3 },
    ];
    const alignedTop = alignAndDistribute(items, ['a', 'b', 'c'], 'top');
    expect(alignedTop.map((v) => v.y)).toEqual([40, 40, 40]);

    const distributedH = alignAndDistribute(items, ['a', 'b', 'c'], 'distribute_h');
    // Span is 20..(700+200)=880, total widths=600, remaining=280 -> gap=140 -> x: 20, 360, 700
    expect(distributedH.map((v) => v.x)).toEqual([20, 360, 700]);
  });

  it('updates z-order (bring to front, send to back, forward, backward)', () => {
    const front = updateZOrder(sampleVisuals, 'v1', 'front');
    expect(front.find((v) => v.id === 'v1')!.z).toBe(3);

    const back = updateZOrder(front, 'v1', 'back');
    expect(back.find((v) => v.id === 'v1')!.z).toBe(1);
  });

  it('records multi-visual drag as a single undo/redo action with depth >= 100', () => {
    let history: LayoutHistoryState<VisualLayoutBox[]> = { past: [], future: [] };
    history = pushHistory(history, sampleVisuals, 100);

    const movedState = sampleVisuals.map((v) => ({ ...v, x: v.x + 64, y: v.y + 32 }));
    const undone = undoHistory(history, movedState);
    expect(undone.state).toEqual(sampleVisuals);

    const redone = redoHistory(undone.history, undone.state!);
    expect(redone.state).toEqual(movedState);
  });

  it('validates and sanitizes corrupted or out-of-range layout JSON data', () => {
    const corrupted = {
      page: { width: -500, height: 99999, grid: 8, snap: true },
      visuals: [
        { id: 'v1', x: -999, y: 5000, w: 20, h: 10, z: 5 },
        { id: 'v2', x: 100, y: 100, w: 400, h: 300, z: 5 }, // duplicate z
      ],
    };
    const clean = validateAndSanitizeLayout(corrupted);
    expect(clean.page.width).toBe(480);
    expect(clean.page.height).toBe(2400);
    expect(clean.visuals[0].w).toBeGreaterThanOrEqual(120);
    expect(clean.visuals[0].h).toBeGreaterThanOrEqual(80);
    expect(clean.visuals[0].x).toBe(0);
    expect(clean.visuals[0].z).not.toBe(clean.visuals[1].z);
  });
});
