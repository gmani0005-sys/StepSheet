import { create } from 'zustand';
import {
  Dataset,
  ColumnSchema,
  ColumnProfile,
  DatasetProfileResponse,
  SortCondition,
  FilterCondition,
} from '../types';
import { StepDefinition, StepType, StepSummary } from '../types/steps';
import { api } from '../api/client';

interface WorkbenchState {
  datasets: Dataset[];
  selectedDataset: Dataset | null;
  columns: ColumnSchema[];
  rows: Record<string, any>[];
  totalRows: number;
  filteredRows: number;
  offset: number;
  limit: number;
  isLoadingRows: boolean;
  isLoadingDatasets: boolean;

  searchQuery: string;
  sortConditions: SortCondition[];
  filterConditions: FilterCondition[];

  selectedColumnProfile: ColumnProfile | null;
  datasetProfile: DatasetProfileResponse | null;
  isLoadingProfile: boolean;

  // Pipeline Step Engine State
  steps: StepDefinition[];
  activeStepIndex: number | null; // null = entire pipeline, number = up to step N
  undoStack: StepDefinition[][];
  redoStack: StepDefinition[][];
  compiledSql: string;
  stepSummaries: StepSummary[];
  isStepWizardOpen: boolean;
  activeWizardStepType: StepType | null;
  editingStep: StepDefinition | null;

  activeTab: 'catalog' | 'applied' | 'details';
  isLeftPanelOpen: boolean;
  isRightPanelOpen: boolean;

  // Actions
  loadDatasets: () => Promise<void>;
  selectDataset: (datasetId: string) => Promise<void>;
  uploadDataset: (file: File, name?: string) => Promise<Dataset>;
  loadSamples: () => Promise<void>;
  deleteDataset: (id: string) => Promise<void>;
  fetchRows: (newOffset?: number) => Promise<void>;
  setSearch: (query: string) => void;
  toggleSort: (column: string) => void;
  openColumnProfile: (columnName: string) => Promise<void>;
  closeColumnProfile: () => void;
  setActiveTab: (tab: 'catalog' | 'applied' | 'details') => void;
  toggleLeftPanel: () => void;
  toggleRightPanel: () => void;

  // Step Engine Actions
  addStep: (step: StepDefinition) => Promise<void>;
  removeStep: (stepId: string) => Promise<void>;
  toggleStep: (stepId: string) => Promise<void>;
  duplicateStep: (stepId: string) => Promise<void>;
  moveStep: (index: number, direction: 'up' | 'down') => Promise<void>;
  selectStep: (index: number | null) => Promise<void>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  runPipelinePreview: () => Promise<void>;
  setPipelineSteps: (newSteps: StepDefinition[]) => Promise<void>;
  openStepWizard: (type: StepType, step?: StepDefinition) => void;
  closeStepWizard: () => void;
}

export const useWorkbenchStore = create<WorkbenchState>((set, get) => ({
  datasets: [],
  selectedDataset: null,
  columns: [],
  rows: [],
  totalRows: 0,
  filteredRows: 0,
  offset: 0,
  limit: 100,
  isLoadingRows: false,
  isLoadingDatasets: false,

  searchQuery: '',
  sortConditions: [],
  filterConditions: [],

  selectedColumnProfile: null,
  datasetProfile: null,
  isLoadingProfile: false,

  // Steps
  steps: [],
  activeStepIndex: null,
  undoStack: [],
  redoStack: [],
  compiledSql: '',
  stepSummaries: [],
  isStepWizardOpen: false,
  activeWizardStepType: null,
  editingStep: null,

  activeTab: 'applied',
  isLeftPanelOpen: true,
  isRightPanelOpen: true,

  loadDatasets: async () => {
    set({ isLoadingDatasets: true });
    try {
      const datasets = await api.listDatasets();
      set({ datasets, isLoadingDatasets: false });
      if (datasets.length > 0 && !get().selectedDataset) {
        get().selectDataset(datasets[0].id);
      }
    } catch {
      set({ isLoadingDatasets: false });
    }
  },

  selectDataset: async (datasetId: string) => {
    const ds = get().datasets.find((d) => d.id === datasetId);
    if (!ds) return;
    set({
      selectedDataset: ds,
      columns: ds.schema_metadata,
      offset: 0,
      searchQuery: '',
      sortConditions: [],
      filterConditions: [],
      selectedColumnProfile: null,
      steps: [],
      activeStepIndex: null,
      undoStack: [],
      redoStack: [],
      compiledSql: '',
      stepSummaries: [],
    });
    await get().fetchRows(0);
  },

  uploadDataset: async (file: File, name?: string) => {
    const ds = await api.uploadDataset(file, name);
    set((state) => ({ datasets: [ds, ...state.datasets] }));
    await get().selectDataset(ds.id);
    return ds;
  },

  loadSamples: async () => {
    set({ isLoadingDatasets: true });
    try {
      const loaded = await api.loadSampleDatasets();
      if (loaded.length > 0) {
        await get().loadDatasets();
        await get().selectDataset(loaded[0].id);
      }
    } catch (err: any) {
      alert(`Failed to load samples: ${err.message}`);
    } finally {
      set({ isLoadingDatasets: false });
    }
  },

  deleteDataset: async (id: string) => {
    await api.deleteDataset(id);
    set((state) => {
      const remaining = state.datasets.filter((d) => d.id !== id);
      const newSelected = state.selectedDataset?.id === id ? remaining[0] || null : state.selectedDataset;
      return {
        datasets: remaining,
        selectedDataset: newSelected,
        columns: newSelected ? newSelected.schema_metadata : [],
        rows: newSelected ? state.rows : [],
        steps: [],
        activeStepIndex: null,
        undoStack: [],
        redoStack: [],
      };
    });
    if (get().selectedDataset) {
      await get().fetchRows(0);
    }
  },

  fetchRows: async (newOffset?: number) => {
    const { selectedDataset, limit, sortConditions, filterConditions, searchQuery, steps } = get();
    if (!selectedDataset) return;

    if (steps.length > 0) {
      await get().runPipelinePreview();
      return;
    }

    const currentOffset = newOffset !== undefined ? newOffset : get().offset;
    set({ isLoadingRows: true });
    try {
      const res = await api.getRows(selectedDataset.id, {
        offset: currentOffset,
        limit,
        sort: sortConditions,
        filters: filterConditions,
        search: searchQuery,
      });
      set({
        rows: res.rows,
        columns: res.columns,
        totalRows: res.total_rows,
        filteredRows: res.filtered_rows,
        offset: currentOffset,
        isLoadingRows: false,
      });
    } catch {
      set({ isLoadingRows: false });
    }
  },

  setSearch: (query: string) => {
    set({ searchQuery: query });
    get().fetchRows(0);
  },

  toggleSort: (column: string) => {
    const current = get().sortConditions;
    const existing = current.find((s) => s.column === column);
    let next: SortCondition[];
    if (!existing) {
      next = [{ column, direction: 'asc' }];
    } else if (existing.direction === 'asc') {
      next = [{ column, direction: 'desc' }];
    } else {
      next = [];
    }
    set({ sortConditions: next });
    get().fetchRows(0);
  },

  openColumnProfile: async (columnName: string) => {
    const { selectedDataset } = get();
    if (!selectedDataset) return;
    set({ isLoadingProfile: true, selectedColumnProfile: null });
    try {
      const profile = await api.getColumnProfile(selectedDataset.id, columnName);
      set({ selectedColumnProfile: profile, isLoadingProfile: false });
    } catch {
      set({ isLoadingProfile: false });
    }
  },

  closeColumnProfile: () => {
    set({ selectedColumnProfile: null });
  },

  setActiveTab: (tab) => set({ activeTab: tab }),
  toggleLeftPanel: () => set((s) => ({ isLeftPanelOpen: !s.isLeftPanelOpen })),
  toggleRightPanel: () => set((s) => ({ isRightPanelOpen: !s.isRightPanelOpen })),

  // Step Engine Implementation
  runPipelinePreview: async () => {
    const { selectedDataset, steps, activeStepIndex, offset, limit } = get();
    if (!selectedDataset) return;

    // Slice steps if time-traveling up to activeStepIndex
    const stepsToRun =
      activeStepIndex !== null ? steps.slice(0, activeStepIndex + 1) : steps;

    set({ isLoadingRows: true });
    try {
      const res = await api.previewPipeline(selectedDataset.id, stepsToRun, {
        offset,
        limit,
      });
      set({
        rows: res.rows,
        columns: res.columns,
        totalRows: res.total_rows,
        filteredRows: res.filtered_rows,
        compiledSql: res.compiled_sql,
        stepSummaries: res.steps,
        isLoadingRows: false,
      });
    } catch (err: any) {
      set({ isLoadingRows: false });
      alert(`Step Error: ${err.message}`);
    }
  },

  addStep: async (newStep: StepDefinition) => {
    const currentSteps = get().steps;
    set((state) => ({
      undoStack: [...state.undoStack, currentSteps],
      redoStack: [],
      steps: [...state.steps, newStep],
      activeStepIndex: null,
      activeTab: 'applied',
    }));
    await get().runPipelinePreview();
  },

  setPipelineSteps: async (newSteps: StepDefinition[]) => {
    const currentSteps = get().steps;
    set((state) => ({
      undoStack: [...state.undoStack, currentSteps],
      redoStack: [],
      steps: newSteps,
      activeStepIndex: null,
      activeTab: 'applied',
    }));
    if (newSteps.length === 0) {
      await get().fetchRows(0);
    } else {
      await get().runPipelinePreview();
    }
  },

  removeStep: async (stepId: string) => {
    const currentSteps = get().steps;
    set((state) => ({
      undoStack: [...state.undoStack, currentSteps],
      redoStack: [],
      steps: state.steps.filter((s) => s.id !== stepId),
      activeStepIndex: null,
    }));
    if (get().steps.length === 0) {
      await get().fetchRows(0);
    } else {
      await get().runPipelinePreview();
    }
  },

  toggleStep: async (stepId: string) => {
    const currentSteps = get().steps;
    set((state) => ({
      undoStack: [...state.undoStack, currentSteps],
      redoStack: [],
      steps: state.steps.map((s) => (s.id === stepId ? { ...s, enabled: !s.enabled } : s)),
    }));
    await get().runPipelinePreview();
  },

  duplicateStep: async (stepId: string) => {
    const currentSteps = get().steps;
    const stepToDup = currentSteps.find((s) => s.id === stepId);
    if (!stepToDup) return;
    const duplicated: StepDefinition = {
      ...stepToDup,
      id: crypto.randomUUID(),
      label: `${stepToDup.label} (Copy)`,
    };
    set((state) => ({
      undoStack: [...state.undoStack, currentSteps],
      redoStack: [],
      steps: [...state.steps, duplicated],
    }));
    await get().runPipelinePreview();
  },

  moveStep: async (index: number, direction: 'up' | 'down') => {
    const currentSteps = [...get().steps];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= currentSteps.length) return;

    const temp = currentSteps[index];
    currentSteps[index] = currentSteps[targetIndex];
    currentSteps[targetIndex] = temp;

    set((state) => ({
      undoStack: [...state.undoStack, state.steps],
      redoStack: [],
      steps: currentSteps,
      activeStepIndex: null,
    }));
    await get().runPipelinePreview();
  },

  selectStep: async (index: number | null) => {
    set({ activeStepIndex: index, activeTab: index !== null ? 'details' : 'applied' });
    await get().runPipelinePreview();
  },

  undo: async () => {
    const { undoStack, steps } = get();
    if (undoStack.length === 0) return;
    const prevSteps = undoStack[undoStack.length - 1];
    const newUndoStack = undoStack.slice(0, -1);

    set((state) => ({
      undoStack: newUndoStack,
      redoStack: [...state.redoStack, steps],
      steps: prevSteps,
      activeStepIndex: null,
    }));
    if (prevSteps.length === 0) {
      await get().fetchRows(0);
    } else {
      await get().runPipelinePreview();
    }
  },

  redo: async () => {
    const { redoStack, steps } = get();
    if (redoStack.length === 0) return;
    const nextSteps = redoStack[redoStack.length - 1];
    const newRedoStack = redoStack.slice(0, -1);

    set((state) => ({
      redoStack: newRedoStack,
      undoStack: [...state.undoStack, steps],
      steps: nextSteps,
      activeStepIndex: null,
    }));
    await get().runPipelinePreview();
  },

  openStepWizard: (type: StepType, step?: StepDefinition) => {
    set({
      isStepWizardOpen: true,
      activeWizardStepType: type,
      editingStep: step || null,
    });
  },

  closeStepWizard: () => {
    set({
      isStepWizardOpen: false,
      activeWizardStepType: null,
      editingStep: null,
    });
  },
}));
