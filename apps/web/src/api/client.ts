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
import { localEngine } from './localEngine';

const isFileProtocol =
  typeof window !== 'undefined' && window.location?.protocol === 'file:';

const API_BASE = isFileProtocol ? 'http://127.0.0.1:8000/api/v1' : '/api/v1';

function getAuthHeader(): Record<string, string> {
  const token = storage.get('stepsheet_access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function withFallback<T>(
  remoteCall: () => Promise<T>,
  localCall: () => Promise<T>
): Promise<T> {
  if (isFileProtocol && (window as any).__STEPSHEET_FORCE_LOCAL__ !== false) {
    return localCall();
  }
  try {
    return await remoteCall();
  } catch {
    return localCall();
  }
}

export const api = {
  // Auth
  async join(data: { email: string; password: string; full_name?: string }): Promise<AuthResponse> {
    return withFallback(
      async () => {
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
      () => localEngine.join(data)
    );
  },

  async login(data: { email: string; password: string }): Promise<AuthResponse> {
    return withFallback(
      async () => {
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
      () => localEngine.login(data)
    );
  },

  async getMe() {
    return withFallback(
      async () => {
        const res = await fetch(`${API_BASE}/auth/me`, {
          headers: { ...getAuthHeader() },
        });
        if (!res.ok) throw new Error('Unauthorized');
        return res.json();
      },
      () => localEngine.getMe()
    );
  },

  // Datasets
  async listDatasets(): Promise<Dataset[]> {
    return withFallback(
      async () => {
        const res = await fetch(`${API_BASE}/datasets`, {
          headers: { ...getAuthHeader() },
        });
        if (!res.ok) throw new Error('Failed to load datasets');
        return res.json();
      },
      () => localEngine.listDatasets()
    );
  },

  async getDataset(id: string): Promise<Dataset> {
    return withFallback(
      async () => {
        const res = await fetch(`${API_BASE}/datasets/${id}`, {
          headers: { ...getAuthHeader() },
        });
        if (!res.ok) throw new Error('Failed to load dataset details');
        return res.json();
      },
      () => localEngine.getDataset(id)
    );
  },

  async uploadDataset(file: File, name?: string): Promise<Dataset> {
    return withFallback(
      async () => {
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
      () => localEngine.uploadDataset(file, name)
    );
  },

  async loadSampleDatasets(): Promise<Dataset[]> {
    return withFallback(
      async () => {
        const res = await fetch(`${API_BASE}/datasets/load-samples`, {
          method: 'POST',
          headers: { ...getAuthHeader() },
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || 'Failed to load sample datasets');
        }
        return res.json();
      },
      () => localEngine.loadSampleDatasets()
    );
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
    return withFallback(
      async () => {
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
      () => localEngine.getRows(datasetId, params)
    );
  },

  async deleteDataset(id: string): Promise<void> {
    return withFallback(
      async () => {
        const res = await fetch(`${API_BASE}/datasets/${id}`, {
          method: 'DELETE',
          headers: { ...getAuthHeader() },
        });
        if (!res.ok) throw new Error('Failed to delete dataset');
      },
      () => localEngine.deleteDataset(id)
    );
  },

  // Profiling
  async getProfile(datasetId: string): Promise<DatasetProfileResponse> {
    return withFallback(
      async () => {
        const res = await fetch(`${API_BASE}/profiling/${datasetId}`, {
          headers: { ...getAuthHeader() },
        });
        if (!res.ok) throw new Error('Failed to fetch profiling statistics');
        return res.json();
      },
      () => localEngine.getProfile(datasetId)
    );
  },

  async getColumnProfile(datasetId: string, columnName: string): Promise<ColumnProfile> {
    return withFallback(
      async () => {
        const res = await fetch(
          `${API_BASE}/profiling/${datasetId}/column/${encodeURIComponent(columnName)}`,
          {
            headers: { ...getAuthHeader() },
          }
        );
        if (!res.ok) throw new Error('Failed to fetch column profile');
        return res.json();
      },
      () => localEngine.getColumnProfile(datasetId, columnName)
    );
  },

  // Pipeline Preview & Execution
  async previewPipeline(
    datasetId: string,
    steps: any[],
    params: { offset?: number; limit?: number } = {}
  ): Promise<any> {
    return withFallback(
      async () => {
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
      () => localEngine.previewPipeline(datasetId, steps, params)
    );
  },

  // Joins & Lookups
  async checkJoinHealth(data: {
    left_dataset_id: string;
    right_dataset_id: string;
    key_pairs: any[];
    join_type: string;
  }): Promise<any> {
    return withFallback(
      async () => {
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
      () => localEngine.checkJoinHealth(data)
    );
  },

  async suggestJoinKeys(leftId: string, rightId: string): Promise<any> {
    return withFallback(
      async () => {
        const res = await fetch(`${API_BASE}/joins/suggest-keys/${leftId}/${rightId}`, {
          headers: { ...getAuthHeader() },
        });
        if (!res.ok) throw new Error('Failed to suggest keys');
        return res.json();
      },
      () => localEngine.suggestJoinKeys(leftId, rightId)
    );
  },

  // AI Step Assistant
  async generateAiStep(datasetId: string, prompt: string): Promise<any> {
    return withFallback(
      async () => {
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
      () => localEngine.generateAiStep(datasetId, prompt)
    );
  },

  async getAiStatus(): Promise<any> {
    return withFallback(
      async () => {
        const res = await fetch(`${API_BASE}/ai/status`, {
          headers: { ...getAuthHeader() },
        });
        if (!res.ok) throw new Error('Failed to get AI status');
        return res.json();
      },
      () => localEngine.getAiStatus()
    );
  },

  // Data Integrity & Quality
  async runQualityCheck(datasetId: string, rules: any[], steps: any[] = []): Promise<any> {
    return withFallback(
      async () => {
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
      () => localEngine.runQualityCheck(datasetId, rules, steps)
    );
  },

  async runQuickAudit(datasetId: string): Promise<any> {
    return withFallback(
      async () => {
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
      () => localEngine.runQuickAudit(datasetId)
    );
  },

  async downloadFailingRows(datasetId: string, rule: any, steps: any[] = []): Promise<Blob> {
    return withFallback(
      async () => {
        const res = await fetch(`${API_BASE}/quality/export-failing-rows`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
          body: JSON.stringify({ dataset_id: datasetId, rules: [rule], pipeline_steps: steps }),
        });
        if (!res.ok) throw new Error('Failed to export failing rows');
        return res.blob();
      },
      () => localEngine.downloadFailingRows(datasetId, rule, steps)
    );
  },

  // Export & Full Runner
  async exportExcel(
    datasetId: string,
    steps: any[],
    includeFormulas = true,
    includeDocumentation = true
  ): Promise<Blob> {
    return withFallback(
      async () => {
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
      () => localEngine.exportExcel(datasetId, steps)
    );
  },

  async exportCsv(datasetId: string, steps: any[]): Promise<Blob> {
    return withFallback(
      async () => {
        const res = await fetch(`${API_BASE}/export/csv`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
          body: JSON.stringify({ dataset_id: datasetId, steps }),
        });
        if (!res.ok) throw new Error('Failed to export CSV');
        return res.blob();
      },
      () => localEngine.exportCsv(datasetId, steps)
    );
  },

  async exportParquet(datasetId: string, steps: any[]): Promise<Blob> {
    return withFallback(
      async () => {
        const res = await fetch(`${API_BASE}/export/parquet`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
          body: JSON.stringify({ dataset_id: datasetId, steps }),
        });
        if (!res.ok) throw new Error('Failed to export Parquet');
        return res.blob();
      },
      () => localEngine.exportParquet(datasetId, steps)
    );
  },

  async exportJson(datasetId: string, steps: any[]): Promise<Blob> {
    return withFallback(
      async () => {
        const res = await fetch(`${API_BASE}/export/json`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
          body: JSON.stringify({ dataset_id: datasetId, steps }),
        });
        if (!res.ok) throw new Error('Failed to export JSON');
        return res.blob();
      },
      () => localEngine.exportJson(datasetId, steps)
    );
  },

  async exportCode(datasetId: string, steps: any[]): Promise<any> {
    return withFallback(
      async () => {
        const res = await fetch(`${API_BASE}/export/code`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
          body: JSON.stringify({ dataset_id: datasetId, steps }),
        });
        if (!res.ok) throw new Error('Failed to export code');
        return res.json();
      },
      () => localEngine.exportCode(datasetId, steps)
    );
  },

  async runFullPipeline(datasetId: string, steps: any[]): Promise<any> {
    return withFallback(
      async () => {
        const res = await fetch(`${API_BASE}/export/run-full`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
          body: JSON.stringify({ dataset_id: datasetId, steps }),
        });
        if (!res.ok) throw new Error('Failed to run full pipeline');
        return res.json();
      },
      () => localEngine.runFullPipeline(datasetId, steps)
    );
  },

  async exportPipelineSpec(datasetId: string, steps: any[]): Promise<Blob> {
    return withFallback(
      async () => {
        const res = await fetch(`${API_BASE}/export/pipeline-spec`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
          body: JSON.stringify({ dataset_id: datasetId, steps }),
        });
        if (!res.ok) throw new Error('Failed to export pipeline specification');
        return res.blob();
      },
      () => localEngine.exportPipelineSpec(datasetId, steps)
    );
  },

  // Templates & Column Mapping
  async listTemplates(): Promise<any[]> {
    return withFallback(
      async () => {
        const res = await fetch(`${API_BASE}/templates`, {
          headers: { ...getAuthHeader() },
        });
        if (!res.ok) throw new Error('Failed to list templates');
        return res.json();
      },
      () => localEngine.listTemplates()
    );
  },

  async createTemplate(templateData: any): Promise<any> {
    return withFallback(
      async () => {
        const res = await fetch(`${API_BASE}/templates`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
          body: JSON.stringify(templateData),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || 'Failed to save template');
        }
        return res.json();
      },
      () => localEngine.createTemplate(templateData)
    );
  },

  async suggestColumnMapping(templateId: string, datasetId: string): Promise<any> {
    return withFallback(
      async () => {
        const res = await fetch(`${API_BASE}/templates/${templateId}/suggest-mapping`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
          body: JSON.stringify({ dataset_id: datasetId }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || 'Failed to suggest column mapping');
        }
        return res.json();
      },
      () => localEngine.suggestColumnMapping(templateId, datasetId)
    );
  },

  async applyTemplate(
    templateId: string,
    datasetId: string,
    columnMapping: Record<string, string>
  ): Promise<any> {
    return withFallback(
      async () => {
        const res = await fetch(`${API_BASE}/templates/${templateId}/apply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
          body: JSON.stringify({ dataset_id: datasetId, column_mapping: columnMapping }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || 'Failed to apply template');
        }
        return res.json();
      },
      () => localEngine.applyTemplate(templateId, datasetId, columnMapping)
    );
  },

  // Project Versioning & Step Diff
  async listVersions(projectId: string): Promise<any[]> {
    return withFallback(
      async () => {
        const res = await fetch(`${API_BASE}/projects/${projectId}/versions`, {
          headers: { ...getAuthHeader() },
        });
        if (!res.ok) throw new Error('Failed to list versions');
        return res.json();
      },
      () => localEngine.listVersions(projectId)
    );
  },

  async createVersion(
    projectId: string,
    message: string,
    steps: any[],
    datasetId?: string
  ): Promise<any> {
    return withFallback(
      async () => {
        const res = await fetch(`${API_BASE}/projects/${projectId}/versions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
          body: JSON.stringify({ message, steps, dataset_id: datasetId }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || 'Failed to create version');
        }
        return res.json();
      },
      () => localEngine.createVersion(projectId, message, steps, datasetId)
    );
  },

  async diffVersions(projectId: string, fromVersion: number, toVersion: number): Promise<any> {
    return withFallback(
      async () => {
        const res = await fetch(
          `${API_BASE}/projects/${projectId}/versions/diff?from_version=${fromVersion}&to_version=${toVersion}`,
          { headers: { ...getAuthHeader() } }
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || 'Failed to diff versions');
        }
        return res.json();
      },
      () => localEngine.diffVersions(projectId, fromVersion, toVersion)
    );
  },

  async restoreVersion(projectId: string, versionId: string): Promise<any> {
    return withFallback(
      async () => {
        const res = await fetch(
          `${API_BASE}/projects/${projectId}/versions/${versionId}/restore`,
          {
            method: 'POST',
            headers: { ...getAuthHeader() },
          }
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || 'Failed to restore version');
        }
        return res.json();
      },
      () => localEngine.restoreVersion(projectId, versionId)
    );
  },

  // Sharing & Access Control
  async createShare(
    projectId: string,
    role: string = 'viewer',
    expiresInDays?: number
  ): Promise<any> {
    return withFallback(
      async () => {
        const res = await fetch(`${API_BASE}/projects/${projectId}/shares`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
          body: JSON.stringify({ role, expires_in_days: expiresInDays }),
        });
        if (!res.ok) throw new Error('Failed to create share link');
        return res.json();
      },
      () => localEngine.createShare(projectId, role, expiresInDays)
    );
  },

  async listShares(projectId: string): Promise<any[]> {
    return withFallback(
      async () => {
        const res = await fetch(`${API_BASE}/projects/${projectId}/shares`, {
          headers: { ...getAuthHeader() },
        });
        if (!res.ok) throw new Error('Failed to list shares');
        return res.json();
      },
      () => localEngine.listShares(projectId)
    );
  },

  async revokeShare(projectId: string, shareId: string): Promise<void> {
    return withFallback(
      async () => {
        const res = await fetch(`${API_BASE}/projects/${projectId}/shares/${shareId}`, {
          method: 'DELETE',
          headers: { ...getAuthHeader() },
        });
        if (!res.ok) throw new Error('Failed to revoke share link');
      },
      () => localEngine.revokeShare(projectId, shareId)
    );
  },

  async getShareAccess(token: string): Promise<any> {
    return withFallback(
      async () => {
        const res = await fetch(`${API_BASE}/share/${token}`);
        if (!res.ok) throw new Error('Invalid or expired share link');
        return res.json();
      },
      () => localEngine.getShareAccess(token)
    );
  },

  // Audit Trail
  async listAuditLogs(
    projectId: string,
    action?: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<any> {
    return withFallback(
      async () => {
        let url = `${API_BASE}/projects/${projectId}/audit?limit=${limit}&offset=${offset}`;
        if (action) url += `&action=${encodeURIComponent(action)}`;
        const res = await fetch(url, { headers: { ...getAuthHeader() } });
        if (!res.ok) throw new Error('Failed to fetch audit logs');
        return res.json();
      },
      () => localEngine.listAuditLogs(projectId, action)
    );
  },
};
