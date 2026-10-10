import React, { useState } from 'react';
import { Sparkles, ArrowRight, Loader2, Wand2 } from 'lucide-react';
import { useWorkbenchStore } from '../../store/workbenchStore';
import { api } from '../../api/client';
import { StepDefinition } from '../../types/steps';
import { ReviewGeneratedStepModal } from './ReviewGeneratedStepModal';

export const NaturalLanguageStepBar: React.FC = () => {
  const { selectedDataset, addStep } = useWorkbenchStore();

  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Review modal state
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [generatedStep, setGeneratedStep] = useState<StepDefinition | null>(null);
  const [explanation, setExplanation] = useState('');
  const [confidence, setConfidence] = useState(1.0);
  const [provider, setProvider] = useState('heuristic');

  if (!selectedDataset) return null;

  const handleGenerate = async (textToUse?: string) => {
    const text = textToUse || prompt;
    if (!text.trim() || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await api.generateAiStep(selectedDataset.id, text.trim());
      setGeneratedStep(res.step);
      setExplanation(res.explanation);
      setConfidence(res.confidence);
      setProvider(res.provider);
      setIsReviewOpen(true);
      setPrompt('');
    } catch (err: any) {
      setError(err.message || 'Failed to generate step');
    } finally {
      setIsLoading(false);
    }
  };

  const examplePrompts = [
    'create discounted column = amount - discount',
    'Filter rows where amount > 100',
    'Sort by amount descending',
    'Calculate running total of amount',
    'Capitalize customer names',
  ];

  return (
    <>
      <div className="bg-slate-900/90 border-b border-slate-800/80 px-4 pt-2.5 pb-2 flex flex-col gap-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleGenerate();
          }}
          className="flex items-center gap-2"
        >
          <div className="relative flex-1">
            <div className="absolute left-3 top-2.5 text-amber-400">
              <Sparkles size={15} />
            </div>
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe transformation in plain English (e.g. 'discounted = amount - discount', 'filter amount > 100', 'running total of sales')..."
              className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl pl-9 pr-24 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500/60 shadow-inner"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !prompt.trim()}
              className="absolute right-1.5 top-1.5 px-3 py-1 bg-gradient-to-r from-amber-500 to-indigo-600 hover:from-amber-400 hover:to-indigo-500 disabled:opacity-40 text-slate-950 font-bold text-xs rounded-lg flex items-center gap-1 shadow-sm transition-all"
            >
              {isLoading ? (
                <>
                  <Loader2 size={13} className="animate-spin text-slate-950" />
                  <span>Thinking...</span>
                </>
              ) : (
                <>
                  <span>Create Step</span>
                  <ArrowRight size={13} />
                </>
              )}
            </button>
          </div>
        </form>

        {/* Suggestion Chips with proper spacing to prevent scrollbar overlapping */}
        <div
          className="flex items-center gap-2 text-[11px] overflow-x-auto pt-1 pb-3 chips-scrollbar select-none"
          onWheel={(e) => {
            if (e.deltaY !== 0 && !e.deltaX) {
              e.currentTarget.scrollLeft += e.deltaY;
            }
          }}
        >
          <span className="text-slate-500 shrink-0 flex items-center gap-1 font-medium">
            <Wand2 size={11} className="text-indigo-400" />
            Try:
          </span>
          {examplePrompts.map((eg, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handleGenerate(eg)}
              className="px-2.5 py-1 rounded-full bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800/80 hover:border-slate-700 shrink-0 transition-colors cursor-pointer"
            >
              {eg}
            </button>
          ))}
          {error && <span className="text-rose-400 ml-2 shrink-0">{error}</span>}
        </div>
      </div>

      {/* Mandatory User Review Modal */}
      <ReviewGeneratedStepModal
        isOpen={isReviewOpen}
        step={generatedStep}
        explanation={explanation}
        confidence={confidence}
        provider={provider}
        onClose={() => setIsReviewOpen(false)}
        onApply={async (confirmedStep) => {
          await addStep(confirmedStep);
        }}
      />
    </>
  );
};
