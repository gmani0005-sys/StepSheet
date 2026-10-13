import React, { useRef, useState } from 'react';
import { ChevronsRight, ChevronsLeft, RotateCcw, EyeOff } from 'lucide-react';

export type PaneState = 'open' | 'collapsed' | 'hidden';

export interface DashboardPaneConfig {
  state: PaneState;
  w: number;
}

interface DashboardPaneWrapperProps {
  id: 'filters' | 'visualizations' | 'data';
  title: string;
  icon?: React.ReactNode;
  headerRightExtra?: React.ReactNode;
  config: DashboardPaneConfig;
  onToggleCollapse: () => void;
  onHide?: () => void;
  onResize: (newWidth: number) => void;
  onResetWidth: () => void;
  children: React.ReactNode;
  testId?: string;
}

export const DashboardPaneWrapper: React.FC<DashboardPaneWrapperProps> = ({
  id,
  title,
  icon,
  headerRightExtra,
  config,
  onToggleCollapse,
  onHide,
  onResize,
  onResetWidth,
  children,
  testId,
}) => {
  const isCollapsed = config.state === 'collapsed';
  const isHidden = config.state === 'hidden';

  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);
  const startXRef = useRef(0);
  const startWRef = useRef(config.w);

  if (isHidden) {
    return null;
  }

  if (isCollapsed) {
    return (
      <div
        data-testid={`pane-strip-${id}`}
        role="region"
        aria-label={`${title} Pane (Collapsed)`}
        tabIndex={0}
        onClick={onToggleCollapse}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggleCollapse();
          }
        }}
        className="report-pane-strip h-full shrink-0 group relative cursor-pointer"
        title={`Expand ${title} pane (Alt+${id === 'filters' ? 1 : id === 'visualizations' ? 2 : 3})`}
      >
        <div className="pt-3 pb-2 text-[#605E5C] group-hover:text-[#217346] transition-colors">
          <ChevronsLeft className="w-4 h-4" />
        </div>
        <div className="report-strip-text">{title}</div>
      </div>
    );
  }

  const handleMouseDownResize = (e: React.MouseEvent) => {
    e.preventDefault();
    startXRef.current = e.clientX;
    startWRef.current = config.w;

    const handleMouseMove = (moveEvt: MouseEvent) => {
      const delta = startXRef.current - moveEvt.clientX;
      onResize(startWRef.current + delta);
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenuPos({ x: e.clientX, y: e.clientY });
  };

  return (
    <div
      data-testid={testId}
      role="complementary"
      aria-label={`${title} Pane`}
      aria-expanded={!isCollapsed}
      style={{ width: `${config.w}px` }}
      className="relative flex flex-col h-full bg-[#F3F2F1] border-l border-[#D4D4D4] shrink-0 text-[#212121] select-none"
    >
      {/* Left resize handle / divider */}
      <div
        onMouseDown={handleMouseDownResize}
        onDoubleClick={onResetWidth}
        className="absolute top-0 bottom-0 -left-1 w-2 cursor-col-resize z-20 group hover:bg-[#217346]/30 active:bg-[#217346]"
        title="Drag to resize, double-click to reset width"
      />

      {/* Pane Header */}
      <div
        onContextMenu={handleContextMenu}
        className="flex items-center justify-between px-3 h-10 border-b border-[#D4D4D4] shrink-0 bg-[#F3F2F1]"
      >
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#212121]">
            {title}
          </h3>
        </div>

        <div className="flex items-center gap-1">
          {headerRightExtra}
          <button
            data-testid={`pane-collapse-${id}`}
            type="button"
            onClick={onToggleCollapse}
            className="p-1 rounded text-[#605E5C] hover:text-[#217346] hover:bg-black/5 transition-colors"
            title={`Collapse ${title} (Alt+${id === 'filters' ? 1 : id === 'visualizations' ? 2 : 3})`}
            aria-label={`Collapse ${title} pane`}
          >
            <ChevronsRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Context Menu on Right-Click */}
      {contextMenuPos && (
        <>
          <div
            className="fixed inset-0 z-50"
            onClick={() => setContextMenuPos(null)}
          />
          <div
            style={{
              top: contextMenuPos.y,
              left: Math.min(contextMenuPos.x, window.innerWidth - 180),
            }}
            className="fixed z-50 bg-white border border-[#D4D4D4] rounded shadow-lg py-1 w-44 text-xs text-[#212121]"
          >
            <button
              type="button"
              onClick={() => {
                onToggleCollapse();
                setContextMenuPos(null);
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[#F3F2F1] text-left"
            >
              <ChevronsRight className="w-3.5 h-3.5 text-[#605E5C]" />
              <span>Collapse Pane</span>
            </button>
            {onHide && (
              <button
                type="button"
                onClick={() => {
                  onHide();
                  setContextMenuPos(null);
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[#F3F2F1] text-left"
              >
                <EyeOff className="w-3.5 h-3.5 text-[#605E5C]" />
                <span>Hide Pane</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                onResetWidth();
                setContextMenuPos(null);
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[#F3F2F1] text-left"
            >
              <RotateCcw className="w-3.5 h-3.5 text-[#605E5C]" />
              <span>Reset Width</span>
            </button>
          </div>
        </>
      )}

      {/* Pane Body Content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col bg-white">
        {children}
      </div>
    </div>
  );
};
