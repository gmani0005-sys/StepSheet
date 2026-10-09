import React, { useState, useEffect } from 'react';
import {
  X,
  Check,
  Sparkles,
  Code2,
  Copy,
  Sliders,
  AlertCircle,
  HelpCircle,
  ShieldCheck,
} from 'lucide-react';
import { StepDefinition } from '../../types/steps';

interface ReviewGeneratedStepModalProps {
  isOpen: boolean;
  step: StepDefinition | null;
  explanation: string;
  confidence: number;
  provider: string;
  onClose: () => void;
  onApply: (step: StepDefinition) => void;
}

export const ReviewGeneratedStepModal: React.FC<ReviewGeneratedStepModalProps> = ({
  isOpen,
  step,
  explanation,
  confidence,
  provider,
  onClose,
  onApply,
}) => {
  const [editedLabel, setEditedLabel] = useState('');
  const [editedParams, setEditedParams] = useState<Record<string, any>>({});
  const [showFormula, setShowFormula] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (step) {
      setEditedLabel(step.label);
      setEditedParams({ ...step.params });
    }
  }, [step]);

  if (!isOpen || !step) return null;

  const handleConfirm = () => {
    onApply({
      ...step,
      label: editedLabel,
      params: editedParams,
    });
    onClose();
  };

  const handleParamChange = (key: string, val: any) => {
    setEditedParams((prev) => ({
      ...prev,
      [key]: val,
    }));
  };

  const formattedJsonParams = JSON.stringify(editedParams, null, 2);

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
              <Sparkles size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-slate-100">Review AI Generated Step</h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                  <ShieldCheck size={11} /> Review Required
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Verify parameters below before confirming; no step is applied automatically
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

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Plain-English Explanation Banner */}
          <div className="p-3.5 bg-indigo-950/30 border border-indigo-500/30 rounded-xl text-xs space-y-1">
            <div className="flex items-center justify-between text-indigo-300 font-semibold text-[11px] uppercase tracking-wider">
              <span>Assistant Explanation</span>
              <span className="text-[10px] text-slate-400 font-mono">
                {provider === 'heuristic' ? 'Rule Parser' : `Model: ${provider}`} •{' '}
                {Math.round(confidence * 100)}% match
              </span>
            </div>
            <p className="text-slate-200 leading-relaxed">{explanation}</p>
          </div>

          {/* Step Metadata */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                Detected Step Type
              </label>
              <div className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-amber-300 uppercase font-semibold">
                {step.type.replace('_', ' ')}
              </div>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                Step Label
              </label>
              <input
                type="text"
                value={editedLabel}
                onChange={(e) => setEditedLabel(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Form Fields for Key Parameters */}
          <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-3.5 space-y-3">
            <label className="text-xs font-semibold text-slate-200 block">
              Step Parameters
            </label>

            {Object.entries(editedParams).map(([k, v]) => {
              if (typeof v === 'object' && v !== null) {
                return (
                  <div key={k} className="text-xs">
                    <span className="text-slate-400 font-mono block mb-1">{k}:</span>
                    <pre className="p-2 bg-slate-900 border border-slate-800 rounded text-[11px] text-emerald-300 font-mono overflow-x-auto">
                      {JSON.stringify(v, null, 2)}
                    </pre>
                  </div>
                );
              }

              return (
                <div key={k} className="flex items-center gap-2 text-xs">
                  <span className="w-28 text-slate-400 font-mono truncate">{k}:</span>
                  <input
                    type="text"
                    value={String(v ?? '')}
                    onChange={(e) => handleParamChange(k, e.target.value)}
                    className="flex-1 bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
              );
            })}
          </div>

          {/* Show Formula Drawer */}
          <div>
            <button
              type="button"
              onClick={() => setShowFormula(!showFormula)}
              className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1.5 transition-colors"
            >
              <Code2 size={13} className="text-indigo-400" />
              <span>{showFormula ? 'Hide raw parameters JSON' : 'Inspect parameters JSON'}</span>
            </button>
            {showFormula && (
              <div className="mt-2 bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-xs">
                <div className="flex items-center justify-between text-[11px] text-slate-400 border-b border-slate-800 pb-1 mb-2">
                  <span>Step Parameters</span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(formattedJsonParams);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="hover:text-indigo-400 flex items-center gap-1"
                  >
                    <Copy size={11} /> {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <pre className="text-indigo-300 text-[11px] overflow-x-auto whitespace-pre-wrap">
                  {formattedJsonParams}
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800"
          >
            Cancel / Discard
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="px-5 py-2 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-lg shadow-md shadow-emerald-500/20 flex items-center gap-1.5 transition-all"
          >
            <Check size={14} />
            <span>Confirm & Apply to Pipeline</span>
          </button>
        </div>
      </div>
    </div>
  );
};
