import React, { useState } from 'react';
import { Sparkles, ArrowRight, Loader2, Wand2, ChevronDown, Check, X } from 'lucide-react';
import { useWorkbenchStore } from '../../store/workbenchStore';
import { api } from '../../api/client';
import { StepDefinition } from '../../types/steps';
import { ReviewGeneratedStepModal } from './ReviewGeneratedStepModal';

export const NaturalLanguageStepBar: React.FC = () => {
  const {
    selectedDataset,
    addStep,
    steps,
    activeStepIndex,
    stepSummaries,
    columns,
  } = useWorkbenchStore();

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

  // Read-only Formula Bar (fx) value from active step or source dataset
  const activeSummary =
    activeStepIndex !== null && stepSummaries[activeStepIndex]
      ? stepSummaries[activeStepIndex]
      : stepSummaries.length > 0
      ? stepSummaries[stepSummaries.length - 1]
      : null;

  const activeStep =
    activeStepIndex !== null && steps[activeStepIndex]
      ? steps[activeStepIndex]
      : steps.length > 0
      ? steps[steps.length - 1]
      : null;

  const formulaBarText =
    activeSummary?.generated_code?.excel_formula ||
    activeSummary?.generated_code?.sql ||
    (activeStep
      ? `=STEP("${activeStep.label}")`
      : columns.length > 0
      ? `=TABLE("${selectedDataset.name}", [${columns.map((c) => c.name).slice(0, 4).join(', ')}${columns.length > 4 ? ', ...' : ''}])`
      : `=SOURCE("${selectedDataset.name}")`);

  const nameBoxLabel = activeStep
    ? `STEP_${(activeStepIndex !== null ? activeStepIndex : steps.length - 1) + 1}`
    : columns[0]?.name || 'A1';

  return (
    <>
      <div className="bg-[#F3F3F3] border-b border-[#D4D4D4] px-2 py-1 flex flex-col gap-1 shrink-0">
        {/* Row 1: Excel Name Box + Read-Only Formula Bar (fx) + Plain English ("Tell me what you want to do") */}
        <div className="flex flex-wrap lg:flex-nowrap items-center gap-1.5">
          {/* Name Box (Read-Only Display) */}
          <div
            title={`Active Reference: ${nameBoxLabel} (${selectedDataset.name})`}
            className="h-7 w-32 bg-white border border-[#D4D4D4] px-2 flex items-center justify-between text-[12px] font-mono text-[#212121] shrink-0 select-none rounded-[1px]"
          >
            <span className="truncate">{nameBoxLabel}</span>
            <ChevronDown size={12} className="text-[#605E5C] shrink-0" />
          </div>

          {/* Formula Bar Function Badge (✕ ✓ fx) */}
          <div className="h-7 bg-white border border-[#D4D4D4] px-2 flex items-center gap-1.5 text-[#605E5C] shrink-0 select-none rounded-[1px]">
            <X size={12} className="text-[#A19F9D]" />
            <Check size={12} className="text-[#A19F9D]" />
            <span className="font-serif italic font-bold text-[13px] text-[#217346] pl-0.5">
              fx
            </span>
          </div>

          {/* Read-Only Formula Display Strip */}
          <div
            title={formulaBarText}
            className="h-7 flex-1 min-w-[180px] bg-white border border-[#D4D4D4] px-2.5 flex items-center text-[12px] font-mono text-[#212121] overflow-x-auto whitespace-nowrap select-all rounded-[1px]"
          >
            {formulaBarText}
          </div>

          {/* "Tell me what you want to do" / Plain English Step Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleGenerate();
            }}
            className="flex items-center gap-1 w-full lg:w-[430px] xl:w-[500px] shrink-0"
          >
            <div className="relative flex-1 min-w-0">
              <div className="absolute left-2.5 top-0 bottom-0 flex items-center text-[#217346] pointer-events-none">
                <Sparkles size={13} />
              </div>
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe transformation in plain English (e.g. 'discounted = amount - discount', 'filter amount > 100', 'running total of sales')..."
                className="w-full h-7 bg-white border border-[#8A8886] focus:border-[#217346] rounded-[2px] pl-7 pr-2 text-[12px] text-[#212121] placeholder-[#605E5C] focus:outline-none truncate"
                disabled={isLoading}
              />
            </div>
            {/* Laid out as a flex sibling, never overlapping the input: the
                button's own width varies with its label ("Create Step" vs
                "Thinking..."), and an absolutely-positioned button sized by
                a fixed input padding (the previous approach) can end up
                wider than that reserved padding, overlapping and clipping
                the input's own text. */}
            <button
              type="submit"
              disabled={isLoading || !prompt.trim()}
              className="h-7 shrink-0 px-2.5 bg-[#217346] hover:bg-[#185C37] disabled:opacity-40 text-white font-semibold text-[12px] rounded-[1px] flex items-center gap-1 transition-colors whitespace-nowrap"
            >
              {isLoading ? (
                <>
                  <Loader2 size={12} className="animate-spin text-white" />
                  <span>Thinking...</span>
                </>
              ) : (
                <>
                  <span>Create Step</span>
                  <ArrowRight size={12} />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Row 2: Compact Quick Formula / Plain-English Suggestion Strip */}
        <div
          className="flex items-center gap-1.5 text-[12px] overflow-x-auto py-0.5 chips-scrollbar select-none"
          onWheel={(e) => {
            if (e.deltaY !== 0 && !e.deltaX) {
              e.currentTarget.scrollLeft += e.deltaY;
            }
          }}
        >
          <span className="text-[#605E5C] shrink-0 flex items-center gap-1 font-medium text-[12px]">
            <Wand2 size={11} className="text-[#217346]" />
            Try:
          </span>
          {examplePrompts.map((eg, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handleGenerate(eg)}
              className="px-2 py-0.5 rounded-[2px] bg-white hover:bg-[#E6F2EB] text-[#444444] hover:text-[#217346] border border-[#D4D4D4] hover:border-[#217346]/50 shrink-0 transition-colors cursor-pointer text-[12px]"
            >
              {eg}
            </button>
          ))}
          {error && <span className="text-[#C50F1F] ml-2 shrink-0 font-medium">{error}</span>}
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
