import re
import json
import uuid
import urllib.request
import urllib.error
from typing import Dict, Any, List, Optional
from app.core.config import settings
from app.schemas.steps import StepSchema


class LLMAdapter:
    """
    Pluggable LLM Adapter supporting Ollama, OpenAI-compatible endpoints,
    and a robust zero-latency local heuristic engine for mapping plain English
    to structured StepSheet transformation steps.
    """

    def __init__(self):
        self.enabled = settings.ENABLE_LLM_ASSISTANT
        self.endpoint = settings.LLM_ENDPOINT
        self.api_key = settings.LLM_API_KEY
        self.model = settings.LLM_MODEL
        self.provider = settings.LLM_PROVIDER

    def get_status(self) -> Dict[str, Any]:
        return {
            "enabled": self.enabled,
            "provider": self.provider,
            "endpoint": self.endpoint,
            "model": self.model,
            "has_api_key": bool(self.api_key),
        }

    def generate_step(
        self,
        prompt: str,
        dataset_name: str,
        columns: List[Dict[str, Any]],
        other_datasets: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        """
        Translates a natural language instruction into a typed StepSheet StepSchema.
        Tries the external LLM endpoint first if configured; falls back gracefully
        to the rule-based intent compiler.
        """
        prompt_clean = prompt.strip()
        if not prompt_clean:
            raise ValueError("Prompt cannot be empty.")

        # Attempt remote LLM if enabled and endpoint is provided
        if self.enabled and self.endpoint:
            try:
                llm_result = self._call_llm_api(prompt_clean, dataset_name, columns, other_datasets)
                if llm_result:
                    return llm_result
            except Exception:
                # Fall back to heuristic parser gracefully
                pass

        # Heuristic intent parser
        return self._heuristic_parse(prompt_clean, columns, other_datasets)

    def _call_llm_api(
        self,
        prompt: str,
        dataset_name: str,
        columns: List[Dict[str, Any]],
        other_datasets: Optional[List[Dict[str, Any]]] = None,
    ) -> Optional[Dict[str, Any]]:
        col_names = [c.get("name") for c in columns]
        col_summary = ", ".join([f"{c.get('name')} ({c.get('data_type')})" for c in columns])
        other_summary = ""
        if other_datasets:
            other_summary = "Other tables available: " + ", ".join([d.get("name", "") for d in other_datasets])

        system_prompt = f"""You are StepSheet's AI data workbench assistant.
The active dataset is '{dataset_name}' with columns: [{col_summary}].
{other_summary}

Translate the analyst's request into a single transformation step.
Available step types:
- filter_rows: params: {{column, operator ('eq'|'neq'|'gt'|'gte'|'lt'|'lte'|'contains'|'is_null'), value}}
- sort_rows: params: {{column, direction ('asc'|'desc')}}
- change_type: params: {{column, target_type ('integer'|'float'|'text'|'date'|'boolean')}}
- rename_column: params: {{column, new_name}}
- remove_duplicates: params: {{columns: list, keep ('first'|'last')}}
- text_transform: params: {{column, operation ('upper'|'lower'|'proper'|'trim'|'clean'|'left'|'right'), output_column, length}}
- window_calc: params: {{calc_type ('running_total'|'rank'|'moving_avg'|'lag'|'lead'), target_column, output_column, order_by, order_direction}}
- group_by: params: {{group_by_columns: list, aggregations: [{{column, agg_func ('sum'|'count'|'avg'|'min'|'max'), output_column}}]}}
- math_transform: params: {{column1, column2, operation ('arithmetic'|'round'|'percent_change'), math_operator ('+'|'-'|'*'|'/'), output_column}}
- conditional: params: {{new_column, rules: [{{column, operator, value, result}}], else_value}}

Respond with ONLY valid JSON with this format:
{{
  "type": "<step_type>",
  "label": "<short human label>",
  "params": {{ ... }},
  "explanation": "<one sentence plain-English explanation of what this step does>"
}}"""

        url = f"{self.endpoint.rstrip('/')}/chat/completions"
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "StepSheet/1.0",
        }
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.1,
            "max_tokens": 500,
        }

        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers=headers,
            method="POST",
        )

        with urllib.request.urlopen(req, timeout=4) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            content = data["choices"][0]["message"]["content"].strip()
            # Extract JSON block if wrapped in markdown
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                content = content.split("```")[1].split("```")[0].strip()

            parsed = json.loads(content)
            return {
                "step": {
                    "id": str(uuid.uuid4()),
                    "type": parsed["type"],
                    "label": parsed.get("label", f"Step from: {prompt}"),
                    "enabled": True,
                    "params": parsed.get("params", {}),
                    "description": parsed.get("explanation"),
                },
                "explanation": parsed.get("explanation", "Generated by AI model"),
                "confidence": 0.92,
                "provider": self.provider,
            }

    def _heuristic_parse(
        self,
        prompt: str,
        columns: List[Dict[str, Any]],
        other_datasets: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        """
        High-precision intent recognition matching common data analyst expressions.
        Supports formula arithmetic, assignments, conditionals, date & text transforms,
        aggregations, window functions, sorting, filtering, and deduplication.
        """
        p_lower = prompt.lower().strip()
        col_names = [c["name"] for c in columns]
        col_lower_map = {c["name"].lower(): c["name"] for c in columns}

        op_map = {
            "+": "+", "plus": "+", "add": "+", "sum": "+",
            "-": "-", "minus": "-", "subtract": "-", "subtracted by": "-", "diff": "-",
            "*": "*", "times": "*", "multiply": "*", "multiplied by": "*", "product": "*",
            "/": "/", "divide": "/", "divided by": "/", "div": "/", "over": "/",
            "%": "%", "mod": "%", "modulo": "%"
        }

        def resolve_col(token: str, default: Optional[str] = None) -> str:
            clean = token.strip().strip("'\"`")
            if not clean:
                return default or (col_names[0] if col_names else "column")

            # Numeric literal check
            try:
                float(clean)
                return clean
            except ValueError:
                pass

            low = clean.lower()
            if low in col_lower_map:
                return col_lower_map[low]
            if low.replace(" ", "_") in col_lower_map:
                return col_lower_map[low.replace(" ", "_")]
            if low.replace("_", " ") in col_lower_map:
                return col_lower_map[low.replace("_", " ")]

            for cl, orig in col_lower_map.items():
                if cl in low or low in cl:
                    return orig

            return clean

        def find_col(text: str) -> str:
            t_low = text.lower()
            for orig in sorted(col_names, key=len, reverse=True):
                pattern = r'\b' + re.escape(orig.lower()) + r'\b'
                if re.search(pattern, t_low):
                    return orig
            for cl, orig in col_lower_map.items():
                if cl in t_low:
                    return orig
            return col_names[0] if col_names else "column"

        # 1. Conditionals: IF ... THEN ... ELSE
        cond_match = re.search(
            r'\bif\s+(.*?)\s*(=|==|!=|>=|<=|>|<|contains)\s*(.*?)\s+then\s+(.*?)\s+else\s+(.*)',
            prompt,
            re.IGNORECASE
        )
        if cond_match:
            c_col = resolve_col(cond_match.group(1))
            c_op_raw = cond_match.group(2)
            c_op = "eq" if c_op_raw in ["=", "=="] else "neq" if c_op_raw == "!=" else "gte" if c_op_raw == ">=" else "lte" if c_op_raw == "<=" else "gt" if c_op_raw == ">" else "lt" if c_op_raw == "<" else "contains"
            c_val = cond_match.group(3).strip().strip("'\"")
            c_then = cond_match.group(4).strip().strip("'\"")
            c_else = cond_match.group(5).strip().strip("'\"")
            out_col = f"{c_col}_flag"
            return {
                "step": {
                    "id": str(uuid.uuid4()),
                    "type": "conditional",
                    "label": f"If {c_col} {c_op_raw} {c_val} Then {c_then} Else {c_else}",
                    "enabled": True,
                    "params": {
                        "new_column": out_col,
                        "rules": [{"column": c_col, "operator": c_op, "value": c_val, "result": c_then}],
                        "else_value": c_else,
                    },
                    "description": f"Sets '{out_col}' to '{c_then}' when '{c_col}' {c_op_raw} '{c_val}', else '{c_else}'",
                },
                "explanation": f"I configured a conditional rule on '{c_col}' yielding '{c_then}' or '{c_else}'.",
                "confidence": 0.95,
                "provider": "heuristic",
            }

        # 2. Arithmetic / Formula Assignment with '='
        # E.g. "create discounted column = amount - discount", "discounted = amount - discount", "profit = revenue - cost"
        if "=" in prompt and not any(p_lower.startswith(w) for w in ["filter", "keep only", "remove rows"]):
            parts = prompt.split("=", 1)
            left_raw = parts[0].strip()
            right_raw = parts[1].strip()

            out_col = re.sub(r'^(?:create|add|calculate|compute|make|new)\s+(?:column\s+)?', '', left_raw, flags=re.IGNORECASE).strip()
            out_col = re.sub(r'\s+column$', '', out_col, flags=re.IGNORECASE).strip().strip(':')
            if not out_col:
                out_col = "calculated_column"

            math_match = re.search(
                r'^\s*(.*?)\s*([+\-*/%]|(?:\b(?:minus|plus|times|multiplied\s+by|divided\s+by|over)\b))\s*(.*?)\s*$',
                right_raw,
                re.IGNORECASE
            )
            if math_match:
                op1_raw = math_match.group(1).strip()
                op_raw = math_match.group(2).strip().lower()
                op2_raw = math_match.group(3).strip()
                c1 = resolve_col(op1_raw)
                c2 = resolve_col(op2_raw)
                op_sym = op_map.get(op_raw, "+")

                return {
                    "step": {
                        "id": str(uuid.uuid4()),
                        "type": "math_transform",
                        "label": f"Calculate {out_col} = {c1} {op_sym} {c2}",
                        "enabled": True,
                        "params": {
                            "operation": "arithmetic",
                            "column1": c1,
                            "column2": c2,
                            "math_operator": op_sym,
                            "output_column": out_col,
                        },
                        "description": f"Calculates '{out_col}' as {c1} {op_sym} {c2}",
                    },
                    "explanation": f"I identified an arithmetic formula calculating '{out_col}' as {c1} {op_sym} {c2}.",
                    "confidence": 0.96,
                    "provider": "heuristic",
                }

        # 3. Formula with 'as': "calculate / create <out_col> as <op1> <op> <op2>"
        as_match = re.search(
            r'^(?:calculate|compute|create|add)\s+(?:column\s+)?([a-zA-Z0-9_]+)\s+as\s+(.*?)\s*([+\-*/%]|(?:\b(?:minus|plus|times|multiplied\s+by|divided\s+by|over)\b))\s*(.*?)\s*$',
            prompt,
            re.IGNORECASE
        )
        if as_match:
            out_col = as_match.group(1).strip()
            out_col = re.sub(r'\s+column$', '', out_col, flags=re.IGNORECASE).strip()
            c1 = resolve_col(as_match.group(2))
            op_sym = op_map.get(as_match.group(3).strip().lower(), "+")
            c2 = resolve_col(as_match.group(4))
            return {
                "step": {
                    "id": str(uuid.uuid4()),
                    "type": "math_transform",
                    "label": f"Calculate {out_col} = {c1} {op_sym} {c2}",
                    "enabled": True,
                    "params": {
                        "operation": "arithmetic",
                        "column1": c1,
                        "column2": c2,
                        "math_operator": op_sym,
                        "output_column": out_col,
                    },
                    "description": f"Calculates '{out_col}' as {c1} {op_sym} {c2}",
                },
                "explanation": f"I identified a formula calculating '{out_col}' as {c1} {op_sym} {c2}.",
                "confidence": 0.96,
                "provider": "heuristic",
            }

        # 4. Verb-based math: subtract / multiply / divide / add
        sub_match = re.search(
            r'\bsubtract\s+(.*?)\s+from\s+(.*?)(?:\s+(?:as|into)\s+([a-zA-Z0-9_]+))?$',
            prompt,
            re.IGNORECASE
        )
        if sub_match:
            c2 = resolve_col(sub_match.group(1))
            c1 = resolve_col(sub_match.group(2))
            out_raw = sub_match.group(3) or f"{c1}_minus_{c2}"
            out_col = re.sub(r'\s+column$', '', out_raw, flags=re.IGNORECASE).strip()
            return {
                "step": {
                    "id": str(uuid.uuid4()),
                    "type": "math_transform",
                    "label": f"Calculate {out_col} = {c1} - {c2}",
                    "enabled": True,
                    "params": {
                        "operation": "arithmetic",
                        "column1": c1,
                        "column2": c2,
                        "math_operator": "-",
                        "output_column": out_col,
                    },
                    "description": f"Subtracts '{c2}' from '{c1}' into '{out_col}'",
                },
                "explanation": f"I created a subtraction step calculating '{out_col}' as {c1} - {c2}.",
                "confidence": 0.95,
                "provider": "heuristic",
            }

        mul_match = re.search(
            r'\bmultiply\s+(.*?)\s+(?:by|and|with)\s+(.*?)(?:\s+(?:as|into)\s+([a-zA-Z0-9_]+))?$',
            prompt,
            re.IGNORECASE
        )
        if mul_match:
            c1 = resolve_col(mul_match.group(1))
            c2 = resolve_col(mul_match.group(2))
            out_raw = mul_match.group(3) or f"{c1}_x_{c2}"
            out_col = re.sub(r'\s+column$', '', out_raw, flags=re.IGNORECASE).strip()
            return {
                "step": {
                    "id": str(uuid.uuid4()),
                    "type": "math_transform",
                    "label": f"Calculate {out_col} = {c1} * {c2}",
                    "enabled": True,
                    "params": {
                        "operation": "arithmetic",
                        "column1": c1,
                        "column2": c2,
                        "math_operator": "*",
                        "output_column": out_col,
                    },
                    "description": f"Multiplies '{c1}' by '{c2}' into '{out_col}'",
                },
                "explanation": f"I created a multiplication step calculating '{out_col}' as {c1} * {c2}.",
                "confidence": 0.95,
                "provider": "heuristic",
            }

        div_match = re.search(
            r'\bdivide\s+(.*?)\s+(?:by|over)\s+(.*?)(?:\s+(?:as|into)\s+([a-zA-Z0-9_]+))?$',
            prompt,
            re.IGNORECASE
        )
        if div_match:
            c1 = resolve_col(div_match.group(1))
            c2 = resolve_col(div_match.group(2))
            out_raw = div_match.group(3) or f"{c1}_div_{c2}"
            out_col = re.sub(r'\s+column$', '', out_raw, flags=re.IGNORECASE).strip()
            return {
                "step": {
                    "id": str(uuid.uuid4()),
                    "type": "math_transform",
                    "label": f"Calculate {out_col} = {c1} / {c2}",
                    "enabled": True,
                    "params": {
                        "operation": "arithmetic",
                        "column1": c1,
                        "column2": c2,
                        "math_operator": "/",
                        "output_column": out_col,
                    },
                    "description": f"Divides '{c1}' by '{c2}' into '{out_col}'",
                },
                "explanation": f"I created a division step calculating '{out_col}' as {c1} / {c2}.",
                "confidence": 0.95,
                "provider": "heuristic",
            }

        # 5. Direct binary arithmetic expression: "amount - discount" or "price * quantity"
        direct_match = re.search(
            r'^\s*([a-zA-Z0-9_]+)\s*([+\-*/%]|(?:\b(?:minus|plus|times|multiplied\s+by|divided\s+by|over)\b))\s*([a-zA-Z0-9_.]+)\s*$',
            prompt,
            re.IGNORECASE
        )
        if direct_match and not p_lower.startswith("filter"):
            c1_raw = direct_match.group(1).strip()
            op_raw = direct_match.group(2).strip().lower()
            c2_raw = direct_match.group(3).strip()
            c1 = resolve_col(c1_raw)
            c2 = resolve_col(c2_raw)
            op_sym = op_map.get(op_raw, "+")
            op_name = 'minus' if op_sym=='-' else 'plus' if op_sym=='+' else 'times' if op_sym=='*' else 'div'
            out_col = f"{c1}_{op_name}_{c2}"
            return {
                "step": {
                    "id": str(uuid.uuid4()),
                    "type": "math_transform",
                    "label": f"Calculate {out_col} = {c1} {op_sym} {c2}",
                    "enabled": True,
                    "params": {
                        "operation": "arithmetic",
                        "column1": c1,
                        "column2": c2,
                        "math_operator": op_sym,
                        "output_column": out_col,
                    },
                    "description": f"Calculates '{out_col}' as {c1} {op_sym} {c2}",
                },
                "explanation": f"I calculated '{out_col}' as {c1} {op_sym} {c2}.",
                "confidence": 0.94,
                "provider": "heuristic",
            }

        # 6. Rounding
        round_match = re.search(
            r'\bround\s*(?:\(\s*)?(?:column\s+)?([a-zA-Z0-9_]+)(?:,\s*(\d+)\s*\)|(?:\s+to\s+(\d+)\s+decimals?)?)?',
            prompt,
            re.IGNORECASE
        )
        if round_match:
            c1 = resolve_col(round_match.group(1))
            decs = int(round_match.group(2) or round_match.group(3) or 2)
            out_col = f"rounded_{c1}"
            return {
                "step": {
                    "id": str(uuid.uuid4()),
                    "type": "math_transform",
                    "label": f"Round {c1} to {decs} decimals",
                    "enabled": True,
                    "params": {
                        "operation": "round",
                        "column1": c1,
                        "decimals": decs,
                        "output_column": out_col,
                    },
                    "description": f"Rounds column '{c1}' to {decs} decimal places",
                },
                "explanation": f"I configured a rounding step on '{c1}' to {decs} decimal places.",
                "confidence": 0.94,
                "provider": "heuristic",
            }

        # 7. Date: extract part
        date_part_match = re.search(
            r'\b(?:extract|get)\s+(year|month|day|quarter|weekday|day_name)\s+from\s+(?:column\s+)?([a-zA-Z0-9_]+)',
            prompt,
            re.IGNORECASE
        )
        if date_part_match:
            d_part = date_part_match.group(1).lower()
            c1 = resolve_col(date_part_match.group(2))
            out_col = f"{c1}_{d_part}"
            return {
                "step": {
                    "id": str(uuid.uuid4()),
                    "type": "date_transform",
                    "label": f"Extract {d_part} from {c1}",
                    "enabled": True,
                    "params": {
                        "column": c1,
                        "operation": "extract_part",
                        "date_part": d_part,
                        "output_column": out_col,
                    },
                    "description": f"Extracts the {d_part} from date column '{c1}'",
                },
                "explanation": f"I configured a step to extract {d_part} from date '{c1}'.",
                "confidence": 0.95,
                "provider": "heuristic",
            }

        # 8. Date: EOMONTH
        if any(w in p_lower for w in ["end of month", "eomonth", "last day of month"]):
            c1 = find_col(p_lower)
            out_col = f"{c1}_eomonth"
            return {
                "step": {
                    "id": str(uuid.uuid4()),
                    "type": "date_transform",
                    "label": f"End of month for {c1}",
                    "enabled": True,
                    "params": {
                        "column": c1,
                        "operation": "eomonth",
                        "output_column": out_col,
                    },
                    "description": f"Calculates the end of month date for '{c1}'",
                },
                "explanation": f"I configured an end-of-month calculation for '{c1}'.",
                "confidence": 0.95,
                "provider": "heuristic",
            }

        # 9. Text concatenation
        concat_match = re.search(
            r'\b(?:concatenate|combine|join)\s+([a-zA-Z0-9_]+)\s+and\s+([a-zA-Z0-9_]+)(?:\s+with\s+(?:separator\s+)?[\'"](.*?)[\'"])?',
            prompt,
            re.IGNORECASE
        )
        if concat_match:
            c1 = resolve_col(concat_match.group(1))
            c2 = resolve_col(concat_match.group(2))
            sep = concat_match.group(3) or " "
            out_col = f"{c1}_{c2}"
            return {
                "step": {
                    "id": str(uuid.uuid4()),
                    "type": "text_transform",
                    "label": f"Concatenate {c1} and {c2}",
                    "enabled": True,
                    "params": {
                        "column": c1,
                        "operation": "concat",
                        "concat_columns": [c2],
                        "concat_separator": sep,
                        "output_column": out_col,
                    },
                    "description": f"Concatenates '{c1}' and '{c2}' separated by '{sep}'",
                },
                "explanation": f"I configured a text concatenation step combining '{c1}' and '{c2}'.",
                "confidence": 0.95,
                "provider": "heuristic",
            }

        # 10. Filter rows
        if any(w in p_lower for w in ["filter", "keep only", "remove rows where", "greater than", "less than", "equals"]):
            col = find_col(p_lower)
            op = "eq"
            val = "100"

            if ">=" in p_lower or "greater than or equal" in p_lower or "at least" in p_lower:
                op = "gte"
            elif "<=" in p_lower or "less than or equal" in p_lower or "at most" in p_lower:
                op = "lte"
            elif ">" in p_lower or "greater" in p_lower or "above" in p_lower or "more than" in p_lower:
                op = "gt"
            elif "<" in p_lower or "less" in p_lower or "below" in p_lower or "under" in p_lower:
                op = "lt"
            elif "not equal" in p_lower or "!=" in p_lower:
                op = "neq"
            elif "null" in p_lower or "blank" in p_lower or "empty" in p_lower:
                op = "is_null"
            elif "contains" in p_lower or "like" in p_lower:
                op = "contains"

            num_match = re.search(r"[-+]?\d*\.?\d+", p_lower)
            if num_match:
                val = num_match.group(0)
            quote_match = re.search(r"['\"](.*?)['\"]", prompt)
            if quote_match:
                val = quote_match.group(1)

            return {
                "step": {
                    "id": str(uuid.uuid4()),
                    "type": "filter_rows",
                    "label": f"Filter {col} {op} {val}",
                    "enabled": True,
                    "params": {"column": col, "operator": op, "value": val},
                    "description": f"Keeps only rows where '{col}' matches {op} {val}",
                },
                "explanation": f"I identified a row filter condition on column '{col}' with operator '{op}' and value '{val}'.",
                "confidence": 0.90,
                "provider": "heuristic",
            }

        # 11. Sort rows
        if any(w in p_lower for w in ["sort", "order by", "order"]):
            col = find_col(p_lower)
            direction = "desc" if any(w in p_lower for w in ["desc", "descending", "highest", "newest", "largest"]) else "asc"
            return {
                "step": {
                    "id": str(uuid.uuid4()),
                    "type": "sort_rows",
                    "label": f"Sort by {col} {direction.upper()}",
                    "enabled": True,
                    "params": {"column": col, "direction": direction},
                    "description": f"Sorts dataset by column '{col}' in {direction}ending order",
                },
                "explanation": f"I configured a sort on '{col}' in {direction}ending order.",
                "confidence": 0.95,
                "provider": "heuristic",
            }

        # 12. Running total / Cumulative sum
        if any(w in p_lower for w in ["running total", "cumulative sum", "cumulative"]):
            col = find_col(p_lower)
            out_col = f"cum_{col}"
            return {
                "step": {
                    "id": str(uuid.uuid4()),
                    "type": "window_calc",
                    "label": f"Running total of {col}",
                    "enabled": True,
                    "params": {
                        "calc_type": "running_total",
                        "target_column": col,
                        "output_column": out_col,
                        "order_by": col,
                        "order_direction": "asc",
                    },
                    "description": f"Calculates a cumulative running total of '{col}' over rows",
                },
                "explanation": f"I created a window calculation for the running total of '{col}'.",
                "confidence": 0.92,
                "provider": "heuristic",
            }

        # 13. Rank
        if "rank" in p_lower:
            col = find_col(p_lower)
            return {
                "step": {
                    "id": str(uuid.uuid4()),
                    "type": "window_calc",
                    "label": f"Rank by {col}",
                    "enabled": True,
                    "params": {
                        "calc_type": "rank",
                        "target_column": col,
                        "output_column": f"rank_{col}",
                        "order_by": col,
                        "order_direction": "desc",
                    },
                    "description": f"Assigns a dense rank based on '{col}'",
                },
                "explanation": f"I generated a ranking calculation step on '{col}'.",
                "confidence": 0.92,
                "provider": "heuristic",
            }

        # 14. Group by and aggregate
        if any(w in p_lower for w in ["group by", "summarize by", "aggregate by"]):
            col = find_col(p_lower)
            measure_col = next((c for c in col_names if c != col), col)
            func = "sum"
            if "average" in p_lower or "avg" in p_lower or "mean" in p_lower:
                func = "avg"
            elif "count" in p_lower:
                func = "count"

            return {
                "step": {
                    "id": str(uuid.uuid4()),
                    "type": "group_by",
                    "label": f"Group by {col} and {func} {measure_col}",
                    "enabled": True,
                    "params": {
                        "group_by_columns": [col],
                        "aggregations": [
                            {"column": measure_col, "agg_func": func, "output_column": f"{func}_{measure_col}"}
                        ],
                    },
                    "description": f"Groups data by '{col}' and calculates {func.upper()} of '{measure_col}'",
                },
                "explanation": f"I set up a group by summarization on dimension '{col}' aggregating '{measure_col}'.",
                "confidence": 0.88,
                "provider": "heuristic",
            }

        # 15. Change type
        if any(w in p_lower for w in ["change type", "convert", "cast", "to integer", "to text", "to date", "to float"]):
            col = find_col(p_lower)
            ttype = "text"
            if "integer" in p_lower or "int" in p_lower or "number" in p_lower:
                ttype = "integer"
            elif "float" in p_lower or "decimal" in p_lower:
                ttype = "float"
            elif "date" in p_lower:
                ttype = "date"
            elif "boolean" in p_lower or "bool" in p_lower:
                ttype = "boolean"

            return {
                "step": {
                    "id": str(uuid.uuid4()),
                    "type": "change_type",
                    "label": f"Change {col} to {ttype}",
                    "enabled": True,
                    "params": {"column": col, "target_type": ttype},
                    "description": f"Converts column '{col}' to {ttype} type",
                },
                "explanation": f"I detected a type conversion request for column '{col}' to '{ttype}'.",
                "confidence": 0.95,
                "provider": "heuristic",
            }

        # 16. Text transform (upper, lower, proper, trim)
        if any(w in p_lower for w in ["upper", "uppercase", "capital", "lower", "lowercase", "trim", "title case", "proper"]):
            col = find_col(p_lower)
            op = "trim"
            if "upper" in p_lower or "capital" in p_lower:
                op = "upper"
            elif "lower" in p_lower:
                op = "lower"
            elif "proper" in p_lower or "title" in p_lower:
                op = "proper"

            return {
                "step": {
                    "id": str(uuid.uuid4()),
                    "type": "text_transform",
                    "label": f"Text {op.upper()} on {col}",
                    "enabled": True,
                    "params": {"column": col, "operation": op, "output_column": col},
                    "description": f"Transforms text in column '{col}' using {op.upper()}",
                },
                "explanation": f"I mapped your request to a text transform '{op}' on column '{col}'.",
                "confidence": 0.92,
                "provider": "heuristic",
            }

        # 17. Remove duplicates
        if "duplicate" in p_lower or "dedup" in p_lower or "unique" in p_lower:
            return {
                "step": {
                    "id": str(uuid.uuid4()),
                    "type": "remove_duplicates",
                    "label": "Remove duplicate rows",
                    "enabled": True,
                    "params": {"columns": [], "keep": "first"},
                    "description": "Removes duplicate rows across all columns, keeping the first occurrence",
                },
                "explanation": "I configured a step to remove duplicate records across the dataset.",
                "confidence": 0.95,
                "provider": "heuristic",
            }

        # Default fallback: Non-null filter suggestion
        col = find_col(p_lower)
        return {
            "step": {
                "id": str(uuid.uuid4()),
                "type": "filter_rows",
                "label": f"Filter {col}",
                "enabled": True,
                "params": {"column": col, "operator": "is_not_null", "value": None},
                "description": f"Keep non-null rows in column '{col}'",
            },
            "explanation": f"I couldn't pinpoint the exact rule, so I prepared a non-null filter on column '{col}'. You can adjust the parameters before applying.",
            "confidence": 0.65,
            "provider": "heuristic",
        }


llm_adapter = LLMAdapter()
