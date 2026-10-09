import { create } from 'zustand';
import {
  Dataset,
  ColumnSchema,
  ColumnProfile,
  DatasetProfileResponse,
  SortCondition,
  FilterCondition,
} from '../types';
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

  activeTab: 'catalog' | 'applied' | 'details';
  isLeftPanelOpen: boolean;
  isRightPanelOpen: boolean;

  // Actions
  loadDatasets: () => Promise<void>;
  selectDataset: (datasetId: string) => Promise<void>;
  uploadDataset: (file: File, name?: string) => Promise<Dataset>;
  deleteDataset: (id: string) => Promise<void>;
  fetchRows: (newOffset?: number) => Promise<void>;
  setSearch: (query: string) => void;
  toggleSort: (column: string) => void;
  openColumnProfile: (columnName: string) => Promise<void>;
  closeColumnProfile: () => void;
  setActiveTab: (tab: 'catalog' | 'applied' | 'details') => void;
  toggleLeftPanel: () => void;
  toggleRightPanel: () => void;
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

  activeTab: 'applied',
  isLeftPanelOpen: true,
  isRightPanelOpen: true,

  loadDatasets: async () => {
    set({ isLoadingDatasets: true });
    try {
      const datasets = await api.listDatasets();
      set({ datasets, isLoadingDatasets: false });
      // Auto-select first dataset if none selected
      if (datasets.length > 0 && !get().selectedDataset) {
        get().selectDataset(datasets[0].id);
      }
    } catch (err) {
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
    });
    await get().fetchRows(0);
  },

  uploadDataset: async (file: File, name?: string) => {
    const ds = await api.uploadDataset(file, name);
    set((state) => ({ datasets: [ds, ...state.datasets] }));
    await get().selectDataset(ds.id);
    return ds;
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
      };
    });
    if (get().selectedDataset) {
      await get().fetchRows(0);
    }
  },

  fetchRows: async (newOffset?: number) => {
    const { selectedDataset, limit, sortConditions, filterConditions, searchQuery } = get();
    if (!selectedDataset) return;
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
}));
