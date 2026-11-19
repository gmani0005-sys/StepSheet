import React from 'react';

/**
 * Renders the small markdown subset the chat engines write: headings (#, ##,
 * ###), "- " / "* " bullets, numbered lines, **bold**, *italic* and `code`.
 * It builds React elements only (no innerHTML), so text from the data can never
 * become markup. Anything it doesn't recognise is shown as plain text.
 */

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  // **bold**, *italic*, `code` -- bold first so "**" is not read as two italics.
  const re = /(\*\*([^*]+?)\*\*)|(`([^`]+?)`)|(\*([^*\s][^*]*?)\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${keyPrefix}-${i++}`;
    if (m[2] !== undefined) out.push(<strong key={k} className="font-bold text-[#201F1E]">{m[2]}</strong>);
    else if (m[4] !== undefined) out.push(<code key={k} className="px-1 py-0.5 rounded bg-[#F3F2F1] font-mono text-[11px]">{m[4]}</code>);
    else if (m[6] !== undefined) out.push(<em key={k}>{m[6]}</em>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export const ChatMarkdown: React.FC<{ text: string; className?: string }> = ({ text, className }) => {
  const lines = String(text ?? '').replace(/\r\n/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let para: string[] = [];

  const flushPara = () => {
    if (para.length) {
      const k = `p${blocks.length}`;
      blocks.push(<p key={k}>{renderInline(para.join(' '), k)}</p>);
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      const k = `l${blocks.length}`;
      const items = list.items.map((it, i) => <li key={`${k}-${i}`}>{renderInline(it, `${k}-${i}`)}</li>);
      blocks.push(
        list.ordered ? (
          <ol key={k} className="list-decimal pl-5 space-y-1">{items}</ol>
        ) : (
          <ul key={k} className="list-disc pl-5 space-y-1">{items}</ul>
        )
      );
      list = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushPara();
      flushList();
      continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      flushPara();
      flushList();
      const k = `h${blocks.length}`;
      const size = h[1].length === 1 ? 'text-base' : h[1].length === 2 ? 'text-sm' : 'text-[13px]';
      blocks.push(
        <div key={k} role="heading" aria-level={h[1].length} className={`${size} font-bold text-[#201F1E]`}>
          {renderInline(h[2], k)}
        </div>
      );
      continue;
    }
    const b = /^[-*•]\s+(.*)$/.exec(line);
    const n = /^\d+[.)]\s+(.*)$/.exec(line);
    if (b || n) {
      flushPara();
      const ordered = !!n;
      if (list && list.ordered !== ordered) flushList();
      if (!list) list = { ordered, items: [] };
      list.items.push((b || n)![1]);
      continue;
    }
    flushList();
    para.push(line);
  }
  flushPara();
  flushList();

  return <div className={`space-y-2 ${className || ''}`}>{blocks}</div>;
};

export default ChatMarkdown;
