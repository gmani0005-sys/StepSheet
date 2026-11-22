"""Run generated SQL (DuckDB) and Polars code and compare with StepSheet's result. Usage: check.py <dir>"""
import json, sys, os, re, math, io, contextlib, datetime
import duckdb, polars as pl
D = sys.argv[1]
os.chdir(D)
cases = json.load(open('codegen.json'))

def norm(v):
    if v is None: return None
    if isinstance(v, float) and math.isnan(v): return None
    if isinstance(v, (datetime.date, datetime.datetime)): return v.isoformat()[:10]
    if isinstance(v, bool): return 'true' if v else 'false'
    if isinstance(v, (int, float)): return round(float(v), 6)
    s = str(v)
    if s in ('#VALUE!', '#DIV/0!', '#N/A', '#NUM!'): return '__ERR__'
    try:
        if re.fullmatch(r'-?\d+(\.\d+)?', s.strip()): return round(float(s), 6)
    except Exception: pass
    if s.lower() in ('true', 'false'): return s.lower()
    return s

def same(eng_rows, got_rows, got_cols):
    if len(eng_rows) != len(got_rows): return False, f'rows {len(eng_rows)} vs {len(got_rows)}', 0
    ecols = list(eng_rows[0].keys()) if eng_rows else []
    missing = [c for c in ecols if c not in got_cols]
    if missing: return False, f'missing columns {missing}', 0
    errs = 0
    for i, (e, g) in enumerate(zip(eng_rows, got_rows)):
        for c in ecols:
            a, b = norm(e.get(c)), norm(g.get(c))
            if a == '__ERR__' and b is None: errs += 1; continue
            if a == b: continue
            if a in (None, '') and b in (None, ''): continue
            return False, f'row {i} col {c}: app={e.get(c)!r} code={g.get(c)!r}', errs
    return True, '', errs

res = []
con0 = None
for c in cases:
    eng = c['rows']; code = c['code']
    # SQL
    try:
        con = duckdb.connect()
        for t in ('dataset', 'reps', 'more'):
            con.execute(f"CREATE TABLE {t} AS SELECT * FROM read_csv('{t}.csv', all_varchar = true)")
        cur = con.execute(code['sql'])
        cols = [d[0] for d in cur.description]
        got = [dict(zip(cols, r)) for r in cur.fetchall()]
        ok, why, errs = same(eng, got, cols)
    except Exception as e:
        ok, why, errs = False, 'ERROR ' + str(e).split('\n')[0][:200], 0
    res.append({'lang': 'SQL', 'case': c['name'], 'pass': ok, 'why': why, 'errs_as_null': errs})
    # Polars
    try:
        g = {}
        with contextlib.redirect_stdout(io.StringIO()):
            exec(code['polars'], g)
        df = g['df']
        got = df.to_dicts()
        ok, why, errs = same(eng, got, df.columns)
    except NotImplementedError as e:
        ok, why, errs = False, 'STOPPED ' + str(e)[:150], 0
    except Exception as e:
        ok, why, errs = False, 'ERROR ' + str(e).split('\n')[0][:200], 0
    res.append({'lang': 'Polars', 'case': c['name'], 'pass': ok, 'why': why, 'errs_as_null': errs})
    # Power Query M: structural checks (no M runtime available here)
    m = code['power_query_m']
    probs = []
    body = re.sub(r'"(?:[^"]|"")*"', '""', m)           # strip strings
    body = re.sub(r'//[^\n]*', '', body)                  # strip comments
    for o, cl in ['()', '[]', '{}']:
        if body.count(o) != body.count(cl): probs.append(f'unbalanced {o}{cl}')
    if 'PrevStep' in m: probs.append('undefined PrevStep')
    inner = body.split('\nlet\n', 1)[1].rsplit('\nin\n', 1)[0]
    # top-level step names must be defined before use and separated by commas
    depth = 0; parts = []; cur = ''
    for ch in inner:
        depth += ch in '([{'; depth -= ch in ')]}'
        if ch == ',' and depth == 0: parts.append(cur); cur = ''
        else: cur += ch
    parts.append(cur)
    names = [p.strip().split('=', 1)[0].strip() for p in parts]
    if any(not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*', n) for n in names): probs.append(f'bad step boundaries: {[n for n in names if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", n)][:2]}')
    final = body.rsplit('\nin\n', 1)[1].strip()
    if final not in names: probs.append(f'final step {final} not defined')
    stopped = 'error "' in m
    res.append({'lang': 'Power Query M', 'case': c['name'], 'pass': not probs and not stopped, 'why': '; '.join(probs) or ('STOPPED (unsupported)' if stopped else ''), 'errs_as_null': 0})

json.dump(res, open('results.json', 'w'), indent=1)
import collections
t = collections.defaultdict(lambda: [0, 0])
for r in res: t[r['lang']][0] += r['pass']; t[r['lang']][1] += 1
for k, v in t.items(): print(f'{k}: {v[0]}/{v[1]}')
print('cells where app shows an Excel error and code gives null:', sum(r['errs_as_null'] for r in res))
for r in res:
    if not r['pass']: print('  FAIL', r['lang'], '|', r['case'], '|', r['why'][:230])

sys.exit(0 if all(r['pass'] for r in res if r['lang'] != 'Power Query M') else 1)
