# StepSheet: Power BI-Style Dashboard Layout & Interaction Engine

## Overview
StepSheet's **Visual Dashboard & Custom Visuals Studio** (`apps/web/src/components/dashboard/DashboardModal.tsx`) uses a pure, unit-tested 2D layout engine (`apps/web/src/lib/layoutEngine.ts`) to provide Power BI Desktop–style visual arrangement without altering how visuals fetch data or how pipeline steps, joins, quality rules, or exports operate.

---

## Architecture & Files
1. **`apps/web/src/lib/layoutEngine.ts` (Pure Layout Engine)**:
   - Zero DOM dependencies; operates entirely in **logical page coordinates** (default `1280×720` for 16:9).
   - Provides grid snapping (`snapToGridValue`), page boundary clamping (`clampBoxToPage`), neighbor/page-center/equal-spacing smart guides (`computeSmartSnap`), multi-visual offset-preserving moves (`moveSelectionWithOffsets`), 8-way resizing with `Shift` aspect-ratio lock and `Alt` center-resize (`resizeVisualBox`), marquee rectangle intersection (`getMarqueeSelection`), alignment & distribution (`alignAndDistribute`), z-order management (`updateZOrder`), layout schema validation (`validateAndSanitizeLayout`), and a 100-step undo/redo stack (`pushHistory`, `undoHistory`, `redoHistory`).
2. **`apps/web/src/components/dashboard/DashboardModal.tsx` (Interactive Report Canvas)**:
   - Hosts the fixed logical page canvas (`16:9`, `4:3`, `Letter`, `Custom`), zoom/pan controls (`50%–200%`), marquee selection on empty canvas, 8-handle visual selection outlines, Lock/Unlock & Z-order controls, live `X, Y, W, H` tooltips, exact numeric `X, Y, W, H` inputs in the Format/Layout pane, Selection/Layers list, and an `aria-live="polite"` region for screen-reader announcements.
3. **`apps/web/src/__tests__/layoutEngine.test.ts` & `apps/web/src/__tests__/Workbench.test.tsx`**:
   - Unit and integration tests verifying all layout-engine operations and interactive dashboard canvas behaviors.

---

## Interaction Summary
- **Move**: Press and hold the left mouse button on any visual (~180 ms hold or > 4 px drag) or drag its header grip (`⋮⋮`) to move it anywhere on the canvas. Press `Esc` during a drag to cancel and restore the original position.
- **Resize**: Drag any of the 8 handles (`N`, `S`, `E`, `W`, `NW`, `NE`, `SW`, `SE`). Hold `Shift` on corners to preserve aspect ratio; hold `Alt` to resize from center.
- **Snap & Smart Guides**: 8 px grid snap (default ON) plus 6 px smart edge, center, page-center, and equal-spacing guides. Hold `Alt` while dragging to temporarily disable snapping.
- **Multi-Select**: `Ctrl/Shift + Click` visuals, drag a marquee box on empty canvas, or press `Ctrl+A` to select all visuals.
- **Keyboard & Accessibility**:
  - `Arrow` keys nudge by 1 px (or grid step); `Shift + Arrow` nudges by 10 px (`Alt + Arrow` resizes).
  - `Tab` / `Shift + Tab` cycles visual selection; `F2` / `Enter` renames the selected visual's title.
  - `Ctrl+C` / `Ctrl+V` / `Ctrl+D` copy, paste (+16 px offset), and duplicate; `Delete` removes unlocked selected visuals.
  - `Ctrl+Z` / `Ctrl+Y` undo and redo layout actions (depth up to 100).
