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
import { useWorkbenchStore } from '../store/workbenchStore';
import { useAuthStore } from '../store/authStore';

export const WorkbenchPage: React.FC = () => {
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isRelationshipsOpen, setIsRelationshipsOpen] = useState(false);
  const {
    loadDatasets,
    isStepWizardOpen,
    activeWizardStepType,
    closeStepWizard,
    openStepWizard,
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
      />

      {/* Main 3-Panel Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel: Datasets & Sheets */}
        <LeftPanel />

        {/* Center Panel: Virtualized Data Grid */}
        <DataGrid />

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

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
      />
    </div>
  );
};
