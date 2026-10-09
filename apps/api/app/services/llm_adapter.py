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
        """
        p_lower = prompt.lower()
        col_names = [c["name"] for c in columns]
        col_lower_map = {c["name"].lower(): c["name"] for c in columns}

        # Helper to find referenced column
        def find_col(text: str) -> Optional[str]:
            for cl, orig in col_lower_map.items():
                if cl in text:
                    return orig
            return col_names[0] if col_names else "column"

        # 1. Filter rows
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

            # Extract number or quoted text
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

        # 2. Sort rows
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

        # 3. Running total / Cumulative sum
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

        # 4. Rank
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

        # 5. Group by and aggregate
        if any(w in p_lower for w in ["group by", "summarize by", "aggregate by"]):
            col = find_col(p_lower)
            # Find measure column (another column)
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

        # 6. Change type
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

        # 7. Text transform (upper, lower, proper, trim)
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

        # 8. Remove duplicates
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

        # Default fallback: Filter or Change Type suggestion
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
