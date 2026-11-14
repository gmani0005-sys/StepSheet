/**
 * Round 5 (production-readiness hardening) regression tests.
 * Scope not covered by Rounds 1-4: CSV parsing edge cases that Round 2
 * didn't already lock down (RFC-4180 quoting with embedded commas,
 * newlines and escaped quotes; UTF-8 BOM; mixed CRLF/LF; a fully blank
 * line mid-file; an always-blank column), and formula functions not
 * yet exercised by formulaEngine.test.ts (DATEDIF/NETWORKDAYS/WORKDAY/
 * WEEKDAY/EDATE/EOMONTH/YEARFRAC/TEXTBEFORE/TEXTAFTER/SUBSTITUTE-with-
 * instance), verified against an independent Python datetime/calendar
 * oracle (see /home/claude/qa5 for the harness).
 * (Ragged rows, duplicate headers and a __proto__ header are already
 * covered by R2-14/R2-15 in qaRound2Regression.test.ts.)
 */
import { describe, it, expect } from 'vitest';
import { localEngine } from '../api/localEngine';
import { evaluateFormula } from '../engine/formula';

const upload = async (text: string, name = 'r5.csv') => {
  const file = {
    name,
    type: 'text/csv',
    size: text.length,
    text: async () => text,
    arrayBuffer: async () => new TextEncoder().encode(text).buffer,
  } as unknown as File;
  const meta = await localEngine.uploadDataset(file);
  const rows = await localEngine.getRows(meta.id, { limit: 1000 });
  return { meta, rows: rows.rows };
};

describe('R5-01 CSV quoting and embedded delimiters', () => {
  it('a quoted field containing a comma, a newline, and an escaped quote survives intact', async () => {
    const csv = 'name,note\n"Acme, Inc.","line one\nline two with a ""quote"""\nSimple,plain\n';
    const { rows } = await upload(csv);
    expect(rows.length).toBe(2);
    expect(rows[0].name).toBe('Acme, Inc.');
    expect(rows[0].note).toBe('line one\nline two with a "quote"');
    expect(rows[1]).toEqual({ name: 'Simple', note: 'plain' });
  });
});

describe('R5-02 BOM and mixed line endings', () => {
  it('strips a leading UTF-8 BOM and handles CRLF/LF mixed in the same file', async () => {
    const csv = '﻿a,b\r\n1,2\n3,4\r\n';
    const { rows } = await upload(csv);
    expect(Object.keys(rows[0])).toEqual(['a', 'b']);
    expect(rows).toEqual([{ a: 1, b: 2 }, { a: 3, b: 4 }]);
  });
});

describe('R5-03 blank lines and all-null columns', () => {
  it('a fully blank line in the middle of the data is dropped, not kept as a row of nulls', async () => {
    const { rows } = await upload('a,b\n1,2\n\n3,4\n');
    expect(rows.length).toBe(2);
  });

  it('a column that is blank on every row is kept (as nulls), not silently dropped', async () => {
    const { rows } = await upload('a,b\n1,\n2,\n3,\n');
    expect(rows.map((r: any) => r.b)).toEqual([null, null, null]);
    expect(Object.keys(rows[0])).toContain('b');
  });
});

describe('R5-04 formula functions not covered by formulaEngine.test.ts (oracle-verified)', () => {
  // Each expected value below was independently computed against Python's
  // datetime/calendar module (not against this codebase) -- see
  // /home/claude/qa5/runners/gen_cases.py.
  it('DATEDIF: whole years/months/days across a leap-year and a month-end boundary', () => {
    expect(evaluateFormula('=DATEDIF("2023-01-15","2024-03-20","Y")', {})).toBe(1);
    expect(evaluateFormula('=DATEDIF("2023-01-15","2024-03-20","M")', {})).toBe(14);
    expect(evaluateFormula('=DATEDIF("2023-01-15","2024-03-20","D")', {})).toBe(430);
    expect(evaluateFormula('=DATEDIF("2020-02-29","2024-02-29","Y")', {})).toBe(4);
    expect(evaluateFormula('=DATEDIF("2023-01-31","2023-02-28","M")', {})).toBe(0);
  });

  it('NETWORKDAYS: a full month, a weekend-only span, a year boundary, and reversed order', () => {
    expect(evaluateFormula('=NETWORKDAYS("2024-01-01","2024-01-31")', {})).toBe(23);
    expect(evaluateFormula('=NETWORKDAYS("2024-03-02","2024-03-03")', {})).toBe(0);
    expect(evaluateFormula('=NETWORKDAYS("2024-12-20","2025-01-05")', {})).toBe(11);
    expect(evaluateFormula('=NETWORKDAYS("2024-01-31","2024-01-01")', {})).toBe(-23);
  });

  it('WORKDAY: stepping over a weekend forward and backward, and across a year boundary', () => {
    expect(evaluateFormula('=WORKDAY("2024-03-01",1)', {})).toBe('2024-03-04');
    expect(evaluateFormula('=WORKDAY("2024-03-04",-3)', {})).toBe('2024-02-28');
    expect(evaluateFormula('=WORKDAY("2024-12-30",3)', {})).toBe('2025-01-02');
  });

  it('WEEKDAY: all three return-type conventions on a known Monday', () => {
    expect(evaluateFormula('=WEEKDAY("2024-01-01")', {})).toBe(2); // Mon, type 1: Sun=1
    expect(evaluateFormula('=WEEKDAY("2024-01-01",2)', {})).toBe(1); // type 2: Mon=1
    expect(evaluateFormula('=WEEKDAY("2024-01-01",3)', {})).toBe(0); // type 3: Mon=0
  });

  it('EDATE/EOMONTH clamp to the shorter month and roll over a year', () => {
    expect(evaluateFormula('=EDATE("2024-01-31",1)', {})).toBe('2024-02-29'); // leap year
    expect(evaluateFormula('=EDATE("2023-01-31",1)', {})).toBe('2023-02-28'); // non-leap
    expect(evaluateFormula('=EOMONTH("2024-12-15",1)', {})).toBe('2025-01-31');
  });

  it('YEARFRAC basis 0 (US 30/360) matches the documented month-end adjustment rule', () => {
    expect(evaluateFormula('=YEARFRAC("2023-01-01","2023-12-31",0)', {})).toBe(1);
    expect(evaluateFormula('=YEARFRAC("2024-01-31","2024-02-29",0)', {})).toBeCloseTo(0.080556, 5);
  });

  it('TEXTBEFORE/TEXTAFTER with positive and negative instance numbers', () => {
    expect(evaluateFormula('=TEXTBEFORE("a-b-c-d","-",2)', {})).toBe('a-b');
    expect(evaluateFormula('=TEXTAFTER("a-b-c-d","-",-1)', {})).toBe('d');
    expect(evaluateFormula('=TEXTAFTER("a-b-c-d","-",-2)', {})).toBe('c-d');
  });

  it('SUBSTITUTE replaces only the requested occurrence, including overlapping matches', () => {
    expect(evaluateFormula('=SUBSTITUTE("one two one two one","one","X",2)', {})).toBe('one two X two one');
    expect(evaluateFormula('=SUBSTITUTE("aaa","a","bb",2)', {})).toBe('abba');
  });
});

describe('R5-05 LEN/LEFT/RIGHT/MID/REPLACE on emoji (surrogate-pair) text', () => {
  // An emoji outside the Basic Multilingual Plane (e.g. 😀, U+1F600) is
  // stored as a UTF-16 surrogate pair. Before this fix, LEN counted it as 2
  // characters and LEFT/RIGHT/MID/REPLACE could slice a surrogate pair in
  // half, producing a lone unpaired surrogate that CSV/XLSX export then
  // silently mangles into a replacement character (U+FFFD) on save -- a
  // real data-corruption risk for any free-text column containing emoji
  // (feedback forms, chat logs, social exports).
  it('LEN counts a leading emoji as one character, not two', () => {
    expect(evaluateFormula('=LEN("😀abc")', {})).toBe(4);
  });
  it('LEFT/RIGHT/MID keep a whole emoji intact instead of splitting its surrogate pair', () => {
    expect(evaluateFormula('=LEFT("😀abc",1)', {})).toBe('😀');
    expect(evaluateFormula('=RIGHT("abc😀",1)', {})).toBe('😀');
    expect(evaluateFormula('=MID("x😀y",2,1)', {})).toBe('😀');
  });
  it('REPLACE counts positions in whole characters around an emoji', () => {
    expect(evaluateFormula('=REPLACE("😀abc",1,1,"Z")', {})).toBe('Zabc');
  });
  it('plain ASCII and CJK text (no surrogate pairs) keep their existing LEN/LEFT/RIGHT/MID behavior', () => {
    expect(evaluateFormula('=LEN("你好世界")', {})).toBe(4);
    expect(evaluateFormula('=LEFT("hello",3)', {})).toBe('hel');
  });
});
