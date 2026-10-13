import { storage } from '../utils/storage';
import { StepDefinition } from '../types/steps';

const isFileProtocol =
  typeof window !== 'undefined' && window.location?.protocol === 'file:';

const API_BASE = isFileProtocol ? 'http://127.0.0.1:8000/api/v1' : '/api/v1';

function getAuthHeader(): Record<string, string> {
  const token = storage.get('stepsheet_access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface ExportJobCreatePayload {
  project_id: string;
  dataset_id: string;
  format: string; // 'csv' | 'parquet' | 'json' | 'xlsx_values' | 'packaged_workbook' | 'pdf' | 'pptx' | 'powerbi_starter' | 'share_pack' | 'code'
  row_scope?: string; // 'all' | 'preview' | 'custom'
  row_limit?: number;
  excluded_columns?: string[];
  include_lineage?: boolean;
  include_quality?: boolean;
  include_lookups?: boolean;
  include_dictionary?: boolean;
  include_visuals?: boolean;
  options?: Record<string, any>;
  steps?: StepDefinition[];
}

export interface ExportFileItem {
  file_id: string;
  filename: string;
  file_type: string;
  size_bytes: number;
  download_url: string;
}

export interface ExportJobStatus {
  job_id: string;
  project_id: string;
  dataset_id: string;
  format: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress_pct: number;
  message?: string;
  files: ExportFileItem[];
  created_at: string;
  completed_at?: string;
  total_rows?: number;
  error_message?: string;
}

export const exportShareApi = {
  async createJob(payload: ExportJobCreatePayload): Promise<ExportJobStatus> {
    const res = await fetch(`${API_BASE}/exports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to create export job');
    }
    return res.json();
  },

  async getJob(jobId: string): Promise<ExportJobStatus> {
    const res = await fetch(`${API_BASE}/exports/${jobId}`, {
      headers: getAuthHeader(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to fetch export job status');
    }
    return res.json();
  },

  async cancelJob(jobId: string): Promise<ExportJobStatus> {
    const res = await fetch(`${API_BASE}/exports/${jobId}`, {
      method: 'DELETE',
      headers: getAuthHeader(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to cancel export job');
    }
    return res.json();
  },

  async getHistory(projectId: string): Promise<ExportJobStatus[]> {
    const res = await fetch(`${API_BASE}/exports/history/${projectId}`, {
      headers: getAuthHeader(),
    });
    if (!res.ok) {
      return [];
    }
    return res.json();
  },

  getFileDownloadUrl(jobId: string, fileId: string): string {
    return `${API_BASE}/exports/${jobId}/files/${fileId}`;
  },

  async downloadFile(jobId: string, fileId: string, filename: string): Promise<void> {
    const url = this.getFileDownloadUrl(jobId, fileId);
    const res = await fetch(url, { headers: getAuthHeader() });
    if (!res.ok) {
      throw new Error(`Failed to download file ${filename}`);
    }
    const blob = await res.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(blobUrl);
    document.body.removeChild(a);
  },

  /**
   * Polls job until completed, failed or cancelled.
   */
  async pollJobUntilDone(
    jobId: string,
    onProgress?: (job: ExportJobStatus) => void,
    intervalMs = 500,
    maxWaitMs = 60000
  ): Promise<ExportJobStatus> {
    const startTime = Date.now();
    while (Date.now() - startTime < maxWaitMs) {
      const job = await this.getJob(jobId);
      if (onProgress) onProgress(job);

      if (job.status === 'completed') {
        return job;
      }
      if (job.status === 'failed') {
        throw new Error(job.error_message || 'Export job failed');
      }
      if (job.status === 'cancelled') {
        throw new Error('Export job was cancelled');
      }

      await new Promise((r) => setTimeout(r, intervalMs));
    }
    throw new Error('Export job timed out');
  },
};
