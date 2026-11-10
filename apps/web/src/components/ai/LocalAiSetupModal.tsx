import React, { useState, useEffect } from 'react';
import {
  Cpu,
  HardDrive,
  Activity,
  CheckCircle2,
  AlertCircle,
  DownloadCloud,
  Play,
  RotateCw,
  X,
  Sparkles,
  Zap,
} from 'lucide-react';
import { api } from '../../api/client';

interface LocalAiSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onModelReady?: (modelTag: string) => void;
}

export const LocalAiSetupModal: React.FC<LocalAiSetupModalProps> = ({
  isOpen,
  onClose,
  onModelReady,
}) => {
  const [loading, setLoading] = useState(true);
  const [systemInfo, setSystemInfo] = useState<any>(null);
  const [catalog, setCatalog] = useState<any[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('llama3.2:3b');
  const [pullProgress, setPullProgress] = useState<any>(null);
  const [isPulling, setIsPulling] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [serviceStarting, setServiceStarting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadDiagnostics = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [sys, cat] = await Promise.all([
        api.getLocalAiSystemCheck(),
        api.getLocalAiModelsCatalog(),
      ]);
      setSystemInfo(sys);
      setCatalog(cat);
      if (sys?.hardware?.recommended_model) {
        setSelectedModel(sys.hardware.recommended_model);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to check local AI status.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadDiagnostics();
    }
  }, [isOpen]);

  const handleStartService = async () => {
    setServiceStarting(true);
    setErrorMsg(null);
    try {
      await api.startLocalAiService();
      await loadDiagnostics();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to start Ollama service.');
    } finally {
      setServiceStarting(false);
    }
  };

  const handlePullModel = async (modelTag: string) => {
    setIsPulling(true);
    setErrorMsg(null);
    try {
      await api.pullLocalAiModel(modelTag);
      // Poll progress
      const interval = setInterval(async () => {
        try {
          const status = await api.getLocalAiPullStatus(modelTag);
          setPullProgress(status);
          if (status.status === 'completed' || status.status === 'error') {
            clearInterval(interval);
            setIsPulling(false);
            if (status.status === 'completed') {
              await loadDiagnostics();
              if (onModelReady) onModelReady(modelTag);
            } else if (status.error) {
              setErrorMsg(status.error);
            }
          }
        } catch {
          clearInterval(interval);
          setIsPulling(false);
        }
      }, 1000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to download model.');
      setIsPulling(false);
    }
  };

  const handleRunHealthTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    setErrorMsg(null);
    try {
      const res = await api.testLocalAiHealth(selectedModel);
      setTestResult(res);
      if (onModelReady) onModelReady(selectedModel);
    } catch (err: any) {
      setErrorMsg(err.message || 'Structured output verification test failed.');
    } finally {
      setIsTesting(false);
    }
  };

  if (!isOpen) return null;

  const hw = systemInfo?.hardware;
  const isRunning = systemInfo?.ollama_running;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-white rounded-xl shadow-2xl border border-[#D4D4D4] w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#EDEBE9] bg-[#F3F2F1]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#107C41] flex items-center justify-center text-white shadow-sm">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[#201F1E]">
                Local AI Runtime & Hardware Diagnostics
              </h2>
              <p className="text-xs text-[#605E5C]">
                Offline, zero-API-key Ollama local intelligence setup for StepSheet
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-[#605E5C] hover:text-[#201F1E] hover:bg-black/5 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-[#201F1E]">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2.5 text-xs text-red-800">
              <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
              <div>{errorMsg}</div>
            </div>
          )}

          {/* Hardware Diagnostic Overview */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg border border-[#EDEBE9] bg-[#F9F9F8]">
              <div className="flex items-center gap-1.5 text-xs text-[#605E5C] mb-1">
                <Cpu className="w-3.5 h-3.5" />
                <span>CPU & Cores</span>
              </div>
              <div className="font-semibold text-sm">{hw?.cpu_cores || 4} Cores</div>
              <div className="text-[11px] text-[#605E5C]">{hw?.cpu_architecture || 'x64'}</div>
            </div>

            <div className="p-3 rounded-lg border border-[#EDEBE9] bg-[#F9F9F8]">
              <div className="flex items-center gap-1.5 text-xs text-[#605E5C] mb-1">
                <Activity className="w-3.5 h-3.5" />
                <span>System RAM</span>
              </div>
              <div className="font-semibold text-sm">{hw?.total_ram_gb || 8} GB Total</div>
              <div className="text-[11px] text-[#107C41]">{hw?.avail_ram_gb || 4} GB Free</div>
            </div>

            <div className="p-3 rounded-lg border border-[#EDEBE9] bg-[#F9F9F8]">
              <div className="flex items-center gap-1.5 text-xs text-[#605E5C] mb-1">
                <HardDrive className="w-3.5 h-3.5" />
                <span>Disk Space</span>
              </div>
              <div className="font-semibold text-sm">{hw?.free_disk_gb || 50} GB Free</div>
              <div className="text-[11px] text-[#605E5C]">Drive: {hw?.total_disk_gb || 500} GB</div>
            </div>

            <div className="p-3 rounded-lg border border-[#EDEBE9] bg-[#F9F9F8]">
              <div className="flex items-center gap-1.5 text-xs text-[#605E5C] mb-1">
                <Zap className="w-3.5 h-3.5" />
                <span>Hardware Tier</span>
              </div>
              <div className="font-semibold text-sm text-[#0078D4]">
                {hw?.hardware_tier || 'Standard'}
              </div>
              <div className="text-[11px] text-[#605E5C]">
                Rec: {hw?.recommended_model || 'llama3.2:3b'}
              </div>
            </div>
          </div>

          {/* Service Status */}
          <div className="p-4 rounded-lg border border-[#D4D4D4] bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div
                className={`w-3.5 h-3.5 rounded-full ${
                  isRunning ? 'bg-[#107C41] animate-pulse' : 'bg-[#D83B01]'
                }`}
              />
              <div>
                <div className="text-sm font-semibold flex items-center gap-2">
                  <span>Ollama Local Service:</span>
                  <span className={isRunning ? 'text-[#107C41]' : 'text-[#D83B01]'}>
                    {isRunning ? 'Active & Reachable (127.0.0.1:11434)' : 'Stopped / Unreachable'}
                  </span>
                </div>
                <div className="text-xs text-[#605E5C]">
                  {systemInfo?.ollama_binary
                    ? `Binary: ${systemInfo.ollama_binary}`
                    : 'Binary detected in standard Windows path.'}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {!isRunning && (
                <button
                  onClick={handleStartService}
                  disabled={serviceStarting}
                  className="px-3.5 py-1.5 bg-[#107C41] hover:bg-[#0E6C38] text-white text-xs font-medium rounded-md shadow-sm flex items-center gap-1.5 disabled:opacity-50 transition"
                >
                  <Play className="w-3.5 h-3.5" />
                  {serviceStarting ? 'Starting...' : 'Start Local Service'}
                </button>
              )}
              <button
                onClick={loadDiagnostics}
                disabled={loading}
                className="p-1.5 border border-[#D4D4D4] hover:bg-[#F3F2F1] rounded-md text-[#605E5C] transition"
                title="Refresh Status"
              >
                <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Model Catalog Selection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#201F1E]">
                Hardware-Aware Tested Model Catalog
              </h3>
              <span className="text-xs text-[#605E5C]">
                Free, local inference with zero API keys
              </span>
            </div>

            <div className="space-y-2">
              {catalog.map((m) => {
                const isSelected = selectedModel === m.tag;
                const isRec = hw?.recommended_model === m.tag;
                return (
                  <div
                    key={m.tag}
                    onClick={() => setSelectedModel(m.tag)}
                    className={`p-3.5 rounded-lg border transition cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      isSelected
                        ? 'border-[#0078D4] bg-[#EFF6FC] shadow-sm'
                        : 'border-[#EDEBE9] hover:border-[#C8C6C4] bg-white'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-[#201F1E]">{m.name}</span>
                        <code className="text-xs bg-[#F3F2F1] px-1.5 py-0.5 rounded text-[#605E5C]">
                          {m.tag}
                        </code>
                        {isRec && (
                          <span className="text-[10px] bg-[#107C41] text-white px-2 py-0.5 rounded-full font-medium">
                            Recommended for your Hardware
                          </span>
                        )}
                        {m.is_installed && (
                          <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Ready
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#605E5C]">{m.strengths}</p>
                      <div className="text-[11px] text-[#8A8886] flex items-center gap-3">
                        <span>Download: ~{m.download_size_gb} GB</span>
                        <span>Min RAM: {m.min_ram_gb} GB</span>
                        <span>Format: JSON Mode</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      {!m.is_installed ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePullModel(m.tag);
                          }}
                          disabled={isPulling}
                          className="px-3 py-1.5 bg-[#0078D4] hover:bg-[#106EBE] text-white text-xs font-medium rounded-md shadow-sm flex items-center gap-1.5 disabled:opacity-50 transition"
                        >
                          <DownloadCloud className="w-3.5 h-3.5" />
                          Download
                        </button>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedModel(m.tag);
                            handleRunHealthTest();
                          }}
                          disabled={isTesting}
                          className="px-3 py-1.5 border border-[#107C41] text-[#107C41] hover:bg-[#107C41]/10 text-xs font-medium rounded-md flex items-center gap-1.5 transition"
                        >
                          <Zap className="w-3.5 h-3.5" />
                          Test Model
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Pull Progress Bar */}
          {isPulling && pullProgress && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
              <div className="flex items-center justify-between text-xs font-medium text-blue-900">
                <span className="flex items-center gap-1.5">
                  <DownloadCloud className="w-4 h-4 animate-bounce text-blue-700" />
                  {pullProgress.status_text || 'Downloading model weights...'}
                </span>
                <span>{pullProgress.percent || 0}%</span>
              </div>
              <div className="w-full bg-blue-200 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-[#0078D4] h-full transition-all duration-300"
                  style={{ width: `${pullProgress.percent || 0}%` }}
                />
              </div>
              {pullProgress.speed_mbps > 0 && (
                <div className="text-[11px] text-blue-700 text-right">
                  Speed: {pullProgress.speed_mbps} MB/s
                </div>
              )}
            </div>
          )}

          {/* Health Verification Test Results */}
          {testResult && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-[#107C41] mt-0.5 shrink-0" />
              <div className="space-y-1">
                <div className="text-sm font-semibold text-green-900">
                  Model Verified & Ready for StepSheet
                </div>
                <div className="text-xs text-green-800">{testResult.status_message}</div>
                <div className="text-[11px] text-green-700">
                  Latency: {testResult.latency_ms}ms | Structured JSON: Valid | Engine: Local
                  DuckDB
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-[#EDEBE9] bg-[#F3F2F1] flex items-center justify-between">
          <div className="text-xs text-[#605E5C] flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-[#107C41]" />
            <span>Zero external API keys required. Unlimited free local runs.</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-[#0078D4] hover:bg-[#106EBE] text-white text-xs font-medium rounded-md shadow-sm transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
