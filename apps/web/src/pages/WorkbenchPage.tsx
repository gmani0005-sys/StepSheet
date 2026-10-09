import React, { useEffect, useState } from 'react';
import { TopBar } from '../components/layout/TopBar';
import { LeftPanel } from '../components/layout/LeftPanel';
import { RightPanel } from '../components/layout/RightPanel';
import { DataGrid } from '../components/grid/DataGrid';
import { ColumnProfilePopover } from '../components/profile/ColumnProfilePopover';
import { AuthModal } from '../components/auth/AuthModal';
import { StepBuilderModal } from '../components/steps/StepBuilderModal';
import { JoinBuilderModal } from '../components/joins/JoinBuilderModal';
import { XLookupModal } from '../components/joins/XLookupModal';
import { AppendModal } from '../components/joins/AppendModal';
import { RelationshipsModal } from '../components/joins/RelationshipsModal';
import { ConditionalModal } from '../components/transforms/ConditionalModal';
import { GroupByModal } from '../components/transforms/GroupByModal';
import { WindowCalcModal } from '../components/transforms/WindowCalcModal';
import { TextTransformModal } from '../components/transforms/TextTransformModal';
import { DateTransformModal } from '../components/transforms/DateTransformModal';
import { MathTransformModal } from '../components/transforms/MathTransformModal';
import { PivotUnpivotModal } from '../components/transforms/PivotUnpivotModal';
import { NaturalLanguageStepBar } from '../components/ai/NaturalLanguageStepBar';
import { QualityModal } from '../components/quality/QualityModal';
import { ExportModal } from '../components/export/ExportModal';
import { useWorkbenchStore } from '../store/workbenchStore';
import { useAuthStore } from '../store/authStore';

export const WorkbenchPage: React.FC = () => {
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isRelationshipsOpen, setIsRelationshipsOpen] = useState(false);
  const [isQualityModalOpen, setIsQualityModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportInitialTab, setExportInitialTab] = useState<'files' | 'code' | 'run'>('files');
  const {
    loadDatasets,
    isStepWizardOpen,
    activeWizardStepType,
    closeStepWizard,
    openStepWizard,
    selectedDataset,
    steps,
    columns,
  } = useWorkbenchStore();
  const { initAuth } = useAuthStore();

  useEffect(() => {
    initAuth();
    loadDatasets();
  }, []);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-950 text-slate-100">
      {/* Top Application Bar */}
      <TopBar
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
        onOpenRelationships={() => setIsRelationshipsOpen(true)}
        onOpenQuality={() => setIsQualityModalOpen(true)}
        onOpenExport={() => {
          setExportInitialTab('files');
          setIsExportModalOpen(true);
        }}
        onOpenRunFull={() => {
          setExportInitialTab('run');
          setIsExportModalOpen(true);
        }}
      />

      {/* Main 3-Panel Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel: Datasets & Sheets */}
        <LeftPanel />

        {/* Center Panel: Natural Language Assistant + Virtualized Data Grid */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <NaturalLanguageStepBar />
          <DataGrid />
        </div>

        {/* Right Panel: Step Builder & Catalog */}
        <RightPanel />
      </div>

      {/* Overlays */}
      <ColumnProfilePopover />
      <StepBuilderModal />

      {/* Phase 3: Lookup & Join Suite Modals */}
      <JoinBuilderModal
        isOpen={isStepWizardOpen && activeWizardStepType === 'join'}
        onClose={closeStepWizard}
      />
      <XLookupModal
        isOpen={isStepWizardOpen && activeWizardStepType === 'xlookup'}
        onClose={closeStepWizard}
      />
      <AppendModal
        isOpen={isStepWizardOpen && activeWizardStepType === 'append'}
        onClose={closeStepWizard}
      />
      <RelationshipsModal
        isOpen={isRelationshipsOpen}
        onClose={() => setIsRelationshipsOpen(false)}
        onOpenJoinBuilder={() => openStepWizard('join')}
      />

      {/* Phase 4: Transformation Suite Modals */}
      <ConditionalModal
        isOpen={isStepWizardOpen && activeWizardStepType === 'conditional'}
        onClose={closeStepWizard}
      />
      <GroupByModal
        isOpen={isStepWizardOpen && activeWizardStepType === 'group_by'}
        onClose={closeStepWizard}
      />
      <WindowCalcModal
        isOpen={isStepWizardOpen && activeWizardStepType === 'window_calc'}
        onClose={closeStepWizard}
      />
      <TextTransformModal
        isOpen={isStepWizardOpen && activeWizardStepType === 'text_transform'}
        onClose={closeStepWizard}
      />
      <DateTransformModal
        isOpen={isStepWizardOpen && activeWizardStepType === 'date_transform'}
        onClose={closeStepWizard}
      />
      <MathTransformModal
        isOpen={isStepWizardOpen && activeWizardStepType === 'math_transform'}
        onClose={closeStepWizard}
      />
      <PivotUnpivotModal
        isOpen={
          isStepWizardOpen &&
          (activeWizardStepType === 'pivot' || activeWizardStepType === 'unpivot')
        }
        initialMode={activeWizardStepType === 'unpivot' ? 'unpivot' : 'pivot'}
        onClose={closeStepWizard}
      />

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
      />

      <QualityModal
        isOpen={isQualityModalOpen}
        onClose={() => setIsQualityModalOpen(false)}
        dataset={selectedDataset}
        steps={steps}
        columns={columns}
      />

      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        dataset={selectedDataset}
        steps={steps}
        initialTab={exportInitialTab}
      />
    </div>
  );
};
