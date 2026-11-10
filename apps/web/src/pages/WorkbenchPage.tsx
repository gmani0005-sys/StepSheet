import React, { useEffect, useState } from 'react';
import { TopBar } from '../components/layout/TopBar';
import { LeftPanel } from '../components/layout/LeftPanel';
import { RightPanel } from '../components/layout/RightPanel';
import { DataGrid } from '../components/grid/DataGrid';
import { ColumnProfilePopover } from '../components/profile/ColumnProfilePopover';
import { AuthModal } from '../components/auth/AuthModal';
import { StepBuilderModal } from '../components/steps/StepBuilderModal';
import { EditStepModal } from '../components/steps/EditStepModal';
import { JoinBuilderModal } from '../components/joins/JoinBuilderModal';
import { XLookupModal } from '../components/joins/XLookupModal';
import { VLookupModal } from '../components/joins/VLookupModal';
import { AppendModal } from '../components/joins/AppendModal';
import { RelationshipsModal } from '../components/joins/RelationshipsModal';
import { ConditionalModal } from '../components/transforms/ConditionalModal';
import { GroupByModal } from '../components/transforms/GroupByModal';
import { WindowCalcModal } from '../components/transforms/WindowCalcModal';
import { TextTransformModal } from '../components/transforms/TextTransformModal';
import { DateTransformModal } from '../components/transforms/DateTransformModal';
import { MathTransformModal } from '../components/transforms/MathTransformModal';
import { PivotUnpivotModal } from '../components/transforms/PivotUnpivotModal';
import { FormulaBuilderModal } from '../components/transforms/FormulaBuilderModal';
import { DataCleaningModal } from '../components/transforms/DataCleaningModal';
import { TableOperationsModal } from '../components/transforms/TableOperationsModal';
import { NaturalLanguageStepBar } from '../components/ai/NaturalLanguageStepBar';
import { QualityModal } from '../components/quality/QualityModal';
import { ExportModal } from '../components/export/ExportModal';
import { TemplatesModal } from '../components/templates/TemplatesModal';
import { VersionHistoryModal } from '../components/versioning/VersionHistoryModal';
import { ShareModal } from '../components/collab/ShareModal';
import { AuditModal } from '../components/audit/AuditModal';
import { DashboardModal } from '../components/dashboard/DashboardModal';
import { ChatWithDataModal } from '../components/ai/ChatWithDataModal';
import { LocalAiSetupModal } from '../components/ai/LocalAiSetupModal';
import { ExportShareModal } from '../components/export_share/ExportShareModal';
import { exportShareApi } from '../api/exportShareApi';
import { SHARE_EXPORT_ENABLED } from '../config/features';
import { useWorkbenchStore } from '../store/workbenchStore';
import { useAuthStore } from '../store/authStore';

export const WorkbenchPage: React.FC = () => {
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isRelationshipsOpen, setIsRelationshipsOpen] = useState(false);
  const [isQualityModalOpen, setIsQualityModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isTemplatesOpen, setIsTemplatesOpen] = useState(false);
  const [isVersionsOpen, setIsVersionsOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isAuditOpen, setIsAuditOpen] = useState(false);
  const [isDashboardOpen, setIsDashboardOpen] = useState(false);
  const [isChatWithDataOpen, setIsChatWithDataOpen] = useState(false);
  const [isLocalAiSetupOpen, setIsLocalAiSetupOpen] = useState(false);
  const [isFormulaBuilderOpen, setIsFormulaBuilderOpen] = useState(false);
  const [isDataCleaningOpen, setIsDataCleaningOpen] = useState(false);
  const [dataCleaningTab, setDataCleaningTab] = useState<'duplicates' | 'missing' | 'text' | 'numeric' | 'date'>('duplicates');
  const [isTableOpsOpen, setIsTableOpsOpen] = useState(false);
  const [tableOpsTab, setTableOpsTab] = useState<'columns' | 'headers' | 'rows' | 'top_bottom' | 'transpose'>('columns');
  const [exportInitialTab, setExportInitialTab] = useState<'files' | 'code' | 'run'>('files');
  const [isExportShareOpen, setIsExportShareOpen] = useState(false);
  const [exportShareTab, setExportShareTab] = useState<'files' | 'link' | 'history'>('files');
  const [exportShareFormat, setExportShareFormat] = useState<string>('xlsx_values');
  const [joinInitialRightId, setJoinInitialRightId] = useState<string | undefined>(undefined);
  const [joinInitialKeyPair, setJoinInitialKeyPair] = useState<{
    left_col: string;
    right_col: string;
  } | null>(null);
  const {
    loadDatasets,
    isStepWizardOpen,
    activeWizardStepType,
    closeStepWizard,
    openStepWizard,
    selectedDataset,
    steps,
    columns,
    setPipelineSteps,
  } = useWorkbenchStore();
  const { initAuth } = useAuthStore();

  useEffect(() => {
    initAuth();
    loadDatasets();
  }, []);

  const handleOpenExportShare = (
    tab: 'files' | 'link' | 'history' = 'files',
    format: string = 'xlsx_values'
  ) => {
    setExportShareTab(tab);
    setExportShareFormat(format);
    setIsExportShareOpen(true);
  };

  const handleQuickDownload = async (format: 'xlsx_values' | 'csv') => {
    if (!selectedDataset) {
      alert('No dataset selected to download.');
      return;
    }
    try {
      const initial = await exportShareApi.createJob({
        project_id: selectedDataset.project_id || 'default-project',
        dataset_id: selectedDataset.id,
        format,
        row_scope: 'all',
        steps,
      });

      const finished = await exportShareApi.pollJobUntilDone(initial.job_id);
      if (finished.files && finished.files.length > 0) {
        const file = finished.files[0];
        await exportShareApi.downloadFile(finished.job_id, file.file_id, file.filename);
      }
    } catch (err: any) {
      console.error('Quick download failed:', err);
      // Fallback: open unified dialog with error or manual download
      handleOpenExportShare('files', format);
    }
  };

  return (
    <div className="excel-theme flex flex-col h-screen w-screen overflow-hidden bg-[#F3F3F3] text-[#212121]">
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
        onOpenTemplates={() => setIsTemplatesOpen(true)}
        onOpenVersions={() => setIsVersionsOpen(true)}
        onOpenShare={() => setIsShareOpen(true)}
        onOpenAudit={() => setIsAuditOpen(true)}
        onOpenDashboard={() => setIsDashboardOpen(true)}
        onOpenChatWithData={() => setIsChatWithDataOpen(true)}
        onOpenLocalAiSetup={() => setIsLocalAiSetupOpen(true)}
        onOpenExportShare={handleOpenExportShare}
        onQuickDownload={handleQuickDownload}
        onOpenDataCleaning={(tab = 'duplicates') => {
          setDataCleaningTab(tab);
          setIsDataCleaningOpen(true);
        }}
        onOpenTableOps={(tab = 'columns') => {
          setTableOpsTab(tab);
          setIsTableOpsOpen(true);
        }}
        onOpenFormulaBuilder={() => setIsFormulaBuilderOpen(true)}
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
      <EditStepModal />

      {/* Phase 3: Lookup & Join Suite Modals */}
      <JoinBuilderModal
        isOpen={isStepWizardOpen && activeWizardStepType === 'join'}
        onClose={() => {
          setJoinInitialRightId(undefined);
          setJoinInitialKeyPair(null);
          closeStepWizard();
        }}
        initialRightDatasetId={joinInitialRightId}
        initialKeyPair={joinInitialKeyPair}
      />
      <XLookupModal
        isOpen={isStepWizardOpen && activeWizardStepType === 'xlookup'}
        onClose={closeStepWizard}
      />
      <VLookupModal
        isOpen={isStepWizardOpen && activeWizardStepType === 'vlookup'}
        onClose={closeStepWizard}
      />
      <AppendModal
        isOpen={isStepWizardOpen && activeWizardStepType === 'append'}
        onClose={closeStepWizard}
      />
      <RelationshipsModal
        isOpen={isRelationshipsOpen}
        onClose={() => setIsRelationshipsOpen(false)}
        onOpenJoinBuilder={(rightId, leftCol, rightCol) => {
          setJoinInitialRightId(rightId);
          setJoinInitialKeyPair(
            leftCol && rightCol ? { left_col: leftCol, right_col: rightCol } : null
          );
          openStepWizard('join');
        }}
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
      <DataCleaningModal
        isOpen={
          isDataCleaningOpen ||
          (isStepWizardOpen &&
            ['remove_duplicates', 'impute_missing', 'standardize_values', 'flag_outliers'].includes(
              activeWizardStepType || ''
            ))
        }
        onClose={() => {
          setIsDataCleaningOpen(false);
          closeStepWizard();
        }}
        initialTab={
          activeWizardStepType === 'impute_missing'
            ? 'missing'
            : activeWizardStepType === 'standardize_values'
            ? 'text'
            : activeWizardStepType === 'flag_outliers'
            ? 'numeric'
            : dataCleaningTab
        }
      />
      <TableOperationsModal
        isOpen={
          isTableOpsOpen ||
          (isStepWizardOpen &&
            [
              'remove_column',
              'reorder_columns',
              'promote_headers',
              'remove_rows',
              'top_bottom_n',
              'transpose',
            ].includes(activeWizardStepType || ''))
        }
        onClose={() => {
          setIsTableOpsOpen(false);
          closeStepWizard();
        }}
        initialTab={
          activeWizardStepType === 'promote_headers'
            ? 'headers'
            : activeWizardStepType === 'remove_rows'
            ? 'rows'
            : activeWizardStepType === 'top_bottom_n'
            ? 'top_bottom'
            : activeWizardStepType === 'transpose'
            ? 'transpose'
            : tableOpsTab
        }
      />
      <FormulaBuilderModal
        isOpen={isFormulaBuilderOpen}
        onClose={() => setIsFormulaBuilderOpen(false)}
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

      <TemplatesModal
        isOpen={isTemplatesOpen}
        onClose={() => setIsTemplatesOpen(false)}
        dataset={selectedDataset}
        columns={columns}
        currentSteps={steps}
        onApplySteps={setPipelineSteps}
      />

      <VersionHistoryModal
        isOpen={isVersionsOpen}
        onClose={() => setIsVersionsOpen(false)}
        projectId={selectedDataset?.project_id || 'default-project'}
        currentSteps={steps}
        datasetId={selectedDataset?.id}
        onRestoreSteps={setPipelineSteps}
      />

      <ShareModal
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
        projectId={selectedDataset?.project_id || 'default-project'}
        projectTitle={selectedDataset?.name || 'StepSheet Project'}
      />

      <AuditModal
        isOpen={isAuditOpen}
        onClose={() => setIsAuditOpen(false)}
        projectId={selectedDataset?.project_id || 'default-project'}
      />

      <DashboardModal
        isOpen={isDashboardOpen}
        onClose={() => setIsDashboardOpen(false)}
        onOpenExportShare={handleOpenExportShare}
      />

      <ChatWithDataModal
        isOpen={isChatWithDataOpen}
        onClose={() => setIsChatWithDataOpen(false)}
        onOpenDashboard={() => {
          setIsChatWithDataOpen(false);
          setIsDashboardOpen(true);
        }}
      />

      <LocalAiSetupModal
        isOpen={isLocalAiSetupOpen}
        onClose={() => setIsLocalAiSetupOpen(false)}
      />

      {SHARE_EXPORT_ENABLED && (
        <ExportShareModal
          isOpen={isExportShareOpen}
          onClose={() => setIsExportShareOpen(false)}
          dataset={selectedDataset}
          columns={columns}
          steps={steps}
          initialTab={exportShareTab}
          initialFormat={exportShareFormat}
        />
      )}
    </div>
  );
};
