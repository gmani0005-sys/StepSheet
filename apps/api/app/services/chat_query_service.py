import os
import re
import json
import time
import urllib.request
from typing import Dict, Any, List, Optional, Tuple
from sqlalchemy.orm import Session
from app.models.dataset import Dataset
from app.schemas.chat_query import (
    ChatQueryPlan,
    ChatSelectField,
    ChatFilterRule,
    ChatSortRule,
    ChatChartConfig,
    ChatQueryResponse,
)
from app.services.duckdb_engine import DuckDBEngine
from app.services.ollama_manager import ollama_manager
from app.services.credit_ledger import credit_ledger
from app.services.storage import get_storage_service

ALLOWED_AGGS = {"sum", "avg", "min", "max", "count", "distinct_count", "median"}
ALLOWED_OPS = {"eq", "neq", "gt", "gte", "lt", "lte", "contains", "not_contains", "is_null", "is_not_null", "between"}
ALLOWED_CHART_TYPES = {"bar", "column", "line", "pie", "donut", "table", "area"}


class ChatQueryService:
    """
    Orchestrates Chat with Data queries. Generates structured ChatQueryPlan via
    local Ollama or heuristic engine, validates schemas against strict allowlists,
    and executes safe analytical queries locally in DuckDB.
    """

    def __init__(self):
        self.duckdb_engine = DuckDBEngine()

    def process_chat_query(
        self,
        db: Session,
        dataset_id: str,
        prompt: str,
        model_tag: Optional[str] = None,
        idempotency_key: Optional[str] = None,
        columns: Optional[List[Dict[str, Any]]] = None,
        sample_rows: Optional[List[Dict[str, Any]]] = None,
        dataset_name: Optional[str] = None,
    ) -> ChatQueryResponse:
        start_time = time.time()
        storage = get_storage_service()
        dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first() if db is not None else None
        if not dataset:
            if not columns and not sample_rows:
                raise ValueError(f"Dataset '{dataset_id}' not found.")
            ds_name = dataset_name or "Active Dataset"
            schema_metadata = columns or []
            parquet_file = None
            row_count = len(sample_rows) if sample_rows else 100
        else:
            ds_name = dataset.name
            schema_metadata = dataset.schema_metadata or []
            rel_path = dataset.parquet_path or dataset.file_path
            parquet_file = storage.get_local_path(rel_path) if rel_path else None
            if parquet_file and not os.path.exists(parquet_file) and dataset.file_path:
                raw_local = storage.get_local_path(dataset.file_path)
                if os.path.exists(raw_local):
                    parquet_file = raw_local
            row_count = dataset.row_count or 0

        # Extract schema metadata
        resolved_columns = []
        for c in schema_metadata:
            c_name = c.get("name") if isinstance(c, dict) else getattr(c, "name", "")
            raw_type = str(
                (c.get("data_type") or c.get("type") or "")
                if isinstance(c, dict)
                else getattr(c, "data_type", getattr(c, "type", ""))
            ).lower()
            if any(k in raw_type for k in ["int", "float", "number", "numeric", "double", "real", "dec"]):
                data_type = "float" if any(k in raw_type for k in ["float", "double", "real", "dec", "number"]) else "integer"
            elif any(k in raw_type for k in ["date", "time"]):
                data_type = "date"
            elif any(k in raw_type for k in ["bool"]):
                data_type = "boolean"
            else:
                data_type = "text"
            resolved_columns.append({
                "name": c_name,
                "data_type": data_type,
                "physical_type": (c.get("physical_type") or "VARCHAR") if isinstance(c, dict) else getattr(c, "physical_type", "VARCHAR"),
            })

        if not resolved_columns and sample_rows and len(sample_rows) > 0:
            resolved_columns = [
                {
                    "name": k,
                    "data_type": "float" if isinstance(v, (int, float)) else "text",
                    "physical_type": "DOUBLE" if isinstance(v, (int, float)) else "VARCHAR",
                }
                for k, v in sample_rows[0].items()
            ]

        col_names = [c["name"] for c in resolved_columns]
        if not col_names:
            raise ValueError("Dataset has no schema columns.")

        # 1. Generate Structured Plan
        plan, provider_used, model_used = self._generate_plan(
            prompt=prompt,
            dataset_name=ds_name,
            dataset_id=dataset_id,
            columns=resolved_columns,
            row_count=row_count,
            preferred_model=model_tag,
        )

        # 2. Validate Plan against strict schema allowlists
        plan = self._validate_and_sanitize_plan(plan, resolved_columns)

        # 3. Execute in DuckDB
        result_cols, result_rows, query_trace = self._execute_duckdb_plan(
            parquet_path=parquet_file,
            plan=plan,
            columns=resolved_columns,
            sample_rows=sample_rows,
        )

        latency_ms = round((time.time() - start_time) * 1000, 1)

        # 4. Formulate clear calculation method description
        calc_method = self._describe_calculation(plan)

        # 5. Record auditable usage ledger
        if db is not None:
            credit_ledger.record_transaction(
                db=db,
                operation_type="chat_query",
                provider=provider_used,
                model=model_used,
                credits=0 if provider_used == "ollama" else 1,
                idempotency_key=idempotency_key,
                latency_ms=latency_ms,
                metadata={"dataset_id": dataset_id, "prompt": prompt, "row_count": len(result_rows)},
            )

        return ChatQueryResponse(
            plan=plan,
            explanation=plan.explanation or f"Analysis for: '{prompt}'",
            calculation_method=calc_method,
            columns=result_cols,
            rows=result_rows,
            row_count=len(result_rows),
            chart=plan.chart,
            query_trace=query_trace,
            latency_ms=latency_ms,
            provider=provider_used,
            model=model_used,
        )

    # -------------------------------------------------------------------------
    # Plan Generation: Local Ollama + Robust Heuristic Fallback
    # -------------------------------------------------------------------------

    def _generate_plan(
        self,
        prompt: str,
        dataset_name: str,
        dataset_id: str,
        columns: List[Dict[str, Any]],
        row_count: int,
        preferred_model: Optional[str] = None,
    ) -> Tuple[ChatQueryPlan, str, str]:
        # Try Ollama if running
        if ollama_manager.is_service_running():
            installed = ollama_manager.list_installed_models()
            if installed:
                target_model = preferred_model or installed[0]["name"]
                try:
                    plan = self._call_ollama(prompt, dataset_name, dataset_id, columns, row_count, target_model)
                    if plan:
                        return plan, "ollama", target_model
                except Exception:
                    pass

        # Robust Heuristic Plan Generator
        plan = self._heuristic_plan(prompt, dataset_id, columns)
        return plan, "heuristic", "stepsheet-analytical-v1"

    def _call_ollama(
        self,
        prompt: str,
        dataset_name: str,
        dataset_id: str,
        columns: List[Dict[str, Any]],
        row_count: int,
        model: str,
    ) -> Optional[ChatQueryPlan]:
        col_summary = ", ".join([f"{c['name']} ({c['data_type']})" for c in columns])
        system_prompt = f"""You are StepSheet's AI Data Analyst.
The active dataset is '{dataset_name}' ({row_count} rows).
Columns: [{col_summary}].

Translate the user's analytical question into a JSON ChatQueryPlan object matching this schema:
{{
  "schema_version": "1.0",
  "intent": "aggregation" | "ranking" | "trend" | "filter" | "summary",
  "dataset_id": "{dataset_id}",
  "select": [{{"column": "<col_name>", "aggregation": "sum"|"avg"|"min"|"max"|"count"|"distinct_count"|null, "alias": "<alias>"}}],
  "filters": [],
  "group_by": ["<dim_col>"],
  "sort": [{{"column": "<alias_or_col>", "direction": "desc"|"asc"}}],
  "limit": 10,
  "chart": {{"type": "bar"|"column"|"line"|"pie"|"donut"|"table", "x": "<x_col>", "y": "<y_col>"}},
  "explanation": "<short plain English summary>",
  "assumptions": []
}}
Output valid JSON only. Do not invent columns. Only reference columns present in the dataset."""

        payload = json.dumps(
            {
                "model": model,
                "prompt": f"<system>\n{system_prompt}\n</system>\n<question>\n{prompt}\n</question>",
                "format": "json",
                "stream": False,
                "options": {"temperature": 0.1},
            }
        ).encode("utf-8")

        req = urllib.request.Request(
            f"{ollama_manager.base_url}/api/generate",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode())
            raw = data.get("response", "{}")
            parsed = json.loads(raw)
            parsed["dataset_id"] = dataset_id
            return ChatQueryPlan(**parsed)

    def _heuristic_plan(self, prompt: str, dataset_id: str, columns: List[Dict[str, Any]]) -> ChatQueryPlan:
        """
        High-precision rule-based parser that handles standard analytical queries.
        Translates conversational intent into sound business logic.
        """
        p_lower = prompt.lower().strip()

        KNOWN_MEASURE_NAMES = {
            "amount", "revenue", "sales", "total_sales", "total_amount", "subtotal", "gross",
            "quantity", "qty", "volume", "unit_price", "price", "rate", "cost", "unit_cost",
            "discount", "profit", "margin", "net_profit", "income", "credit_limit", "balance",
            "score", "calls", "call_count", "meetings", "duration", "hours", "spend", "budget", "salary"
        }
        KNOWN_DATE_NAMES = {
            "date", "order_date", "created_at", "updated_at", "timestamp", "datetime",
            "day", "month", "year", "quarter", "time", "period"
        }

        def _is_num(c: Dict[str, Any]) -> bool:
            name = c.get("name", "").lower().replace("-", "_")
            if any(name.endswith(k) for k in ["_id", "id", "_code", "_key"]):
                return False
            dt = str(c.get("data_type") or c.get("type") or c.get("physical_type") or "").lower()
            if any(k in dt for k in ["int", "float", "number", "numeric", "double", "real", "dec"]):
                return True
            return name in KNOWN_MEASURE_NAMES or any(k in name for k in KNOWN_MEASURE_NAMES)

        def _is_date(c: Dict[str, Any]) -> bool:
            name = c.get("name", "").lower().replace("-", "_")
            dt = str(c.get("data_type") or c.get("type") or c.get("physical_type") or "").lower()
            if any(k in dt for k in ["date", "time", "timestamp"]):
                return True
            return name in KNOWN_DATE_NAMES or any(k in name for k in KNOWN_DATE_NAMES)

        num_cols = [c["name"] for c in columns if _is_num(c)]
        date_cols = [c["name"] for c in columns if _is_date(c)]
        cat_cols = [c["name"] for c in columns if not _is_num(c) and not _is_date(c)]
        all_col_names = [c["name"] for c in columns]

        # Semantic Synonym Maps
        MEASURE_SYNONYMS = {
            "revenue": ["revenue", "amount", "sales", "total_amount", "total_sales", "turnover", "gross", "price", "subtotal"],
            "sales": ["sales", "amount", "revenue", "total_sales", "total_amount", "turnover", "subtotal"],
            "profit": ["profit", "margin", "net_profit", "income", "gain", "net"],
            "amount": ["amount", "sales", "revenue", "total"],
            "price": ["price", "unit_price", "rate", "cost"],
            "cost": ["cost", "expense", "unit_cost"],
            "quantity": ["quantity", "qty", "units", "volume", "count", "pieces"],
            "discount": ["discount", "rebate", "deduction"],
        }

        DIMENSION_SYNONYMS = {
            "product": ["product", "product_name", "item_name", "item", "category", "sub_category", "sku", "description"],
            "products": ["product", "product_name", "item_name", "item", "category", "sub_category", "sku", "description"],
            "item": ["item_name", "item", "product", "product_name", "category", "description"],
            "items": ["item_name", "item", "product", "product_name", "category", "description"],
            "order": ["order_id", "order", "orders", "order_number", "order_no", "transaction_id", "id"],
            "orders": ["order_id", "order", "orders", "order_number", "order_no", "transaction_id", "id"],
            "category": ["category", "sub_category", "type", "segment", "class", "department"],
            "categories": ["category", "sub_category", "type", "segment", "class", "department"],
            "customer": ["customer_id", "customer_name", "customer", "client", "account", "company", "buyer"],
            "customers": ["customer_id", "customer_name", "customer", "client", "account", "company", "buyer"],
            "client": ["customer_id", "customer_name", "customer", "client", "account"],
            "clients": ["customer_id", "customer_name", "customer", "client", "account"],
            "region": ["region", "country", "state", "city", "location", "territory", "market"],
            "regions": ["region", "country", "state", "city", "location", "territory", "market"],
            "status": ["status", "state", "stage", "condition"],
        }

        def resolve_measure(text: str) -> Optional[str]:
            t = text.lower().strip()
            for m in num_cols:
                if m.lower() == t or t == m.lower().replace("_", " "):
                    return m
            for m in num_cols:
                if m.lower() in t or t in m.lower():
                    return m
            for key, syns in MEASURE_SYNONYMS.items():
                if key in t or t in key:
                    for syn in syns:
                        for m in num_cols:
                            if m.lower() == syn or syn in m.lower():
                                return m
            return None

        def resolve_dim(text: str) -> Optional[str]:
            t = text.lower().strip()
            for d in cat_cols:
                if d.lower() == t or t == d.lower().replace("_", " "):
                    return d
            for d in cat_cols:
                if d.lower() in t or t in d.lower():
                    return d
            for c in all_col_names:
                if c.lower() == t or t == c.lower().replace("_", " "):
                    return c
            for key, syns in DIMENSION_SYNONYMS.items():
                if key in t or t in key:
                    for syn in syns:
                        for d in cat_cols:
                            if d.lower() == syn or syn in d.lower():
                                return d
                        for c in all_col_names:
                            if c.lower() == syn or syn in c.lower():
                                return c
            return None

        # Intent detection
        is_distinct = any(k in p_lower for k in ["unique", "distinct"])
        top_match = re.search(r"(?:top|bottom|first|last|highest|lowest)\s+(\d+)", p_lower)
        limit_val = int(top_match.group(1)) if top_match else 10
        is_ascending = any(k in p_lower for k in ["bottom", "lowest", "least"])
        sort_dir = "asc" if is_ascending else "desc"

        # ---------------------------------------------------------------------
        # 1. Missing Values Audit
        # ---------------------------------------------------------------------
        if any(term in p_lower for term in ["missing", "null", "blank", "quality"]):
            return ChatQueryPlan(
                intent="missing_values",
                dataset_id=dataset_id,
                select=[ChatSelectField(column=c["name"], aggregation="count", alias=f"Count {c['name']}") for c in columns[:5]],
                group_by=[],
                limit=1,
                chart=ChatChartConfig(type="table", x=columns[0]["name"], y=columns[0]["name"]),
                explanation="Summary count and missing value audit.",
            )

        # ---------------------------------------------------------------------
        # 2. Explicit Grouping Intent ("by <dim>", "per <dim>", "for each <dim>")
        # ---------------------------------------------------------------------
        by_match = re.search(r"(?:by|per|for each|grouped by|breakdown by)\s+([a-z0-9_'\s]+)", p_lower)
        if by_match:
            group_candidate = by_match.group(1).strip()
            subject_part = p_lower[:by_match.start()].strip()

            cand_as_measure = resolve_measure(group_candidate)
            cand_as_dim = resolve_dim(group_candidate)

            # Case A: Candidate is a Measure (e.g. "top 5 products by revenue")
            if cand_as_measure and (top_match or not cand_as_dim):
                dim_col = resolve_dim(subject_part) or (cat_cols[0] if cat_cols else all_col_names[0])
                target_meas = cand_as_measure
                alias = f"Total {target_meas.replace('_', ' ').title()}"
                if "revenue" in p_lower: alias = "Total Revenue"
                elif "sales" in p_lower: alias = "Total Sales"
                elif "profit" in p_lower: alias = "Total Profit"
                elif "amount" in p_lower: alias = "Total Amount"

                return ChatQueryPlan(
                    intent="ranking",
                    dataset_id=dataset_id,
                    select=[
                        ChatSelectField(column=dim_col, aggregation=None, alias=dim_col),
                        ChatSelectField(column=target_meas, aggregation="sum", alias=alias),
                    ],
                    group_by=[dim_col],
                    sort=[ChatSortRule(column=alias, direction=sort_dir)],
                    limit=limit_val,
                    chart=ChatChartConfig(type="bar", x=dim_col, y=alias),
                    explanation=f"Top {limit_val} {dim_col} ranked by {alias}.",
                )

            # Case B: Candidate is a Dimension (e.g. "total customer id's by region")
            non_id_cats = [c for c in cat_cols if not c.lower().endswith(("_id", "id"))]
            group_dim = cand_as_dim or resolve_dim(group_candidate) or (non_id_cats[0] if non_id_cats else cat_cols[0])

            # Check if subject is counting an entity or ID (e.g. "total customer id's", "unique orders")
            is_entity_count = (
                any(k in subject_part for k in ["customer", "order", "product", "client", "id", "item", "user", "count", "total", "number of", "how many", "unique", "distinct"])
                and not any(k in subject_part for k in ["revenue", "sales", "profit", "price", "cost", "discount", "unit_price", "margin"])
            )

            target_entity_col = None
            for c in columns:
                c_clean = c["name"].lower().replace("_", " ")
                if c["name"].lower() in subject_part or c_clean in subject_part:
                    target_entity_col = c["name"]
                    break
            if not target_entity_col:
                target_entity_col = resolve_dim(subject_part)

            if is_entity_count and target_entity_col and target_entity_col != group_dim:
                is_dist = is_distinct or target_entity_col.lower().endswith(("_id", "id"))
                agg = "distinct_count" if is_dist else "count"
                alias = f"Total Unique {target_entity_col.replace('_', ' ').title()}" if is_dist else f"Total {target_entity_col.replace('_', ' ').title()}"
                if "customer" in target_entity_col.lower(): alias = "Customer Count"
                elif "order" in target_entity_col.lower(): alias = "Order Count"
                elif "product" in target_entity_col.lower(): alias = "Product Count"

                return ChatQueryPlan(
                    intent="aggregation",
                    dataset_id=dataset_id,
                    select=[
                        ChatSelectField(column=group_dim, aggregation=None, alias=group_dim),
                        ChatSelectField(column=target_entity_col, aggregation=agg, alias=alias),
                    ],
                    group_by=[group_dim],
                    sort=[ChatSortRule(column=alias, direction=sort_dir)],
                    limit=limit_val,
                    chart=ChatChartConfig(type="bar", x=group_dim, y=alias),
                    explanation=f"Calculated unique {target_entity_col.replace('_', ' ')} counts grouped by {group_dim}.",
                )

            # Numeric Measure Grouped (e.g. "sales by region", "average discount by status")
            target_measure = resolve_measure(subject_part) or resolve_measure(p_lower) or (num_cols[0] if num_cols else None)
            if target_measure:
                agg_type = "sum"
                if any(k in p_lower for k in ["average", "avg", "mean"]): agg_type = "avg"
                elif any(k in p_lower for k in ["min", "lowest"]): agg_type = "min"
                elif any(k in p_lower for k in ["max", "highest"]): agg_type = "max"

                alias = f"{agg_type.title()} of {target_measure.replace('_', ' ').title()}"
                if agg_type == "sum":
                    if "revenue" in p_lower: alias = "Total Revenue"
                    elif "profit" in p_lower: alias = "Total Profit"
                    elif "sales" in p_lower: alias = "Total Sales"
                    elif "amount" in p_lower: alias = "Total Amount"

                chart_type = "bar" if limit_val <= 15 else "table"
                return ChatQueryPlan(
                    intent="aggregation",
                    dataset_id=dataset_id,
                    select=[
                        ChatSelectField(column=group_dim, aggregation=None, alias=group_dim),
                        ChatSelectField(column=target_measure, aggregation=agg_type, alias=alias),
                    ],
                    group_by=[group_dim],
                    sort=[ChatSortRule(column=alias, direction=sort_dir)],
                    limit=limit_val,
                    chart=ChatChartConfig(type=chart_type, x=group_dim, y=alias),
                    explanation=f"Calculated {alias} grouped by {group_dim}.",
                )

        # ---------------------------------------------------------------------
        # 3. Scalar Distinct Count Queries (e.g. "what is the total number unique orders")
        # ---------------------------------------------------------------------
        if is_distinct:
            target_col = None
            if any(k in p_lower for k in ["order", "orders"]):
                target_col = next((c["name"] for c in columns if "order" in c["name"].lower()), None)
            if not target_col and any(k in p_lower for k in ["customer", "client"]):
                target_col = next((c["name"] for c in columns if "customer" in c["name"].lower() or "client" in c["name"].lower()), None)
            if not target_col and any(k in p_lower for k in ["product", "item"]):
                target_col = next((c["name"] for c in columns if "product" in c["name"].lower() or "item" in c["name"].lower()), None)
            if not target_col and any(k in p_lower for k in ["category", "type", "segment"]):
                target_col = next((c["name"] for c in columns if any(x in c["name"].lower() for x in ["category", "type", "segment"])), None)
            if not target_col:
                for c in columns:
                    clean_name = c["name"].lower().replace("_", " ")
                    if clean_name in p_lower or c["name"].lower() in p_lower:
                        target_col = c["name"]
                        break
            if not target_col:
                id_cols = [c["name"] for c in columns if c["name"].lower().endswith(("_id", "id"))]
                target_col = id_cols[0] if id_cols else columns[0]["name"]

            alias = f"Total Unique {target_col.replace('_', ' ').title()}"
            return ChatQueryPlan(
                intent="summary",
                dataset_id=dataset_id,
                select=[
                    ChatSelectField(column=target_col, aggregation="distinct_count", alias=alias),
                ],
                group_by=[],
                limit=1,
                chart=ChatChartConfig(type="table", x=target_col, y=alias),
                explanation=f"Total number of unique {target_col.replace('_', ' ')} across all records.",
            )

        # ---------------------------------------------------------------------
        # 4. Time Trend Analysis
        # ---------------------------------------------------------------------
        is_trend = any(term in p_lower for term in ["trend", "over time", "monthly", "by month", "quarterly", "daily"]) and len(date_cols) > 0
        if is_trend:
            target_date = date_cols[0]
            val_col = resolve_measure(p_lower) or (num_cols[0] if num_cols else None)
            alias = f"Total {val_col}" if val_col else "Count"
            return ChatQueryPlan(
                intent="trend",
                dataset_id=dataset_id,
                select=[
                    ChatSelectField(column=target_date, aggregation=None, alias=target_date),
                    ChatSelectField(column=val_col or target_date, aggregation="sum" if val_col else "count", alias=alias),
                ],
                group_by=[target_date],
                sort=[ChatSortRule(column=target_date, direction="asc")],
                limit=50,
                chart=ChatChartConfig(type="line", x=target_date, y=alias),
                explanation=f"Trend of {alias} over {target_date}.",
            )

        # ---------------------------------------------------------------------
        # 4. Scalar Metric Queries (No grouping specified)
        # ---------------------------------------------------------------------
        if not top_match:
            # Row count questions
            if any(k in p_lower for k in ["total rows", "how many rows", "row count", "number of rows", "total records", "how many records"]):
                alias = "Total Records"
                return ChatQueryPlan(
                    intent="summary",
                    dataset_id=dataset_id,
                    select=[
                        ChatSelectField(column=columns[0]["name"], aggregation="count", alias=alias),
                    ],
                    group_by=[],
                    limit=1,
                    chart=ChatChartConfig(type="table", x=columns[0]["name"], y=alias),
                    explanation="Total number of records in the dataset.",
                )

            # Scalar aggregation on numeric measure
            target_measure = resolve_measure(p_lower) or (num_cols[0] if any(k in p_lower for k in ["total", "sum", "average", "avg", "mean", "min", "max", "revenue", "sales"]) and num_cols else None)
            if target_measure:
                agg_type = "sum"
                if any(k in p_lower for k in ["average", "avg", "mean"]):
                    agg_type = "avg"
                elif any(k in p_lower for k in ["max", "highest", "peak", "maximum"]):
                    agg_type = "max"
                elif any(k in p_lower for k in ["min", "lowest", "minimum"]):
                    agg_type = "min"

                alias = f"{agg_type.upper()} of {target_measure}"
                if agg_type == "sum":
                    if "revenue" in p_lower: alias = "Total Revenue"
                    elif "sales" in p_lower: alias = "Total Sales"
                    elif "profit" in p_lower: alias = "Total Profit"
                    elif "amount" in p_lower: alias = "Total Amount"
                    elif "quantity" in p_lower: alias = "Total Quantity"
                    elif "discount" in p_lower: alias = "Total Discount"
                elif agg_type == "avg":
                    alias = f"Average {target_measure}"

                return ChatQueryPlan(
                    intent="summary",
                    dataset_id=dataset_id,
                    select=[
                        ChatSelectField(column=target_measure, aggregation=agg_type, alias=alias),
                    ],
                    group_by=[],
                    limit=1,
                    chart=ChatChartConfig(type="table", x=target_measure, y=alias),
                    explanation=f"Calculated {alias} across the entire dataset.",
                )



        # ---------------------------------------------------------------------
        # 6. Fallback Grouped Ranking
        # ---------------------------------------------------------------------
        target_measure = resolve_measure(p_lower) or (num_cols[0] if num_cols else None)
        target_dim = resolve_dim(p_lower) or (cat_cols[0] if cat_cols else all_col_names[0])

        if target_dim and target_measure:
            alias = f"Total {target_measure}"
            if "revenue" in p_lower: alias = "Total Revenue"
            elif "profit" in p_lower: alias = "Total Profit"
            elif "sales" in p_lower: alias = "Total Sales"
            chart_type = "bar" if limit_val <= 15 else "table"
            return ChatQueryPlan(
                intent="ranking" if top_match else "aggregation",
                dataset_id=dataset_id,
                select=[
                    ChatSelectField(column=target_dim, aggregation=None, alias=target_dim),
                    ChatSelectField(column=target_measure, aggregation="sum", alias=alias),
                ],
                group_by=[target_dim],
                sort=[ChatSortRule(column=alias, direction="desc")],
                limit=limit_val,
                chart=ChatChartConfig(type=chart_type, x=target_dim, y=alias),
                explanation=f"{'Top ' + str(limit_val) + ' ' if top_match else ''}{target_dim} ranked by {alias}.",
            )

        # Fallback to single measure or count
        primary_col = target_measure or (target_dim or columns[0]["name"])
        return ChatQueryPlan(
            intent="summary",
            dataset_id=dataset_id,
            select=[
                ChatSelectField(
                    column=primary_col,
                    aggregation="sum" if primary_col in num_cols else "count",
                    alias=f"{'Total ' if primary_col in num_cols else 'Count of '}{primary_col}",
                )
            ],
            group_by=[],
            limit=1,
            chart=ChatChartConfig(type="table", x=primary_col, y=primary_col),
            explanation=f"Summary calculation for {primary_col}.",
        )

        # -------------------------------------------------------------------------
    # Plan Sanitization & Allowlist Validation
    # -------------------------------------------------------------------------

    def _validate_and_sanitize_plan(self, plan: ChatQueryPlan, columns: List[Dict[str, Any]]) -> ChatQueryPlan:
        valid_cols = {c["name"] for c in columns}
        col_case_map = {c["name"].lower(): c["name"] for c in columns}

        # Sanitize Select fields
        sanitized_select: List[ChatSelectField] = []
        for s in plan.select:
            matched_col = col_case_map.get(s.column.lower())
            if matched_col:
                agg = s.aggregation.lower() if s.aggregation else None
                if agg and agg not in ALLOWED_AGGS:
                    agg = "sum"
                alias = s.alias or (f"{agg.upper()}({matched_col})" if agg else matched_col)
                sanitized_select.append(ChatSelectField(column=matched_col, aggregation=agg, alias=alias))

        if not sanitized_select and columns:
            first = columns[0]["name"]
            sanitized_select.append(ChatSelectField(column=first, aggregation="count", alias=f"Count of {first}"))
        plan.select = sanitized_select

        # Sanitize Group By
        plan.group_by = [col_case_map[g.lower()] for g in plan.group_by if g.lower() in col_case_map]

        # Sanitize Filters
        sanitized_filters: List[ChatFilterRule] = []
        for f in plan.filters:
            matched = col_case_map.get(f.column.lower())
            if matched and f.operator in ALLOWED_OPS:
                sanitized_filters.append(ChatFilterRule(column=matched, operator=f.operator, value=f.value))
        plan.filters = sanitized_filters

        # Sanitize Limit
        if not plan.limit or plan.limit < 1:
            plan.limit = 10
        elif plan.limit > 1000:
            plan.limit = 1000

        # Sanitize Chart
        if plan.chart:
            ctype = plan.chart.type if plan.chart.type in ALLOWED_CHART_TYPES else "bar"
            x_col = col_case_map.get(plan.chart.x.lower(), plan.select[0].alias or plan.select[0].column)
            y_col = col_case_map.get(plan.chart.y.lower(), plan.select[-1].alias or plan.select[-1].column)
            plan.chart = ChatChartConfig(type=ctype, x=x_col, y=y_col, series=plan.chart.series)

        return plan

    # -------------------------------------------------------------------------
    # Safe DuckDB SQL Translation & Execution
    # -------------------------------------------------------------------------

    def _execute_duckdb_plan(
        self,
        parquet_path: Optional[str],
        plan: ChatQueryPlan,
        columns: List[Dict[str, Any]],
        sample_rows: Optional[List[Dict[str, Any]]] = None,
    ) -> Tuple[List[str], List[Dict[str, Any]], str]:
        conn = self.duckdb_engine.get_connection()

        try:
            # Determine source
            if parquet_path:
                parquet_sql = parquet_path.replace("\\", "/")
                is_parquet = parquet_sql.lower().endswith(".parquet")
                from_source = f"read_parquet('{parquet_sql}')" if is_parquet else f"read_csv_auto('{parquet_sql}')"
            elif sample_rows and len(sample_rows) > 0:
                try:
                    import pyarrow as pa
                    table = pa.Table.from_pylist(sample_rows)
                    conn.register("client_data", table)
                    from_source = "client_data"
                except Exception:
                    import tempfile
                    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as tf:
                        json.dump(sample_rows, tf)
                        temp_json = tf.name.replace("\\", "/")
                    from_source = f"read_json_auto('{temp_json}')"
            else:
                return [c["name"] for c in columns[:2]], [], "-- No active dataset storage found"
            # Build SELECT clause
            select_parts: List[str] = []
            for s in plan.select:
                safe_col = f'"{s.column}"'
                alias = f'"{s.alias}"' if s.alias else safe_col
                if not s.aggregation:
                    select_parts.append(f"{safe_col} AS {alias}")
                elif s.aggregation in ["sum", "avg", "min", "max"]:
                    fn = s.aggregation.upper()
                    clean_expr = f'TRY_CAST(REGEXP_REPLACE(REGEXP_REPLACE(CAST({safe_col} AS VARCHAR), \'[€$£¥, ]\', \'\', \'g\'), \'%\', \'\') AS DOUBLE)'
                    select_parts.append(f"{fn}(COALESCE({clean_expr}, 0)) AS {alias}")
                elif s.aggregation == "count":
                    select_parts.append(f"COUNT({safe_col}) AS {alias}")
                elif s.aggregation == "distinct_count":
                    select_parts.append(f"COUNT(DISTINCT {safe_col}) AS {alias}")
                elif s.aggregation == "median":
                    select_parts.append(f"MEDIAN({safe_col}) AS {alias}")

            select_clause = ", ".join(select_parts)

            # Build WHERE clause
            where_parts: List[str] = []
            params: List[Any] = []
            for f in plan.filters:
                safe_col = f'"{f.column}"'
                op = f.operator
                val = f.value
                if op == "eq":
                    where_parts.append(f"{safe_col} = ?")
                    params.append(val)
                elif op == "neq":
                    where_parts.append(f"{safe_col} != ?")
                    params.append(val)
                elif op == "gt":
                    where_parts.append(f"{safe_col} > ?")
                    params.append(val)
                elif op == "gte":
                    where_parts.append(f"{safe_col} >= ?")
                    params.append(val)
                elif op == "lt":
                    where_parts.append(f"{safe_col} < ?")
                    params.append(val)
                elif op == "lte":
                    where_parts.append(f"{safe_col} <= ?")
                    params.append(val)
                elif op == "contains":
                    where_parts.append(f"CAST({safe_col} AS VARCHAR) ILIKE ?")
                    params.append(f"%{val}%")
                elif op == "not_contains":
                    where_parts.append(f"CAST({safe_col} AS VARCHAR) NOT ILIKE ?")
                    params.append(f"%{val}%")
                elif op == "is_null":
                    where_parts.append(f"{safe_col} IS NULL")
                elif op == "is_not_null":
                    where_parts.append(f"{safe_col} IS NOT NULL")

            where_clause = f" WHERE {' AND '.join(where_parts)}" if where_parts else ""

            # Build GROUP BY clause
            group_clause = ""
            if plan.group_by:
                group_clause = f" GROUP BY {', '.join([f'\"{g}\"' for g in plan.group_by])}"

            # Build ORDER BY clause
            order_clause = ""
            if plan.sort:
                sort_parts = [f'"{s.column}" {"DESC" if s.direction.lower() == "desc" else "ASC"} NULLS LAST' for s in plan.sort]
                order_clause = f" ORDER BY {', '.join(sort_parts)}"

            # Limit clause
            limit_clause = f" LIMIT {plan.limit}"

            # Final SQL Query
            sql = f"SELECT {select_clause} FROM {from_source}{where_clause}{group_clause}{order_clause}{limit_clause};"

            cursor = conn.execute(sql, params) if params else conn.execute(sql)
            col_names = [d[0] for d in cursor.description]
            raw_rows = cursor.fetchall()

            # Format rows as dicts with rounded floats
            formatted_rows: List[Dict[str, Any]] = []
            for r in raw_rows:
                row_dict = {}
                for idx, col in enumerate(col_names):
                    val = r[idx]
                    if isinstance(val, float):
                        val = round(val, 2)
                    elif hasattr(val, "isoformat"):
                        val = val.isoformat()
                    row_dict[col] = val
                formatted_rows.append(row_dict)

            # Redacted query trace for user visibility
            safe_trace = sql
            for p in params:
                safe_trace = safe_trace.replace("?", repr(p), 1)

            return col_names, formatted_rows, safe_trace

        finally:
            conn.close()

    def _describe_calculation(self, plan: ChatQueryPlan) -> str:
        parts = []
        if plan.select:
            sel_descs = [f"{s.aggregation.upper() + ' of ' if s.aggregation else ''}{s.column}" for s in plan.select]
            parts.append(f"Calculated: {', '.join(sel_descs)}")
        if plan.group_by:
            parts.append(f"Grouped by: {', '.join(plan.group_by)}")
        if plan.filters:
            filter_descs = [f"{f.column} {f.operator} {repr(f.value)}" for f in plan.filters]
            parts.append(f"Filtered by: {', '.join(filter_descs)}")
        if plan.sort:
            sort_descs = [f"{s.column} ({s.direction})" for s in plan.sort]
            parts.append(f"Sorted by: {', '.join(sort_descs)}")
        if plan.limit:
            parts.append(f"Limited to {plan.limit} rows")
        return " | ".join(parts)


chat_query_service = ChatQueryService()
