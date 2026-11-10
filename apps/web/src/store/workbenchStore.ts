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

export interface QueryConnection {
  id: string;
  name: string;
  datasetId: string;
  datasetName: string;
  steps: StepDefinition[];
  undoStack: StepDefinition[][];
  redoStack: StepDefinition[][];
  activeStepIndex: number | null;
  compiledSql: string;
  stepSummaries: StepSummary[];
  updatedAt: string;
}

export interface DatasetPipelineState {
  steps: StepDefinition[];
  undoStack: StepDefinition[][];
  redoStack: StepDefinition[][];
  activeStepIndex: number | null;
  compiledSql: string;
  stepSummaries: StepSummary[];
}

const STORAGE_KEY_QUERIES = 'stepsheet_queries_v1';
const STORAGE_KEY_PIPELINES = 'stepsheet_dataset_pipelines_v1';

const loadStoredQueries = (): QueryConnection[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_QUERIES);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.map((q: any) => ({
      ...q,
      steps: Array.isArray(q.steps) ? q.steps : [],
      undoStack: Array.isArray(q.undoStack) ? q.undoStack : [],
      redoStack: Array.isArray(q.redoStack) ? q.redoStack : [],
      stepSummaries: Array.isArray(q.stepSummaries) ? q.stepSummaries : [],
    }));
  } catch {
    return [];
  }
};

const loadStoredPipelines = (): Record<string, DatasetPipelineState> => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PIPELINES);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object') return {};
    const sanitized: Record<string, DatasetPipelineState> = {};
    Object.entries(parsed).forEach(([k, v]: [string, any]) => {
      if (v && typeof v === 'object') {
        sanitized[k] = {
          ...v,
          steps: Array.isArray(v.steps) ? v.steps : [],
          undoStack: Array.isArray(v.undoStack) ? v.undoStack : [],
          redoStack: Array.isArray(v.redoStack) ? v.redoStack : [],
          stepSummaries: Array.isArray(v.stepSummaries) ? v.stepSummaries : [],
        };
      }
    });
    return sanitized;
  } catch {
    return {};
  }
};

const persistConnectionsState = (
  queries: QueryConnection[],
  datasetPipelines: Record<string, DatasetPipelineState>
) => {
  try {
    localStorage.setItem(STORAGE_KEY_QUERIES, JSON.stringify(queries));
    localStorage.setItem(STORAGE_KEY_PIPELINES, JSON.stringify(datasetPipelines));
  } catch {}
};

interface WorkbenchState {
  datasets: Dataset[];
  selectedDataset: Dataset | null;
  columns: ColumnSchema[];
  rows: Record<string, any>[];
  allRows: Record<string, any>[];
  totalRows: number;
  filteredRows: number;
  offset: number;
  limit: number;
  isLoadingRows: boolean;
  isLoadingDatasets: boolean;

  searchQuery: string;
  sortConditions: SortCondition[];
  filterConditions: FilterCondition[];
  columnValueFilters: Record<string, string[]>;

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

  // Connections & Queries State (Preserves applied steps across tables & queries)
  queries: QueryConnection[];
  activeQueryId: string | null;
  datasetPipelines: Record<string, DatasetPipelineState>;

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
  setColumnSort: (column: string, direction: 'asc' | 'desc' | null) => void;
  setColumnValueFilter: (column: string, values: string[] | null) => void;
  clearColumnValueFilters: () => void;
  openColumnProfile: (columnName: string) => Promise<void>;
  closeColumnProfile: () => void;
  setActiveTab: (tab: 'catalog' | 'applied' | 'details') => void;
  toggleLeftPanel: () => void;
  toggleRightPanel: () => void;

  // Connections & Queries Actions
  addConnectionQuery: (datasetId: string, customName?: string) => Promise<QueryConnection | null>;
  selectConnectionQuery: (queryId: string) => Promise<void>;
  renameConnectionQuery: (queryId: string, newName: string) => void;
  duplicateConnectionQuery: (queryId: string) => Promise<void>;
  deleteConnectionQuery: (queryId: string) => void;

  // Step Engine Actions
  addStep: (step: StepDefinition) => Promise<void>;
  updateStep: (stepId: string, updatedStep: Partial<StepDefinition>) => Promise<void>;
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
  isEditStepModalOpen: boolean;
  openEditStepModal: (step: StepDefinition) => void;
  closeEditStepModal: () => void;
}

export const useWorkbenchStore = create<WorkbenchState>((set, get) => {
  // Internal helper to save current pipeline steps into datasetPipelines & active QueryConnection
  const saveCurrentPipelineContext = (autoCreateConnection = false) => {
    const {
      selectedDataset,
      activeQueryId,
      steps,
      undoStack,
      redoStack,
      activeStepIndex,
      compiledSql,
      stepSummaries,
      queries,
      datasetPipelines,
    } = get();

    if (!selectedDataset) return;

    const currentSnapshot: DatasetPipelineState = {
      steps,
      undoStack,
      redoStack,
      activeStepIndex,
      compiledSql,
      stepSummaries,
    };

    const nextPipelines: Record<string, DatasetPipelineState> = {
      ...datasetPipelines,
      [selectedDataset.id]: currentSnapshot,
    };

    let nextQueries = [...queries];
    let nextActiveQueryId = activeQueryId;

    if (activeQueryId) {
      nextQueries = nextQueries.map((q) =>
        q.id === activeQueryId
          ? {
              ...q,
              steps,
              undoStack,
              redoStack,
              activeStepIndex,
              compiledSql,
              stepSummaries,
              updatedAt: new Date().toISOString(),
            }
          : q
      );
    } else if (autoCreateConnection && steps.length > 0) {
      const existingForDataset = nextQueries.find((q) => q.datasetId === selectedDataset.id);
      if (existingForDataset) {
        nextActiveQueryId = existingForDataset.id;
        nextQueries = nextQueries.map((q) =>
          q.id === existingForDataset.id
            ? {
                ...q,
                steps,
                undoStack,
                redoStack,
                activeStepIndex,
                compiledSql,
                stepSummaries,
                updatedAt: new Date().toISOString(),
              }
            : q
        );
      } else {
        const createdQuery: QueryConnection = {
          id: crypto.randomUUID(),
          name: selectedDataset.name,
          datasetId: selectedDataset.id,
          datasetName: selectedDataset.name,
          steps,
          undoStack,
          redoStack,
          activeStepIndex,
          compiledSql,
          stepSummaries,
          updatedAt: new Date().toISOString(),
        };
        nextQueries = [createdQuery, ...nextQueries];
        nextActiveQueryId = createdQuery.id;
      }
    }

    set({
      datasetPipelines: nextPipelines,
      queries: nextQueries,
      activeQueryId: nextActiveQueryId,
    });
    persistConnectionsState(nextQueries, nextPipelines);
  };

  return {
    datasets: [],
    selectedDataset: null,
    columns: [],
    rows: [],
    allRows: [],
    totalRows: 0,
    filteredRows: 0,
    offset: 0,
    limit: 100,
    isLoadingRows: false,
    isLoadingDatasets: false,

    searchQuery: '',
    sortConditions: [],
    filterConditions: [],
    columnValueFilters: {},

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
    isEditStepModalOpen: false,
    editingStep: null,

    // Connections & Queries
    queries: loadStoredQueries(),
    activeQueryId: null,
    datasetPipelines: loadStoredPipelines(),

    activeTab: 'applied',
    isLeftPanelOpen: true,
    isRightPanelOpen: true,

    loadDatasets: async () => {
      set({ isLoadingDatasets: true });
      try {
        const datasets = await api.listDatasets();
        // Clean up any stored queries whose source dataset no longer exists
        const validIds = new Set(datasets.map((d) => d.id));
        const filteredQueries = get().queries.filter((q) => validIds.has(q.datasetId));
        set({ datasets, queries: filteredQueries, isLoadingDatasets: false });
        if (datasets.length > 0 && !get().selectedDataset) {
          await get().selectDataset(datasets[0].id);
        }
      } catch {
        set({ isLoadingDatasets: false });
      }
    },

    selectDataset: async (datasetId: string) => {
      // Save current dataset/query pipeline before switching so steps are never lost
      saveCurrentPipelineContext(true);

      const ds = get().datasets.find((d) => d.id === datasetId);
      if (!ds) return;

      // Check if this dataset has an existing QueryConnection or saved pipeline state
      const matchingQuery = get().queries.find((q) => q.datasetId === datasetId);
      const savedPipeline = matchingQuery || get().datasetPipelines[datasetId];

      const restoredSteps = savedPipeline ? savedPipeline.steps : [];
      const restoredUndo = savedPipeline ? savedPipeline.undoStack : [];
      const restoredRedo = savedPipeline ? savedPipeline.redoStack : [];
      const restoredActiveIdx = savedPipeline ? savedPipeline.activeStepIndex : null;
      const restoredSql = savedPipeline ? savedPipeline.compiledSql : '';
      const restoredSummaries = savedPipeline ? savedPipeline.stepSummaries : [];

      set({
        selectedDataset: ds,
        activeQueryId: matchingQuery ? matchingQuery.id : null,
        columns: ds.schema_metadata,
        offset: 0,
        searchQuery: '',
        sortConditions: [],
        filterConditions: [],
        columnValueFilters: {},
        selectedColumnProfile: null,
        steps: restoredSteps,
        activeStepIndex: restoredActiveIdx,
        undoStack: restoredUndo,
        redoStack: restoredRedo,
        compiledSql: restoredSql,
        stepSummaries: restoredSummaries,
      });
      await get().fetchRows(0);
    },

    addConnectionQuery: async (datasetId: string, customName?: string) => {
      saveCurrentPipelineContext(true);

      const { datasets, queries, datasetPipelines, selectedDataset, steps, undoStack, redoStack, compiledSql, stepSummaries } = get();
      const ds = datasets.find((d) => d.id === datasetId);
      if (!ds) return null;

      // Check if user already has a connection for this dataset and no customName was given
      const existingSameDataset = queries.filter((q) => q.datasetId === datasetId);
      const queryName =
        customName ||
        (existingSameDataset.length === 0
          ? ds.name
          : `${ds.name} (${existingSameDataset.length + 1})`);

      // Inherit current steps if adding from the active dataset or saved pipeline
      const isCurrentDs = selectedDataset?.id === datasetId;
      const saved = datasetPipelines[datasetId];
      const initialSteps = isCurrentDs ? [...steps] : saved ? [...saved.steps] : [];
      const initialUndo = isCurrentDs ? [...undoStack] : saved ? [...saved.undoStack] : [];
      const initialRedo = isCurrentDs ? [...redoStack] : saved ? [...saved.redoStack] : [];
      const initialSql = isCurrentDs ? compiledSql : saved ? saved.compiledSql : '';
      const initialSummaries = isCurrentDs ? [...stepSummaries] : saved ? [...saved.stepSummaries] : [];

      const newQuery: QueryConnection = {
        id: crypto.randomUUID(),
        name: queryName,
        datasetId: ds.id,
        datasetName: ds.name,
        steps: initialSteps,
        undoStack: initialUndo,
        redoStack: initialRedo,
        activeStepIndex: null,
        compiledSql: initialSql,
        stepSummaries: initialSummaries,
        updatedAt: new Date().toISOString(),
      };

      const nextQueries = [newQuery, ...queries];
      set({
        queries: nextQueries,
        activeQueryId: newQuery.id,
        selectedDataset: ds,
        steps: initialSteps,
        undoStack: initialUndo,
        redoStack: initialRedo,
        activeStepIndex: null,
        compiledSql: initialSql,
        stepSummaries: initialSummaries,
      });
      persistConnectionsState(nextQueries, get().datasetPipelines);
      await get().fetchRows(0);
      return newQuery;
    },

    selectConnectionQuery: async (queryId: string) => {
      saveCurrentPipelineContext(false);

      const { queries, datasets } = get();
      const targetQuery = queries.find((q) => q.id === queryId);
      if (!targetQuery) return;

      const ds = datasets.find((d) => d.id === targetQuery.datasetId);
      if (!ds) return;

      set({
        selectedDataset: ds,
        activeQueryId: targetQuery.id,
        columns: ds.schema_metadata,
        offset: 0,
        searchQuery: '',
        sortConditions: [],
        filterConditions: [],
        columnValueFilters: {},
        selectedColumnProfile: null,
        steps: targetQuery.steps || [],
        activeStepIndex: targetQuery.activeStepIndex ?? null,
        undoStack: targetQuery.undoStack || [],
        redoStack: targetQuery.redoStack || [],
        compiledSql: targetQuery.compiledSql || '',
        stepSummaries: targetQuery.stepSummaries || [],
      });
      await get().fetchRows(0);
    },

    renameConnectionQuery: (queryId: string, newName: string) => {
      const trimmed = newName.trim();
      if (!trimmed) return;
      const nextQueries = get().queries.map((q) =>
        q.id === queryId ? { ...q, name: trimmed, updatedAt: new Date().toISOString() } : q
      );
      set({ queries: nextQueries });
      persistConnectionsState(nextQueries, get().datasetPipelines);
    },

    duplicateConnectionQuery: async (queryId: string) => {
      saveCurrentPipelineContext(false);
      const { queries } = get();
      const source = queries.find((q) => q.id === queryId);
      if (!source) return;

      const duplicated: QueryConnection = {
        ...JSON.parse(JSON.stringify(source)),
        id: crypto.randomUUID(),
        name: `${source.name} (Copy)`,
        updatedAt: new Date().toISOString(),
      };
      const nextQueries = [duplicated, ...queries];
      set({ queries: nextQueries });
      persistConnectionsState(nextQueries, get().datasetPipelines);
      await get().selectConnectionQuery(duplicated.id);
    },

    deleteConnectionQuery: (queryId: string) => {
      const { queries, activeQueryId } = get();
      const nextQueries = queries.filter((q) => q.id !== queryId);
      set({
        queries: nextQueries,
        activeQueryId: activeQueryId === queryId ? null : activeQueryId,
      });
      persistConnectionsState(nextQueries, get().datasetPipelines);
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
        const remainingQueries = state.queries.filter((q) => q.datasetId !== id);
        const nextPipelines = { ...state.datasetPipelines };
        delete nextPipelines[id];
        persistConnectionsState(remainingQueries, nextPipelines);

        const newSelected =
          state.selectedDataset?.id === id ? remaining[0] || null : state.selectedDataset;
        return {
          datasets: remaining,
          queries: remainingQueries,
          datasetPipelines: nextPipelines,
          selectedDataset: newSelected,
          columns: newSelected ? newSelected.schema_metadata : [],
          rows: newSelected ? state.rows : [],
          allRows: newSelected ? state.allRows : [],
          steps: [],
          activeStepIndex: null,
          undoStack: [],
          redoStack: [],
        };
      });
      if (get().selectedDataset) {
        await get().selectDataset(get().selectedDataset!.id);
      }
    },

    fetchRows: async (newOffset?: number) => {
      const { selectedDataset, limit, sortConditions, filterConditions, searchQuery, steps } = get();
      if (!selectedDataset) return;

      const currentOffset = newOffset !== undefined ? newOffset : get().offset;
      if (newOffset !== undefined) {
        set({ offset: currentOffset });
      }

      if (steps.length > 0) {
        await get().runPipelinePreview();
        return;
      }

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
          allRows: res.all_rows || res.rows,
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

    setColumnSort: (column: string, direction: 'asc' | 'desc' | null) => {
      const next: SortCondition[] = direction ? [{ column, direction }] : [];
      set({ sortConditions: next });
      get().fetchRows(0);
    },

    setColumnValueFilter: (column: string, values: string[] | null) => {
      const nextMap = { ...get().columnValueFilters };
      if (values === null) {
        delete nextMap[column];
      } else {
        nextMap[column] = values;
      }
      const nextConditions: FilterCondition[] = Object.entries(nextMap).map(([col, vals]) => ({
        column: col,
        operator: 'in',
        value: vals,
      }));
      set({
        columnValueFilters: nextMap,
        filterConditions: nextConditions,
      });
      get().fetchRows(0);
    },

    clearColumnValueFilters: () => {
      set({
        columnValueFilters: {},
        filterConditions: [],
      });
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
      const {
        selectedDataset,
        steps,
        activeStepIndex,
        offset,
        limit,
        sortConditions,
        filterConditions,
        searchQuery,
      } = get();
      if (!selectedDataset) return;

      const stepsToRun =
        activeStepIndex !== null ? steps.slice(0, activeStepIndex + 1) : steps;

      set({ isLoadingRows: true });
      try {
        const res = await api.previewPipeline(selectedDataset.id, stepsToRun, {
          offset,
          limit,
          sort: sortConditions,
          filters: filterConditions,
          search: searchQuery,
        });
        set({
          rows: res.rows,
          allRows: res.all_rows || res.rows,
          columns: res.columns,
          totalRows: res.total_rows,
          filteredRows: res.filtered_rows,
          compiledSql: res.compiled_sql,
          stepSummaries: res.steps,
          isLoadingRows: false,
        });
        saveCurrentPipelineContext(true);
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
      saveCurrentPipelineContext(true);
      await get().runPipelinePreview();
    },

    setPipelineSteps: async (newSteps: StepDefinition[]) => {
      const safeSteps = Array.isArray(newSteps) ? newSteps : [];
      const currentSteps = get().steps || [];
      set((state) => ({
        undoStack: [...state.undoStack, currentSteps],
        redoStack: [],
        steps: safeSteps,
        activeStepIndex: null,
        activeTab: 'applied',
      }));
      saveCurrentPipelineContext(true);
      if (safeSteps.length === 0) {
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
      saveCurrentPipelineContext(false);
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
      saveCurrentPipelineContext(true);
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
      saveCurrentPipelineContext(true);
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
      saveCurrentPipelineContext(true);
      await get().runPipelinePreview();
    },

    selectStep: async (index: number | null) => {
      set({ activeStepIndex: index, activeTab: index !== null ? 'details' : 'applied' });
      saveCurrentPipelineContext(false);
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
      saveCurrentPipelineContext(false);
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
      saveCurrentPipelineContext(true);
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

    openEditStepModal: (step: StepDefinition) => {
      set({
        isEditStepModalOpen: true,
        editingStep: step,
      });
    },

    closeEditStepModal: () => {
      set({
        isEditStepModalOpen: false,
        editingStep: null,
      });
    },

    updateStep: async (stepId: string, updatedStep: Partial<StepDefinition>) => {
      const currentSteps = get().steps;
      const nextSteps = currentSteps.map((s) =>
        s.id === stepId ? { ...s, ...updatedStep, id: stepId } : s
      );
      set((state) => ({
        undoStack: [...state.undoStack, currentSteps],
        redoStack: [],
        steps: nextSteps,
        isEditStepModalOpen: false,
        isStepWizardOpen: false,
        editingStep: null,
      }));
      saveCurrentPipelineContext(true);
      await get().runPipelinePreview();
    },
  };
});

if (typeof window !== 'undefined') {
  (window as any).__STEPSHEET_STORE__ = useWorkbenchStore;
}

