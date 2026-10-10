import React, { useState, useEffect } from 'react';
import {
  X,
  Share2,
  Copy,
  Check,
  Trash2,
  Shield,
  Eye,
  Edit3,
  Calendar,
  Lock,
  Link as LinkIcon,
} from 'lucide-react';
import { api } from '../../api/client';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectTitle: string;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  isOpen,
  onClose,
  projectId,
  projectTitle,
}) => {
  const [role, setRole] = useState<'viewer' | 'editor'>('viewer');
  const [expiresInDays, setExpiresInDays] = useState<number | undefined>(7);
  const [shares, setShares] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && projectId) {
      loadShares();
    }
  }, [isOpen, projectId]);

  if (!isOpen) return null;

  const loadShares = async () => {
    setIsLoading(true);
    try {
      const data = await api.listShares(projectId);
      setShares(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateShare = async () => {
    setIsGenerating(true);
    try {
      await api.createShare(projectId, role, expiresInDays);
      await loadShares();
    } catch (err: any) {
      alert(`Failed to create share link: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyLink = (token: string) => {
    const base =
      window.location.origin && window.location.origin !== 'null'
        ? window.location.origin
        : window.location.href.split('#')[0];
    const fullUrl = `${base}#share=${token}`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(fullUrl).catch(() => {});
    }
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2500);
  };

  const handleRevokeShare = async (shareId: string) => {
    if (!window.confirm('Revoke this share link? Future visitors using this link will be denied access.')) {
      return;
    }
    try {
      await api.revokeShare(projectId, shareId);
      await loadShares();
    } catch (err: any) {
      alert(`Failed to revoke share link: ${err.message}`);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-500 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-sky-500/20">
              <Share2 size={22} />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-100">Share Project & Access Control</h3>
              <p className="text-xs text-slate-400">
                Grant role-based access to <span className="text-slate-200 font-medium">"{projectTitle}"</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-5 overflow-y-auto space-y-5">
          {/* Create Share Link Card */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-4">
            <span className="text-xs font-semibold text-slate-300 block uppercase tracking-wider">
              Create New Shareable Link
            </span>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-slate-400 font-medium block mb-1">Access Role</label>
                <div className="grid grid-cols-2 gap-1.5 bg-slate-900 p-1 rounded-lg border border-slate-800">
                  <button
                    onClick={() => setRole('viewer')}
                    className={`flex items-center justify-center gap-1.5 py-1 text-xs rounded-md transition-all font-medium ${
                      role === 'viewer'
                        ? 'bg-sky-600 text-white shadow'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Eye size={13} />
                    <span>Viewer</span>
                  </button>
                  <button
                    onClick={() => setRole('editor')}
                    className={`flex items-center justify-center gap-1.5 py-1 text-xs rounded-md transition-all font-medium ${
                      role === 'editor'
                        ? 'bg-emerald-600 text-white shadow'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Edit3 size={13} />
                    <span>Editor</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[11px] text-slate-400 font-medium block mb-1">Expiration</label>
                <select
                  value={expiresInDays || ''}
                  onChange={(e) => setExpiresInDays(e.target.value ? Number(e.target.value) : undefined)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
                >
                  <option value={7}>Expires in 7 days</option>
                  <option value={30}>Expires in 30 days</option>
                  <option value="">Never expires</option>
                </select>
              </div>
            </div>

            <button
              onClick={handleGenerateShare}
              disabled={isGenerating}
              className="w-full flex items-center justify-center gap-2 py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-sm shadow-sky-600/30 transition-all"
            >
              <LinkIcon size={14} />
              <span>{isGenerating ? 'Generating...' : 'Generate Share Link'}</span>
            </button>
          </div>

          {/* Active Links List */}
          <div className="space-y-3">
            <span className="text-xs font-semibold text-slate-300 block uppercase tracking-wider">
              Active Share Links ({shares.length})
            </span>

            {shares.length === 0 ? (
              <div className="p-6 text-center text-slate-500 bg-slate-950/40 rounded-xl border border-slate-800 text-xs">
                No active share links. Generate one above to invite team members.
              </div>
            ) : (
              <div className="space-y-2.5">
                {shares.map((s) => {
                  const tokenVal = String(s.token || s.share_token || s.id || '');
                  const isCopied = copiedToken === tokenVal;
                  return (
                    <div
                      key={s.id}
                      className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${
                              s.role === 'editor'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
                            }`}
                          >
                            {s.role}
                          </span>
                          <span className="font-mono text-xs text-slate-300 truncate">
                            /share/{tokenVal.slice(0, 16)}...
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-1">
                          <span>Created {new Date(s.created_at).toLocaleDateString()}</span>
                          {s.expires_at ? (
                            <span>Expires {new Date(s.expires_at).toLocaleDateString()}</span>
                          ) : (
                            <span>No expiration</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => handleCopyLink(tokenVal)}
                          className={`p-1.5 rounded-lg border text-xs flex items-center gap-1 transition-all ${
                            isCopied
                              ? 'bg-emerald-600 text-white border-emerald-500'
                              : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                          }`}
                        >
                          {isCopied ? <Check size={13} /> : <Copy size={13} />}
                          <span className="text-[11px]">{isCopied ? 'Copied' : 'Copy'}</span>
                        </button>
                        <button
                          onClick={() => handleRevokeShare(s.id)}
                          title="Revoke link"
                          className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 rounded-lg transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-slate-500">
            Viewers can inspect steps & download exports; Editors can modify the pipeline
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
