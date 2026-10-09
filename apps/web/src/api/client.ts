import {
  AuthResponse,
  Dataset,
  DatasetRowsResponse,
  DatasetProfileResponse,
  ColumnProfile,
  SortCondition,
  FilterCondition,
} from '../types';
import { storage } from '../utils/storage';

const API_BASE = '/api/v1';

function getAuthHeader(): Record<string, string> {
  const token = storage.get('stepsheet_access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export const api = {
  // Auth
  async join(data: { email: string; password: string; full_name?: string }): Promise<AuthResponse> {
    const res = await fetch(`${API_BASE}/auth/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to sign up');
    }
    return res.json();
  },

  async login(data: { email: string; password: string }): Promise<AuthResponse> {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to sign in');
    }
    return res.json();
  },

  async getMe() {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { ...getAuthHeader() },
    });
    if (!res.ok) throw new Error('Unauthorized');
    return res.json();
  },

  // Datasets
  async listDatasets(): Promise<Dataset[]> {
    const res = await fetch(`${API_BASE}/datasets`, {
      headers: { ...getAuthHeader() },
    });
    if (!res.ok) throw new Error('Failed to load datasets');
    return res.json();
  },

  async getDataset(id: string): Promise<Dataset> {
    const res = await fetch(`${API_BASE}/datasets/${id}`, {
      headers: { ...getAuthHeader() },
    });
    if (!res.ok) throw new Error('Failed to load dataset details');
    return res.json();
  },

  async uploadDataset(file: File, name?: string): Promise<Dataset> {
    const formData = new FormData();
    formData.append('file', file);
    if (name) formData.append('name', name);

    const res = await fetch(`${API_BASE}/datasets/upload`, {
      method: 'POST',
      headers: { ...getAuthHeader() },
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to upload dataset');
    }
    return res.json();
  },

  async getRows(
    datasetId: string,
    params: {
      offset?: number;
      limit?: number;
      sort?: SortCondition[];
      filters?: FilterCondition[];
      search?: string;
    }
  ): Promise<DatasetRowsResponse> {
    const res = await fetch(`${API_BASE}/datasets/${datasetId}/rows`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify({
        offset: params.offset ?? 0,
        limit: params.limit ?? 100,
        sort: params.sort,
        filters: params.filters,
        search: params.search || undefined,
      }),
    });
    if (!res.ok) throw new Error('Failed to fetch dataset rows');
    return res.json();
  },

  async deleteDataset(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/datasets/${id}`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() },
    });
    if (!res.ok) throw new Error('Failed to delete dataset');
  },

  // Profiling
  async getProfile(datasetId: string): Promise<DatasetProfileResponse> {
    const res = await fetch(`${API_BASE}/profiling/${datasetId}`, {
      headers: { ...getAuthHeader() },
    });
    if (!res.ok) throw new Error('Failed to fetch profiling statistics');
    return res.json();
  },

  async getColumnProfile(datasetId: string, columnName: string): Promise<ColumnProfile> {
    const res = await fetch(`${API_BASE}/profiling/${datasetId}/column/${encodeURIComponent(columnName)}`, {
      headers: { ...getAuthHeader() },
    });
    if (!res.ok) throw new Error('Failed to fetch column profile');
    return res.json();
  },

  // Pipeline Preview & Execution
  async previewPipeline(
    datasetId: string,
    steps: any[],
    params: { offset?: number; limit?: number } = {}
  ): Promise<any> {
    const res = await fetch(`${API_BASE}/pipelines/preview`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify({
        dataset_id: datasetId,
        steps,
        offset: params.offset ?? 0,
        limit: params.limit ?? 100,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to preview pipeline');
    }
    return res.json();
  },

  // Joins & Lookups
  async checkJoinHealth(data: {
    left_dataset_id: string;
    right_dataset_id: string;
    key_pairs: any[];
    join_type: string;
  }): Promise<any> {
    const res = await fetch(`${API_BASE}/joins/health-check`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Health check failed');
    }
    return res.json();
  },

  async suggestJoinKeys(leftId: string, rightId: string): Promise<any> {
    const res = await fetch(`${API_BASE}/joins/suggest-keys/${leftId}/${rightId}`, {
      headers: { ...getAuthHeader() },
    });
    if (!res.ok) throw new Error('Failed to suggest keys');
    return res.json();
  },

  // AI Step Assistant
  async generateAiStep(datasetId: string, prompt: string): Promise<any> {
    const res = await fetch(`${API_BASE}/ai/generate-step`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify({ dataset_id: datasetId, prompt }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to generate step with AI');
    }
    return res.json();
  },

  async getAiStatus(): Promise<any> {
    const res = await fetch(`${API_BASE}/ai/status`, {
      headers: { ...getAuthHeader() },
    });
    if (!res.ok) throw new Error('Failed to get AI status');
    return res.json();
  },

  // Data Integrity & Quality
  async runQualityCheck(datasetId: string, rules: any[], steps: any[] = []): Promise<any> {
    const res = await fetch(`${API_BASE}/quality/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ dataset_id: datasetId, rules, pipeline_steps: steps }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Quality check failed');
    }
    return res.json();
  },

  async runQuickAudit(datasetId: string): Promise<any> {
    const res = await fetch(`${API_BASE}/quality/quick-audit/${datasetId}`, {
      method: 'POST',
      headers: { ...getAuthHeader() },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Quick audit failed');
    }
    return res.json();
  },

  async downloadFailingRows(datasetId: string, rule: any, steps: any[] = []): Promise<Blob> {
    const res = await fetch(`${API_BASE}/quality/export-failing-rows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ dataset_id: datasetId, rules: [rule], pipeline_steps: steps }),
    });
    if (!res.ok) throw new Error('Failed to export failing rows');
    return res.blob();
  },

  // Export & Full Runner
  async exportExcel(datasetId: string, steps: any[], includeFormulas = true, includeDocumentation = true): Promise<Blob> {
    const res = await fetch(`${API_BASE}/export/excel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({
        dataset_id: datasetId,
        steps,
        include_formulas: includeFormulas,
        include_documentation: includeDocumentation,
      }),
    });
    if (!res.ok) throw new Error('Failed to export Excel');
    return res.blob();
  },

  async exportCsv(datasetId: string, steps: any[]): Promise<Blob> {
    const res = await fetch(`${API_BASE}/export/csv`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ dataset_id: datasetId, steps }),
    });
    if (!res.ok) throw new Error('Failed to export CSV');
    return res.blob();
  },

  async exportParquet(datasetId: string, steps: any[]): Promise<Blob> {
    const res = await fetch(`${API_BASE}/export/parquet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ dataset_id: datasetId, steps }),
    });
    if (!res.ok) throw new Error('Failed to export Parquet');
    return res.blob();
  },

  async exportJson(datasetId: string, steps: any[]): Promise<Blob> {
    const res = await fetch(`${API_BASE}/export/json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ dataset_id: datasetId, steps }),
    });
    if (!res.ok) throw new Error('Failed to export JSON');
    return res.blob();
  },

  async exportCode(datasetId: string, steps: any[]): Promise<any> {
    const res = await fetch(`${API_BASE}/export/code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ dataset_id: datasetId, steps }),
    });
    if (!res.ok) throw new Error('Failed to export code');
    return res.json();
  },

  async runFullPipeline(datasetId: string, steps: any[]): Promise<any> {
    const res = await fetch(`${API_BASE}/export/run-full`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ dataset_id: datasetId, steps }),
    });
    if (!res.ok) throw new Error('Failed to run full pipeline');
    return res.json();
  },

  async exportPipelineSpec(datasetId: string, steps: any[]): Promise<Blob> {
    const res = await fetch(`${API_BASE}/export/pipeline-spec`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ dataset_id: datasetId, steps }),
    });
    if (!res.ok) throw new Error('Failed to export pipeline specification');
    return res.blob();
  },
};

