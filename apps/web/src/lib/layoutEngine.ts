export type ResizeDirection = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export type PageSizePreset = '16:9' | '4:3' | 'letter' | 'custom';

export interface PageConfig {
  width: number;
  height: number;
  background: string;
  grid: number;
  snap: boolean;
  showGridlines?: boolean;
  clampFullyInside?: boolean;
  preset?: PageSizePreset;
}

export const PAGE_PRESETS: Record<
  Exclude<PageSizePreset, 'custom'>,
  { width: number; height: number; label: string }
> = {
  '16:9': { width: 1280, height: 720, label: '16:9 (1280×720)' },
  '4:3': { width: 1024, height: 768, label: '4:3 (1024×768)' },
  letter: { width: 1056, height: 816, label: 'Letter (1056×816)' },
};

export const DEFAULT_PAGE_CONFIG: PageConfig = {
  width: 1280,
  height: 720,
  background: '#FFFFFF',
  grid: 8,
  snap: true,
  showGridlines: false,
  clampFullyInside: false,
  preset: '16:9',
};

export interface VisualLayoutBox {
  id: string;
  type?: string;
  title?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  locked?: boolean;
  hidden?: boolean;
}

export interface SmartGuide {
  id: string;
  orientation: 'vertical' | 'horizontal';
  position: number;
  start: number;
  end: number;
  kind: 'edge' | 'center' | 'page' | 'spacing';
  label?: string;
}

export interface MarqueeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type AlignDistributeMode =
  | 'left'
  | 'center'
  | 'right'
  | 'top'
  | 'middle'
  | 'bottom'
  | 'distribute_h'
  | 'distribute_v'
  | 'match_size';

export type ZOrderAction = 'front' | 'back' | 'forward' | 'backward';

export interface LayoutHistoryState<T> {
  past: T[];
  future: T[];
}

export const MIN_VISUAL_WIDTH = 120;
export const MIN_VISUAL_HEIGHT = 80;

/**
 * Snaps a scalar value to the nearest grid increment when enabled.
 */
export function snapToGridValue(val: number, grid: number, enabled: boolean): number {
  if (!enabled || grid <= 1) return Math.round(val);
  return Math.round(val / grid) * grid;
}

/**
 * Clamps a visual box to the logical page so that either:
 * - 100% of the visual stays inside the page (`fullyInside = true`), OR
 * - At least 20% of the visual's width/height stays inside the page (`fullyInside = false`),
 *   while keeping top-left X/Y >= 0 for standard inside-page placement.
 */
export function clampBoxToPage(
  box: { x: number; y: number; w: number; h: number },
  page: { width: number; height: number },
  fullyInside = false
): { x: number; y: number } {
  const w = Math.max(MIN_VISUAL_WIDTH, box.w);
  const h = Math.max(MIN_VISUAL_HEIGHT, box.h);
  if (fullyInside) {
    const maxX = Math.max(0, page.width - w);
    const maxY = Math.max(0, page.height - h);
    return {
      x: Math.round(Math.max(0, Math.min(maxX, box.x))),
      y: Math.round(Math.max(0, Math.min(maxY, box.y))),
    };
  }
  const minVisibleX = Math.max(24, Math.round(w * 0.2));
  const minVisibleY = Math.max(24, Math.round(h * 0.2));
  const minX = 0;
  const minY = 0;
  const maxX = Math.max(0, page.width - minVisibleX);
  const maxY = Math.max(0, page.height - minVisibleY);
  return {
    x: Math.round(Math.max(minX, Math.min(maxX, box.x))),
    y: Math.round(Math.max(minY, Math.min(maxY, box.y))),
  };
}

/**
 * Computes snapped (x, y) coordinates and smart alignment guides (edges, centers, page center, equal spacing).
 */
export function computeSmartSnap(
  movingBox: { x: number; y: number; w: number; h: number },
  neighbors: VisualLayoutBox[],
  page: PageConfig,
  options?: { snapThreshold?: number; disableSnap?: boolean }
): { x: number; y: number; guides: SmartGuide[] } {
  const threshold = options?.snapThreshold ?? 6;
  const disableSnap = options?.disableSnap ?? false;

  const clampedRaw = clampBoxToPage(movingBox, page, page.clampFullyInside);
  if (disableSnap) {
    return { x: clampedRaw.x, y: clampedRaw.y, guides: [] };
  }

  let snappedX = snapToGridValue(clampedRaw.x, page.grid, page.snap);
  let snappedY = snapToGridValue(clampedRaw.y, page.grid, page.snap);

  const guides: SmartGuide[] = [];
  const visibleNeighbors = neighbors.filter((n) => !n.hidden);

  let matchedX = false;
  let matchedY = false;

  // 1. Neighbor edge & center alignment
  for (const other of visibleNeighbors) {
    const otherXTargets = [
      { pos: other.x, kind: 'edge' as const },
      { pos: other.x + other.w / 2, kind: 'center' as const },
      { pos: other.x + other.w, kind: 'edge' as const },
    ];
    const movingXOffsets = [0, movingBox.w / 2, movingBox.w];

    if (!matchedX) {
      for (const target of otherXTargets) {
        for (const offset of movingXOffsets) {
          const candidateX = target.pos - offset;
          if (Math.abs(clampedRaw.x - candidateX) <= threshold) {
            snappedX = Math.round(candidateX);
            matchedX = true;
            guides.push({
              id: `v-${other.id}-${Math.round(target.pos)}`,
              orientation: 'vertical',
              position: Math.round(target.pos),
              start: Math.max(0, Math.min(snappedY, other.y) - 12),
              end: Math.min(page.height, Math.max(snappedY + movingBox.h, other.y + other.h) + 12),
              kind: target.kind,
              label: `${Math.round(target.pos)}px`,
            });
            break;
          }
        }
        if (matchedX) break;
      }
    }

    const otherYTargets = [
      { pos: other.y, kind: 'edge' as const },
      { pos: other.y + other.h / 2, kind: 'center' as const },
      { pos: other.y + other.h, kind: 'edge' as const },
    ];
    const movingYOffsets = [0, movingBox.h / 2, movingBox.h];

    if (!matchedY) {
      for (const target of otherYTargets) {
        for (const offset of movingYOffsets) {
          const candidateY = target.pos - offset;
          if (Math.abs(clampedRaw.y - candidateY) <= threshold) {
            snappedY = Math.round(candidateY);
            matchedY = true;
            guides.push({
              id: `h-${other.id}-${Math.round(target.pos)}`,
              orientation: 'horizontal',
              position: Math.round(target.pos),
              start: Math.max(0, Math.min(snappedX, other.x) - 12),
              end: Math.min(page.width, Math.max(snappedX + movingBox.w, other.x + other.w) + 12),
              kind: target.kind,
              label: `${Math.round(target.pos)}px`,
            });
            break;
          }
        }
        if (matchedY) break;
      }
    }
  }

  // 2. Page center alignment
  const pageCenterX = page.width / 2;
  const pageCenterY = page.height / 2;
  if (!matchedX && Math.abs(clampedRaw.x + movingBox.w / 2 - pageCenterX) <= threshold) {
    snappedX = Math.round(pageCenterX - movingBox.w / 2);
    matchedX = true;
    guides.push({
      id: 'v-page-center',
      orientation: 'vertical',
      position: Math.round(pageCenterX),
      start: 0,
      end: page.height,
      kind: 'page',
      label: 'Page Center',
    });
  }
  if (!matchedY && Math.abs(clampedRaw.y + movingBox.h / 2 - pageCenterY) <= threshold) {
    snappedY = Math.round(pageCenterY - movingBox.h / 2);
    matchedY = true;
    guides.push({
      id: 'h-page-center',
      orientation: 'horizontal',
      position: Math.round(pageCenterY),
      start: 0,
      end: page.width,
      kind: 'page',
      label: 'Page Middle',
    });
  }

  // 3. Equal-spacing hints between 2 neighbors
  if (visibleNeighbors.length >= 2) {
    const sortedX = [...visibleNeighbors].sort((a, b) => a.x - b.x);
    for (let i = 0; i < sortedX.length - 1; i++) {
      const a = sortedX[i];
      const b = sortedX[i + 1];
      const gapAB = b.x - (a.x + a.w);
      if (gapAB > 4) {
        const rightCandidateX = b.x + b.w + gapAB;
        if (Math.abs(snappedX - rightCandidateX) <= threshold) {
          snappedX = Math.round(rightCandidateX);
          guides.push({
            id: `spacing-h-${a.id}-${b.id}`,
            orientation: 'horizontal',
            position: Math.round(snappedY + movingBox.h / 2),
            start: b.x + b.w,
            end: snappedX,
            kind: 'spacing',
            label: `${Math.round(gapAB)}px gap`,
          });
        }
      }
    }
  }

  const finalClamped = clampBoxToPage(
    { x: snappedX, y: snappedY, w: movingBox.w, h: movingBox.h },
    page,
    page.clampFullyInside
  );

  return {
    x: finalClamped.x,
    y: finalClamped.y,
    guides,
  };
}

/**
 * Moves a multi-visual selection together while preserving relative offsets and respecting locked visuals.
 */
export function moveSelectionWithOffsets<T extends VisualLayoutBox>(
  visuals: T[],
  selectedIds: string[],
  primaryId: string,
  delta: { dx: number; dy: number },
  page: PageConfig,
  options?: { snapThreshold?: number; disableSnap?: boolean }
): { visuals: T[]; guides: SmartGuide[] } {
  const primary = visuals.find((v) => v.id === primaryId);
  if (!primary || primary.locked) {
    return { visuals, guides: [] };
  }

  const movableIds = new Set(
    visuals.filter((v) => selectedIds.includes(v.id) && !v.locked).map((v) => v.id)
  );
  if (!movableIds.has(primaryId)) {
    return { visuals, guides: [] };
  }

  const neighbors = visuals.filter((v) => !movableIds.has(v.id));
  const proposedPrimary = {
    x: primary.x + delta.dx,
    y: primary.y + delta.dy,
    w: primary.w,
    h: primary.h,
  };

  const { x: snappedPrimaryX, y: snappedPrimaryY, guides } = computeSmartSnap(
    proposedPrimary,
    neighbors,
    page,
    options
  );

  const effDX = snappedPrimaryX - primary.x;
  const effDY = snappedPrimaryY - primary.y;

  const updated = visuals.map((v) => {
    if (!movableIds.has(v.id)) return v;
    const clamped = clampBoxToPage(
      { x: v.x + effDX, y: v.y + effDY, w: v.w, h: v.h },
      page,
      page.clampFullyInside
    );
    return {
      ...v,
      x: clamped.x,
      y: clamped.y,
    };
  });

  return { visuals: updated, guides };
}

/**
 * Resizes a visual box from any of the 8 handles, supporting Shift (aspect ratio) and Alt (resize from center).
 */
export function resizeVisualBox<T extends VisualLayoutBox>(
  box: T,
  dir: ResizeDirection,
  deltaX: number,
  deltaY: number,
  page: PageConfig,
  options?: {
    keepAspectRatio?: boolean;
    fromCenter?: boolean;
    minW?: number;
    minH?: number;
    maxW?: number;
    maxH?: number;
    neighbors?: VisualLayoutBox[];
  }
): { box: T; guides: SmartGuide[] } {
  if (box.locked) {
    return { box, guides: [] };
  }

  const minW = options?.minW ?? MIN_VISUAL_WIDTH;
  const minH = options?.minH ?? MIN_VISUAL_HEIGHT;
  const maxW = options?.maxW ?? Math.max(1400, page.width);
  const maxH = options?.maxH ?? Math.max(900, page.height);
  const aspect = box.w / Math.max(1, box.h);

  let nextLeft = box.x;
  let nextTop = box.y;
  let nextW = box.w;
  let nextH = box.h;

  if (options?.fromCenter) {
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    if (dir.includes('e')) nextW = box.w + deltaX * 2;
    if (dir.includes('w')) nextW = box.w - deltaX * 2;
    if (dir.includes('s')) nextH = box.h + deltaY * 2;
    if (dir.includes('n')) nextH = box.h - deltaY * 2;

    if (options?.keepAspectRatio && (dir === 'nw' || dir === 'ne' || dir === 'se' || dir === 'sw')) {
      nextH = Math.round(nextW / aspect);
    }

    nextW = Math.round(Math.max(minW, Math.min(maxW, nextW)));
    nextH = Math.round(Math.max(minH, Math.min(maxH, nextH)));
    nextLeft = Math.max(0, Math.round(cx - nextW / 2));
    nextTop = Math.max(0, Math.round(cy - nextH / 2));
  } else {
    if (dir.includes('e')) {
      nextW = Math.round(Math.max(minW, Math.min(maxW, box.w + deltaX)));
    }
    if (dir.includes('s')) {
      nextH = Math.round(Math.max(minH, Math.min(maxH, box.h + deltaY)));
    }
    if (dir.includes('w')) {
      const rawW = box.w - deltaX;
      const clampedW = Math.round(Math.max(minW, Math.min(maxW, rawW)));
      nextLeft = Math.max(0, box.x + (box.w - clampedW));
      nextW = box.w + (box.x - nextLeft);
    }
    if (dir.includes('n')) {
      const rawH = box.h - deltaY;
      const clampedH = Math.round(Math.max(minH, Math.min(maxH, rawH)));
      nextTop = Math.max(0, box.y + (box.h - clampedH));
      nextH = box.h + (box.y - nextTop);
    }

    if (options?.keepAspectRatio && (dir === 'nw' || dir === 'ne' || dir === 'se' || dir === 'sw')) {
      const targetH = Math.round(nextW / aspect);
      const clampedH = Math.max(minH, Math.min(maxH, targetH));
      if (dir.includes('n')) {
        nextTop = Math.max(0, box.y + (box.h - clampedH));
      }
      nextH = clampedH;
      nextW = Math.round(clampedH * aspect);
    }
  }

  const guides: SmartGuide[] = [];
  if (options?.neighbors) {
    for (const other of options.neighbors) {
      if (other.id === box.id || other.hidden) continue;
      if (Math.abs(nextLeft + nextW - (other.x + other.w)) <= 4) {
        guides.push({
          id: `rv-${other.id}`,
          orientation: 'vertical',
          position: other.x + other.w,
          start: Math.min(nextTop, other.y) - 8,
          end: Math.max(nextTop + nextH, other.y + other.h) + 8,
          kind: 'edge',
          label: `${other.x + other.w}px`,
        });
      }
      if (Math.abs(nextTop + nextH - (other.y + other.h)) <= 4) {
        guides.push({
          id: `rh-${other.id}`,
          orientation: 'horizontal',
          position: other.y + other.h,
          start: Math.min(nextLeft, other.x) - 8,
          end: Math.max(nextLeft + nextW, other.x + other.w) + 8,
          kind: 'edge',
          label: `${other.y + other.h}px`,
        });
      }
    }
  }

  return {
    box: {
      ...box,
      x: nextLeft,
      y: nextTop,
      w: nextW,
      h: nextH,
    },
    guides,
  };
}

/**
 * Returns IDs of all visible visuals intersecting the marquee selection rectangle.
 */
export function getMarqueeSelection(
  visuals: VisualLayoutBox[],
  marquee: MarqueeRect
): string[] {
  const mx1 = Math.min(marquee.x, marquee.x + marquee.w);
  const my1 = Math.min(marquee.y, marquee.y + marquee.h);
  const mx2 = Math.max(marquee.x, marquee.x + marquee.w);
  const my2 = Math.max(marquee.y, marquee.y + marquee.h);

  return visuals
    .filter((v) => {
      if (v.hidden) return false;
      const vx1 = v.x;
      const vy1 = v.y;
      const vx2 = v.x + v.w;
      const vy2 = v.y + v.h;
      return vx1 <= mx2 && vx2 >= mx1 && vy1 <= my2 && vy2 >= my1;
    })
    .map((v) => v.id);
}

/**
 * Aligns or distributes a set of selected unlocked visuals.
 */
export function alignAndDistribute<T extends VisualLayoutBox>(
  visuals: T[],
  selectedIds: string[],
  mode: AlignDistributeMode
): T[] {
  const selectedSet = new Set(selectedIds);
  const targets = visuals.filter((v) => selectedSet.has(v.id) && !v.locked && !v.hidden);
  if (targets.length <= 1) return visuals;

  const minX = Math.min(...targets.map((v) => v.x));
  const maxRight = Math.max(...targets.map((v) => v.x + v.w));
  const centerX = Math.round((minX + maxRight) / 2);

  const minY = Math.min(...targets.map((v) => v.y));
  const maxBottom = Math.max(...targets.map((v) => v.y + v.h));
  const centerY = Math.round((minY + maxBottom) / 2);

  const refW = targets[0].w;
  const refH = targets[0].h;

  if (mode === 'distribute_h' && targets.length >= 3) {
    const sorted = [...targets].sort((a, b) => a.x - b.x);
    const totalWidths = sorted.reduce((acc, v) => acc + v.w, 0);
    const span = maxRight - minX;
    const gap = (span - totalWidths) / (sorted.length - 1);
    let cursorX = minX;
    const posMap = new Map<string, number>();
    sorted.forEach((v) => {
      posMap.set(v.id, Math.round(cursorX));
      cursorX += v.w + gap;
    });
    return visuals.map((v) => (posMap.has(v.id) ? { ...v, x: posMap.get(v.id)! } : v));
  }

  if (mode === 'distribute_v' && targets.length >= 3) {
    const sorted = [...targets].sort((a, b) => a.y - b.y);
    const totalHeights = sorted.reduce((acc, v) => acc + v.h, 0);
    const span = maxBottom - minY;
    const gap = (span - totalHeights) / (sorted.length - 1);
    let cursorY = minY;
    const posMap = new Map<string, number>();
    sorted.forEach((v) => {
      posMap.set(v.id, Math.round(cursorY));
      cursorY += v.h + gap;
    });
    return visuals.map((v) => (posMap.has(v.id) ? { ...v, y: posMap.get(v.id)! } : v));
  }

  const targetIds = new Set(targets.map((v) => v.id));
  return visuals.map((v) => {
    if (!targetIds.has(v.id)) return v;
    switch (mode) {
      case 'left':
        return { ...v, x: minX };
      case 'center':
        return { ...v, x: Math.round(centerX - v.w / 2) };
      case 'right':
        return { ...v, x: Math.round(maxRight - v.w) };
      case 'top':
        return { ...v, y: minY };
      case 'middle':
        return { ...v, y: Math.round(centerY - v.h / 2) };
      case 'bottom':
        return { ...v, y: Math.round(maxBottom - v.h) };
      case 'match_size':
        return { ...v, w: refW, h: refH };
      default:
        return v;
    }
  });
}

/**
 * Updates z-order of a target visual ('front' | 'back' | 'forward' | 'backward') and normalizes z values 1..N.
 */
export function updateZOrder<T extends VisualLayoutBox>(
  visuals: T[],
  targetId: string,
  action: ZOrderAction
): T[] {
  const ordered = [...visuals].sort((a, b) => (a.z || 0) - (b.z || 0));
  const idx = ordered.findIndex((v) => v.id === targetId);
  if (idx === -1) return visuals;

  const [item] = ordered.splice(idx, 1);
  if (action === 'front') {
    ordered.push(item);
  } else if (action === 'back') {
    ordered.unshift(item);
  } else if (action === 'forward') {
    ordered.splice(Math.min(ordered.length, idx + 1), 0, item);
  } else if (action === 'backward') {
    ordered.splice(Math.max(0, idx - 1), 0, item);
  }

  const zMap = new Map<string, number>();
  ordered.forEach((v, i) => zMap.set(v.id, i + 1));

  return visuals.map((v) => ({
    ...v,
    z: zMap.get(v.id) ?? v.z,
  }));
}

/**
 * Validates and sanitizes a loaded layout JSON object so corrupted or out-of-range values never break the page.
 */
export function validateAndSanitizeLayout(
  raw: any,
  fallbackPage: PageConfig = DEFAULT_PAGE_CONFIG
): {
  page: PageConfig;
  visuals: VisualLayoutBox[];
} {
  const rawPage = raw && typeof raw.page === 'object' && raw.page ? raw.page : {};
  const page: PageConfig = {
    width:
      typeof rawPage.width === 'number' && Number.isFinite(rawPage.width)
        ? Math.max(480, Math.min(3840, Math.round(rawPage.width)))
        : fallbackPage.width,
    height:
      typeof rawPage.height === 'number' && Number.isFinite(rawPage.height)
        ? Math.max(360, Math.min(2400, Math.round(rawPage.height)))
        : fallbackPage.height,
    background:
      typeof rawPage.background === 'string' && rawPage.background.trim()
        ? rawPage.background
        : fallbackPage.background,
    grid:
      typeof rawPage.grid === 'number' && Number.isFinite(rawPage.grid) && rawPage.grid >= 1
        ? Math.min(64, Math.round(rawPage.grid))
        : fallbackPage.grid,
    snap: typeof rawPage.snap === 'boolean' ? rawPage.snap : fallbackPage.snap,
    showGridlines:
      typeof rawPage.showGridlines === 'boolean'
        ? rawPage.showGridlines
        : fallbackPage.showGridlines ?? false,
    clampFullyInside:
      typeof rawPage.clampFullyInside === 'boolean'
        ? rawPage.clampFullyInside
        : fallbackPage.clampFullyInside ?? false,
    preset:
      rawPage.preset === '16:9' ||
      rawPage.preset === '4:3' ||
      rawPage.preset === 'letter' ||
      rawPage.preset === 'custom'
        ? rawPage.preset
        : fallbackPage.preset ?? '16:9',
  };

  const rawVisuals = Array.isArray(raw?.visuals) ? raw.visuals : [];
  const seenIds = new Set<string>();
  const sanitized: VisualLayoutBox[] = [];

  rawVisuals.forEach((item: any, idx: number) => {
    if (!item || typeof item !== 'object') return;
    const id =
      typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `vis_${idx + 1}`;
    if (seenIds.has(id)) return;
    seenIds.add(id);

    const w =
      typeof item.w === 'number' && Number.isFinite(item.w)
        ? Math.max(MIN_VISUAL_WIDTH, Math.min(page.width, Math.round(item.w)))
        : 480;
    const h =
      typeof item.h === 'number' && Number.isFinite(item.h)
        ? Math.max(MIN_VISUAL_HEIGHT, Math.min(page.height, Math.round(item.h)))
        : 320;
    const rawX =
      typeof item.x === 'number' && Number.isFinite(item.x)
        ? item.x
        : 16 + (idx % 2) * 496;
    const rawY =
      typeof item.y === 'number' && Number.isFinite(item.y)
        ? item.y
        : 16 + Math.floor(idx / 2) * 336;
    const clamped = clampBoxToPage({ x: rawX, y: rawY, w, h }, page, page.clampFullyInside);

    sanitized.push({
      id,
      type: typeof item.type === 'string' ? item.type : 'column',
      title: typeof item.title === 'string' ? item.title : `Visual ${idx + 1}`,
      x: clamped.x,
      y: clamped.y,
      w,
      h,
      z: typeof item.z === 'number' && Number.isFinite(item.z) ? item.z : idx + 1,
      locked: Boolean(item.locked),
      hidden: Boolean(item.hidden),
    });
  });

  // Normalize duplicate or out-of-order z indices
  const sortedByZ = [...sanitized].sort((a, b) => a.z - b.z);
  const zOrderMap = new Map<string, number>();
  sortedByZ.forEach((v, i) => zOrderMap.set(v.id, i + 1));

  return {
    page,
    visuals: sanitized.map((v) => ({
      ...v,
      z: zOrderMap.get(v.id) ?? 1,
    })),
  };
}

/**
 * Pure Undo/Redo history helpers (depth up to 100 actions).
 */
export function pushHistory<T>(
  history: LayoutHistoryState<T>,
  snapshot: T,
  maxDepth = 100
): LayoutHistoryState<T> {
  const copy = JSON.parse(JSON.stringify(snapshot)) as T;
  const nextPast = [...history.past.slice(-(maxDepth - 1)), copy];
  return {
    past: nextPast,
    future: [],
  };
}

export function undoHistory<T>(
  history: LayoutHistoryState<T>,
  current: T
): { history: LayoutHistoryState<T>; state: T | null } {
  if (history.past.length === 0) {
    return { history, state: null };
  }
  const previous = history.past[history.past.length - 1];
  const currentCopy = JSON.parse(JSON.stringify(current)) as T;
  return {
    history: {
      past: history.past.slice(0, -1),
      future: [...history.future, currentCopy],
    },
    state: previous,
  };
}

export function redoHistory<T>(
  history: LayoutHistoryState<T>,
  current: T
): { history: LayoutHistoryState<T>; state: T | null } {
  if (history.future.length === 0) {
    return { history, state: null };
  }
  const next = history.future[history.future.length - 1];
  const currentCopy = JSON.parse(JSON.stringify(current)) as T;
  return {
    history: {
      past: [...history.past, currentCopy],
      future: history.future.slice(0, -1),
    },
    state: next,
  };
}
