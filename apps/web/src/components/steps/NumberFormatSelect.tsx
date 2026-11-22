/**
 * Column-level number format for steps that read text as numbers
 * (Change Type to Integer/Float, Clean Numeric). "Auto" reads every common
 * convention; picking one settles the "1.234" ambiguity for European files.
 */
export const NUMBER_FORMAT_OPTIONS = [
  { value: 'auto', label: 'Auto-detect (1,234.56 · 1.234,56 · 1,23,456)' },
  { value: 'dot', label: '1,234.56 — dot decimal, comma thousands' },
  { value: 'comma', label: '1.234,56 — comma decimal, dot thousands (Europe)' },
] as const;

interface Props {
  value?: string;
  onChange: (value: string) => void;
  /** 'dark' for the step editor, 'light' for the cleaning dialog. */
  tone?: 'dark' | 'light';
  testId?: string;
}

export function NumberFormatSelect({ value, onChange, tone = 'dark', testId = 'number-format-select' }: Props) {
  const dark = tone === 'dark';
  return (
    <div>
      <label className={dark ? 'text-xs font-medium text-slate-300 block mb-1' : 'text-xs font-semibold text-[#212121] block mb-1'}>
        Number format in this column
      </label>
      <select
        data-testid={testId}
        value={value || 'auto'}
        onChange={(e) => onChange(e.target.value)}
        className={
          dark
            ? 'w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200'
            : 'w-full bg-[#FAFAFA] border border-[#D4D4D4] rounded px-3 py-1.5 text-xs text-[#212121]'
        }
      >
        {NUMBER_FORMAT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <p className={dark ? 'text-[11px] text-slate-400 mt-1' : 'text-[11px] text-[#605E5C] mt-1'}>
        Auto reads "1.234" as 1.234. Choose the European format if it means one thousand two hundred thirty-four.
      </p>
    </div>
  );
}
