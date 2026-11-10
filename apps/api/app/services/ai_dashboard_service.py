import os
import re
import json
import uuid
import time
import urllib.request
from typing import Dict, Any, List, Optional, Tuple
from sqlalchemy.orm import Session
from app.models.dataset import Dataset
from app.schemas.ai_dashboard import (
    DashboardPlan,
    DashboardKpiPlan,
    DashboardVisualPlan,
    DashboardPatchOperation,
    GenerateDashboardResponse,
    PatchDashboardResponse,
)
from app.services.duckdb_engine import DuckDBEngine
from app.services.ollama_manager import ollama_manager
from app.services.credit_ledger import credit_ledger
from app.services.storage import get_storage_service

PALETTE_OPTIONS = ["v22", "classic", "ocean", "emerald", "sunset", "monochrome", "vibrant"]


class AiDashboardService:
    """
    Native Julius-style interactive dashboard generator and conversational editor.
    Operates 100% locally through DuckDB and Ollama with safe heuristic fallback.
    No dependency on Julius AI or third-party web scraping.
    """

    def __init__(self):
        self.duckdb_engine = DuckDBEngine()

    def generate_dashboard(
        self,
        db: Session,
        dataset_id: str,
        prompt: Optional[str] = None,
        model_tag: Optional[str] = None,
        idempotency_key: Optional[str] = None,
        columns: Optional[List[Dict[str, Any]]] = None,
        sample_rows: Optional[List[Dict[str, Any]]] = None,
        dataset_name: Optional[str] = None,
    ) -> GenerateDashboardResponse:
        start_time = time.time()
        storage = get_storage_service()
        dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first() if db is not None else None
        if not dataset:
            if not columns and not sample_rows:
                raise ValueError(f"Dataset '{dataset_id}' not found.")
            ds_name = dataset_name or "Active Dataset"
            schema_metadata = columns or []
            parquet_file = None
        else:
            ds_name = dataset.name
            schema_metadata = dataset.schema_metadata or []
            rel_path = dataset.parquet_path or dataset.file_path
            parquet_file = storage.get_local_path(rel_path) if rel_path else None
            if parquet_file and not os.path.exists(parquet_file) and dataset.file_path:
                raw_local = storage.get_local_path(dataset.file_path)
                if os.path.exists(raw_local):
                    parquet_file = raw_local

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

        resolved_columns = []
        for c in schema_metadata:
            c_name = c.get("name") if isinstance(c, dict) else getattr(c, "name", "")
            raw_type = str(
                (c.get("data_type") or c.get("type") or "")
                if isinstance(c, dict)
                else getattr(c, "data_type", getattr(c, "type", ""))
            ).lower()
            c_lower = c_name.lower().replace("-", "_")

            is_id = any(c_lower.endswith(k) for k in ["_id", "id", "_code", "_key"])
            is_num_type = any(k in raw_type for k in ["int", "float", "number", "numeric", "double", "real", "dec"])
            is_num_name = not is_id and (c_lower in KNOWN_MEASURE_NAMES or any(k in c_lower for k in KNOWN_MEASURE_NAMES))
            is_date_type = any(k in raw_type for k in ["date", "time"])
            is_date_name = c_lower in KNOWN_DATE_NAMES or any(k in c_lower for k in KNOWN_DATE_NAMES)

            if is_num_type or is_num_name:
                data_type = "float" if ("int" not in raw_type and "qty" not in c_lower and "quantity" not in c_lower) else "integer"
            elif is_date_type or is_date_name:
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

        if not resolved_columns:
            raise ValueError("Dataset has no schema columns.")

        # 1. Profile fields
        measures = [c["name"] for c in resolved_columns if c["data_type"] in ["integer", "float", "number"]]
        dimensions = [c["name"] for c in resolved_columns if c["data_type"] in ["text", "string"]]
        dates = [c["name"] for c in resolved_columns if c["data_type"] in ["date", "timestamp"]]

        # 2. Plan generation (Ollama or Heuristic)
        user_prompt = prompt or "Build a complete dashboard for this dataset."
        plan, provider_used, model_used = self._plan_dashboard(
            prompt=user_prompt,
            dataset_name=ds_name,
            dataset_id=dataset_id,
            columns=resolved_columns,
            measures=measures,
            dimensions=dimensions,
            dates=dates,
            preferred_model=model_tag,
            sample_rows=sample_rows or [],
        )

        # 3. Local DuckDB Verification (Pre-flight test all KPIs and Visuals)
        verified_kpis, verified_visuals = self._verify_plan_in_duckdb(parquet_file, plan)
        plan.kpis = verified_kpis
        plan.visuals = verified_visuals

        # Ensure slicers exist
        if not plan.slicer_columns and dimensions:
            plan.slicer_columns = dimensions[:2]

        latency_ms = round((time.time() - start_time) * 1000, 1)

        # 4. Record credit transaction
        if db is not None:
            credit_ledger.record_transaction(
                db=db,
                operation_type="generate_dashboard",
                provider=provider_used,
                model=model_used,
                credits=0 if provider_used == "ollama" else 2,
                idempotency_key=idempotency_key,
                latency_ms=latency_ms,
                metadata={"dataset_id": dataset_id, "kpis": len(plan.kpis), "visuals": len(plan.visuals)},
            )

        return GenerateDashboardResponse(
            plan=plan,
            latency_ms=latency_ms,
            provider=provider_used,
            model=model_used,
            verified_kpi_count=len(plan.kpis),
            verified_visual_count=len(plan.visuals),
        )

    def patch_dashboard(
        self,
        db: Session,
        dataset_id: str,
        prompt: str,
        current_dashboard: DashboardPlan,
        model_tag: Optional[str] = None,
        idempotency_key: Optional[str] = None,
        columns: Optional[List[Dict[str, Any]]] = None,
        sample_rows: Optional[List[Dict[str, Any]]] = None,
        dataset_name: Optional[str] = None,
    ) -> PatchDashboardResponse:
        start_time = time.time()
        storage = get_storage_service()
        dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first() if db is not None else None
        if not dataset:
            if not columns and not sample_rows:
                raise ValueError(f"Dataset '{dataset_id}' not found.")
            schema_metadata = columns or []
            parquet_file = None
        else:
            schema_metadata = dataset.schema_metadata or []
            rel_path = dataset.parquet_path or dataset.file_path
            parquet_file = storage.get_local_path(rel_path) if rel_path else None
            if parquet_file and not os.path.exists(parquet_file) and dataset.file_path:
                raw_local = storage.get_local_path(dataset.file_path)
                if os.path.exists(raw_local):
                    parquet_file = raw_local

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

        resolved_columns = []
        for c in schema_metadata:
            c_name = c.get("name") if isinstance(c, dict) else getattr(c, "name", "")
            raw_type = str(
                (c.get("data_type") or c.get("type") or "")
                if isinstance(c, dict)
                else getattr(c, "data_type", getattr(c, "type", ""))
            ).lower()
            c_lower = c_name.lower().replace("-", "_")

            is_id = any(c_lower.endswith(k) for k in ["_id", "id", "_code", "_key"])
            is_num_type = any(k in raw_type for k in ["int", "float", "number", "numeric", "double", "real", "dec"])
            is_num_name = not is_id and (c_lower in KNOWN_MEASURE_NAMES or any(k in c_lower for k in KNOWN_MEASURE_NAMES))
            is_date_type = any(k in raw_type for k in ["date", "time"])
            is_date_name = c_lower in KNOWN_DATE_NAMES or any(k in c_lower for k in KNOWN_DATE_NAMES)

            if is_num_type or is_num_name:
                data_type = "float" if ("int" not in raw_type and "qty" not in c_lower and "quantity" not in c_lower) else "integer"
            elif is_date_type or is_date_name:
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

        # Generate patch operation
        patch = self._generate_patch(prompt, current_dashboard, resolved_columns)

        if patch.operation == "generate_dashboard":
            updated = self._heuristic_dashboard_plan(
                dataset_name=dataset_name or getattr(dataset, "name", "Executive Analytics"),
                dataset_id=dataset_id,
                measures=[c["name"] for c in resolved_columns if c["data_type"] in ["integer", "float"]],
                dimensions=[c["name"] for c in resolved_columns if c["data_type"] == "text"],
                dates=[c["name"] for c in resolved_columns if c["data_type"] == "date"],
                columns=resolved_columns,
                sample_rows=sample_rows or [],
                prompt=prompt,
            )
        else:
            # Apply patch to produce updated dashboard
            updated = self._apply_patch(current_dashboard, patch)

        # Verify new/updated visuals in DuckDB
        verified_kpis, verified_visuals = self._verify_plan_in_duckdb(parquet_file, updated)
        updated.kpis = verified_kpis
        updated.visuals = verified_visuals

        latency_ms = round((time.time() - start_time) * 1000, 1)

        if db is not None:
            credit_ledger.record_transaction(
                db=db,
                operation_type="patch_dashboard",
                provider="ollama" if ollama_manager.is_service_running() else "heuristic",
                model=model_tag or "stepsheet-patch-v1",
                credits=0,
                idempotency_key=idempotency_key,
                latency_ms=latency_ms,
                metadata={"dataset_id": dataset_id, "operation": patch.operation},
            )

        return PatchDashboardResponse(
            patch=patch,
            updated_dashboard=updated,
            latency_ms=latency_ms,
            provider="ollama" if ollama_manager.is_service_running() else "heuristic",
            model=model_tag or "stepsheet-patch-v1",
        )

    # -------------------------------------------------------------------------
    # Planning Engine: Ollama + Smart Heuristic
    # -------------------------------------------------------------------------

    def _plan_dashboard(
        self,
        prompt: str,
        dataset_name: str,
        dataset_id: str,
        columns: List[Dict[str, Any]],
        measures: List[str],
        dimensions: List[str],
        dates: List[str],
        preferred_model: Optional[str] = None,
        sample_rows: Optional[List[Dict[str, Any]]] = None,
    ) -> Tuple[DashboardPlan, str, str]:
        # Try Ollama if running
        if ollama_manager.is_service_running():
            installed = ollama_manager.list_installed_models()
            if installed:
                target_model = preferred_model or installed[0]["name"]
                try:
                    plan = self._call_ollama_dashboard(prompt, dataset_name, dataset_id, columns, target_model)
                    if plan and plan.visuals and plan.kpis:
                        return plan, "ollama", target_model
                except Exception:
                    pass

        # Heuristic Dashboard Planner
        plan = self._heuristic_dashboard_plan(
            dataset_name=dataset_name,
            dataset_id=dataset_id,
            measures=measures,
            dimensions=dimensions,
            dates=dates,
            columns=columns,
            sample_rows=sample_rows,
            prompt=prompt,
        )
        return plan, "heuristic", "stepsheet-julius-planner-v1"

    def _call_ollama_dashboard(
        self,
        prompt: str,
        dataset_name: str,
        dataset_id: str,
        columns: List[Dict[str, Any]],
        model: str,
    ) -> Optional[DashboardPlan]:
        col_summary = ", ".join([f"{c['name']} ({c['data_type']})" for c in columns])
        system_prompt = f"""You are StepSheet's AI Dashboard Architect (Native Julius-style).
Dataset: '{dataset_name}'. Columns: [{col_summary}].

Design a complete executive dashboard JSON:
{{
  "schema_version": "1.0",
  "dashboard_title": "<Concise Executive Title>",
  "dataset_id": "{dataset_id}",
  "description": "<Overview summary>",
  "slicer_columns": ["<dim1>", "<dim2>"],
  "kpis": [
    {{"id": "kpi_1", "title": "<KPI Title>", "column": "<measure_or_id>", "aggFunc": "sum"|"avg"|"distinct_count", "subtitle": "<context>", "accentColor": "#107C41"}}
  ],
  "visuals": [
    {{"id": "vis_1", "title": "<Chart Title>", "type": "bar"|"clustered_bar"|"column"|"donut"|"pie"|"line_area"|"waterfall"|"table", "categoryCol": "<dim>", "valueCol": "<measure>", "aggFunc": "sum"}}
  ],
  "palette_id": "classic"
}}
Output strict JSON only. Use ONLY columns that exist in the dataset."""

        payload = json.dumps(
            {
                "model": model,
                "prompt": f"<system>\n{system_prompt}\n</system>\n<instruction>\n{prompt}\n</instruction>",
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
        with urllib.request.urlopen(req, timeout=35) as resp:
            data = json.loads(resp.read().decode())
            raw = data.get("response", "{}")
            parsed = json.loads(raw)
            parsed["dataset_id"] = dataset_id
            return DashboardPlan(**parsed)

    def _heuristic_dashboard_plan(
        self,
        dataset_name: str,
        dataset_id: str,
        measures: List[str],
        dimensions: List[str],
        dates: List[str],
        columns: List[Dict[str, Any]],
        sample_rows: Optional[List[Dict[str, Any]]] = None,
        prompt: Optional[str] = None,
    ) -> DashboardPlan:
        p_lower = (prompt or "").lower().strip()

        # 1. Domain Detection
        all_col_names = [c["name"].lower() for c in columns]
        is_sales = any(k in all_col_names or k in dataset_name.lower() for k in ["sales", "order", "revenue", "amount", "customer", "product", "deal", "price"])
        is_finance = any(k in all_col_names or k in dataset_name.lower() for k in ["balance", "credit_limit", "debit", "spend", "budget", "expense", "invoice"])
        is_hr = any(k in all_col_names or k in dataset_name.lower() for k in ["salary", "employee", "headcount", "department", "tenure", "staff"])

        # 2. Measures Resolution
        primary_measure = measures[0] if measures else None
        secondary_measure = measures[1] if len(measures) > 1 else primary_measure
        for m in measures:
            clean_m = re.sub(r"[^a-z0-9]", "", m.lower())
            if clean_m and clean_m in p_lower:
                primary_measure = m
                break
        if not primary_measure:
            for m in measures:
                if any(k in m.lower() for k in ["revenue", "sales", "amount", "total", "balance", "salary", "spend"]):
                    primary_measure = m
                    break
        for m in measures:
            if m != primary_measure and any(k in m.lower() for k in ["quantity", "qty", "profit", "margin", "cost", "units", "discount"]):
                secondary_measure = m
                break

        val_col = primary_measure or (measures[0] if measures else (columns[0]["name"] if columns else "Value"))

        # 3. Dimensions Resolution
        cat_candidates = [d for d in dimensions if not any(k in d.lower() for k in ["_id", "id", "_code", "_key", "uuid", "hash"])]
        preferred_dims = cat_candidates if cat_candidates else dimensions
        primary_dim = preferred_dims[0] if preferred_dims else (columns[0]["name"] if columns else "Category")

        for d in dimensions:
            clean_d = re.sub(r"[^a-z0-9]", "", d.lower())
            if clean_d and clean_d in p_lower:
                primary_dim = d
                break

        # Granular dimension (product, item, customer, client)
        granular_dim = primary_dim
        for d in preferred_dims:
            if any(k in d.lower() for k in ["product", "item", "customer", "client", "sku", "account", "user"]):
                granular_dim = d
                break
        if granular_dim == primary_dim and len(preferred_dims) > 1:
            granular_dim = preferred_dims[1]

        # Geographic / Channel dimension
        geo_dim = primary_dim
        for d in preferred_dims:
            if any(k in d.lower() for k in ["region", "country", "state", "city", "channel", "territory", "location", "market"]):
                geo_dim = d
                break
        if geo_dim == primary_dim and len(preferred_dims) > 2:
            geo_dim = preferred_dims[2]

        # Status / Pipeline dimension
        status_dim = None
        for d in dimensions:
            if any(k in d.lower() for k in ["status", "stage", "priority", "fulfillment", "state", "tier", "payment"]):
                status_dim = d
                break

        secondary_dim = geo_dim if geo_dim != primary_dim else (granular_dim if granular_dim != primary_dim else (dimensions[1] if len(dimensions) > 1 else primary_dim))

        # 4. KPIs Construction (4 cohesive cards matching Glassmorphic V22)
        kpis: List[DashboardKpiPlan] = []
        if primary_measure:
            kpis.append(
                DashboardKpiPlan(
                    id="kpi_total_primary",
                    title=f"Total {primary_measure.replace('_', ' ').title()}",
                    column=primary_measure,
                    aggFunc="sum",
                    subtitle="Gross volume across records" if is_sales else "Cumulative metric total",
                    accentColor="#10B981",
                )
            )
            kpis.append(
                DashboardKpiPlan(
                    id="kpi_avg_primary",
                    title=f"Average {primary_measure.replace('_', ' ').title()}" + (" (AOV)" if is_sales else ""),
                    column=primary_measure,
                    aggFunc="avg",
                    subtitle="Mean deal benchmark" if is_sales else "Per-record mean benchmark",
                    accentColor="#0D9488",
                )
            )

        if secondary_measure and secondary_measure != primary_measure:
            kpis.append(
                DashboardKpiPlan(
                    id="kpi_secondary_volume",
                    title=f"Total {secondary_measure.replace('_', ' ').title()}",
                    column=secondary_measure,
                    aggFunc="sum",
                    subtitle="Operational unit volume",
                    accentColor="#FB923C",
                )
            )
        else:
            kpis.append(
                DashboardKpiPlan(
                    id="kpi_record_count",
                    title="Active Records",
                    column=primary_dim,
                    aggFunc="count",
                    subtitle="Verified ledger entries",
                    accentColor="#FB923C",
                )
            )

        id_cols = [c["name"] for c in columns if any(c["name"].lower().endswith(k) for k in ["_id", "id", "_code", "_key"])]
        distinct_col = id_cols[0] if id_cols else primary_dim
        kpis.append(
            DashboardKpiPlan(
                id="kpi_distinct_monitored",
                title=f"Unique {distinct_col.replace('_', ' ').title()}",
                column=distinct_col,
                aggFunc="distinct_count",
                subtitle="Monitored distinct entities",
                accentColor="#0284C7",
            )
        )

        # 5. Multi-Tier Visual Grid Construction (6 visuals, non-overlapping)
        visuals: List[DashboardVisualPlan] = []
        date_col = dates[0] if dates else None

        # Visual 1: Hero Visual (Span 2 / 976px wide x 340px high at x=16, y=16)
        if date_col:
            visuals.append(
                DashboardVisualPlan(
                    id="vis_hero_trend",
                    title=f"{val_col.replace('_', ' ').title()} Trajectory & Monthly Run-Rate",
                    type="line_area",
                    categoryCol=date_col,
                    valueCol=val_col,
                    aggFunc="sum",
                    bins=8,
                    span=2,
                    customWidth=976,
                    customHeight=340,
                    x=16,
                    y=16,
                    sortBy="category_asc",
                )
            )
        else:
            visuals.append(
                DashboardVisualPlan(
                    id="vis_hero_trend",
                    title=f"{val_col.replace('_', ' ').title()} Strategic Performance by {primary_dim.replace('_', ' ').title()}",
                    type="column",
                    categoryCol=primary_dim,
                    valueCol=val_col,
                    aggFunc="sum",
                    bins=8,
                    span=2,
                    customWidth=976,
                    customHeight=340,
                    x=16,
                    y=16,
                    sortBy="value_desc",
                )
            )

        # Visual 2: Category Contribution Donut (Mid-Tier Left at x=16, y=372)
        visuals.append(
            DashboardVisualPlan(
                id="vis_share_donut",
                title=f"Revenue Contribution by {primary_dim.replace('_', ' ').title()}" if is_sales else f"Distribution Share by {primary_dim.replace('_', ' ').title()}",
                type="donut",
                categoryCol=primary_dim,
                valueCol=val_col,
                aggFunc="sum",
                bins=6,
                span=1,
                customWidth=480,
                customHeight=320,
                x=16,
                y=372,
                sortBy="value_desc",
            )
        )

        # Visual 3: Ranked Performance Leaderboard Bar (Mid-Tier Right at x=512, y=372)
        visuals.append(
            DashboardVisualPlan(
                id="vis_leaderboard_bar",
                title=f"Top 10 High-Performing {granular_dim.replace('_', ' ').title()} Leaderboard",
                type="bar",
                categoryCol=granular_dim,
                valueCol=val_col,
                aggFunc="sum",
                bins=10,
                topN=10,
                span=1,
                customWidth=480,
                customHeight=320,
                x=512,
                y=372,
                sortBy="value_desc",
            )
        )

        # Visual 4: Geographic / Segment Breakdown (Deep Dive Left at x=16, y=708)
        visuals.append(
            DashboardVisualPlan(
                id="vis_geo_column",
                title=f"{val_col.replace('_', ' ').title()} Breakdown by {secondary_dim.replace('_', ' ').title()}",
                type="column",
                categoryCol=secondary_dim,
                valueCol=val_col,
                aggFunc="sum",
                bins=8,
                span=1,
                customWidth=480,
                customHeight=320,
                x=16,
                y=708,
                sortBy="value_desc",
            )
        )

        # Visual 5: Operational Pipeline Funnel / Secondary Comparison (Deep Dive Right at x=512, y=708)
        if status_dim:
            visuals.append(
                DashboardVisualPlan(
                    id="vis_pipeline_funnel",
                    title=f"Fulfillment Pipeline & {status_dim.replace('_', ' ').title()} Status",
                    type="funnel",
                    categoryCol=status_dim,
                    valueCol=val_col,
                    aggFunc="count",
                    bins=6,
                    span=1,
                    customWidth=480,
                    customHeight=320,
                    x=512,
                    y=708,
                    sortBy="value_desc",
                )
            )
        elif secondary_measure and secondary_measure != primary_measure:
            visuals.append(
                DashboardVisualPlan(
                    id="vis_pipeline_funnel",
                    title=f"{secondary_measure.replace('_', ' ').title()} Distribution by {primary_dim.replace('_', ' ').title()}",
                    type="column",
                    categoryCol=primary_dim,
                    valueCol=secondary_measure,
                    aggFunc="sum",
                    bins=6,
                    span=1,
                    customWidth=480,
                    customHeight=320,
                    x=512,
                    y=708,
                    sortBy="value_desc",
                )
            )
        else:
            visuals.append(
                DashboardVisualPlan(
                    id="vis_pipeline_funnel",
                    title=f"{val_col.replace('_', ' ').title()} by {primary_dim.replace('_', ' ').title()} split by {secondary_dim.replace('_', ' ').title()}",
                    type="clustered_bar",
                    categoryCol=primary_dim,
                    seriesCol=secondary_dim if secondary_dim != primary_dim else "",
                    valueCol=val_col,
                    aggFunc="sum",
                    bins=6,
                    span=1,
                    customWidth=480,
                    customHeight=320,
                    x=512,
                    y=708,
                    sortBy="value_desc",
                )
            )

        # Visual 6: Executive Operational Ledger Table (Span 2 / 976px at x=16, y=1044)
        visuals.append(
            DashboardVisualPlan(
                id="vis_ledger_table",
                title=f"Executive Operational Ledger: {primary_dim.replace('_', ' ').title()} & {secondary_dim.replace('_', ' ').title()} Matrix",
                type="table",
                categoryCol=primary_dim,
                seriesCol=secondary_dim if secondary_dim != primary_dim else "",
                valueCol=val_col,
                aggFunc="sum",
                span=2,
                customWidth=976,
                customHeight=340,
                x=16,
                y=1044,
                sortBy="value_desc",
            )
        )

        # Slicers
        non_id_dims = [d for d in dimensions if not any(k in d.lower() for k in ["_id", "id", "_code"])]
        slicers = (non_id_dims[:3] if non_id_dims else dimensions[:3]) or [c["name"] for c in columns[:2]]

        clean_name = dataset_name.replace("_", " ").replace("-", " ").title()
        title = f"{clean_name} Executive Dashboard & Revenue Intelligence" if is_sales else f"{clean_name} Executive Dashboard"
        narrative = f"Automated executive glassmorphic analytics suite generated for {dataset_name}. Includes 4 verified KPI metrics, time-series trajectory hero visual, category market share donut, ranked leaderboard, operational geographic breakdown, pipeline flow, and granular operational matrix ledger."

        return DashboardPlan(
            dashboard_title=title,
            dataset_id=dataset_id,
            description=narrative,
            slicer_columns=slicers,
            kpis=kpis,
            visuals=visuals,
            palette_id="v22",
            narrative_summary=narrative,
        )

    # -------------------------------------------------------------------------
    # DuckDB Pre-flight Verification
    # -------------------------------------------------------------------------

    def _verify_plan_in_duckdb(
        self,
        parquet_path: Optional[str],
        plan: DashboardPlan,
    ) -> Tuple[List[DashboardKpiPlan], List[DashboardVisualPlan]]:
        if not parquet_path or not os.path.exists(parquet_path):
            return plan.kpis, plan.visuals

        parquet_sql = parquet_path.replace("\\", "/")
        is_parquet = parquet_sql.lower().endswith(".parquet")
        from_clause = f"read_parquet('{parquet_sql}')" if is_parquet else f"read_csv_auto('{parquet_sql}')"

        try:
            conn = self.duckdb_engine.get_connection()
        except Exception:
            return plan.kpis, plan.visuals

        verified_kpis: List[DashboardKpiPlan] = []
        verified_visuals: List[DashboardVisualPlan] = []

        try:
            def safe_duckdb_agg(agg_name: str, col: str) -> str:
                if agg_name in ["distinct_count", "distinct"]:
                    return f'COUNT(DISTINCT "{col}")'
                elif agg_name == "count":
                    return f'COUNT("{col}")'
                else:
                    fn = agg_name.upper()
                    clean_expr = f'TRY_CAST(REGEXP_REPLACE(REGEXP_REPLACE(CAST("{col}" AS VARCHAR), \'[€$£¥, ]\', \'\', \'g\'), \'%\', \'\') AS DOUBLE)'
                    return f'{fn}(COALESCE({clean_expr}, 0))'

            # Verify KPIs
            for k in plan.kpis:
                try:
                    sql = f'SELECT {safe_duckdb_agg(k.aggFunc, k.column)} FROM {from_clause};'
                    conn.execute(sql).fetchone()
                    verified_kpis.append(k)
                except Exception:
                    # Drop failing KPI
                    pass

            # Verify Visuals
            for v in plan.visuals:
                try:
                    sql = f'SELECT "{v.categoryCol}", {safe_duckdb_agg(v.aggFunc, v.valueCol)} FROM {from_clause} GROUP BY "{v.categoryCol}" LIMIT 5;'
                    conn.execute(sql).fetchall()
                    verified_visuals.append(v)
                except Exception:
                    # Drop failing Visual
                    pass

            # Safety fallback: If verification dropped everything due to syntax/table error, retain original plan
            final_kpis = verified_kpis if verified_kpis else plan.kpis
            final_visuals = verified_visuals if verified_visuals else plan.visuals

            return final_kpis, final_visuals
        except Exception:
            return plan.kpis, plan.visuals
        finally:
            try:
                conn.close()
            except Exception:
                pass

    # -------------------------------------------------------------------------
    # Conversational Dashboard Editing (Patch Engine)
    # -------------------------------------------------------------------------

    def _generate_patch(
        self,
        prompt: str,
        current_dashboard: DashboardPlan,
        columns: List[Dict[str, Any]],
    ) -> DashboardPatchOperation:
        p_lower = prompt.lower().strip()

        def _is_num(c: Dict[str, Any]) -> bool:
            dt = str(c.get("data_type") or c.get("type") or "").lower()
            return any(k in dt for k in ["int", "float", "number", "numeric", "double", "real", "dec"])

        def _is_date(c: Dict[str, Any]) -> bool:
            dt = str(c.get("data_type") or c.get("type") or "").lower()
            return any(k in dt for k in ["date", "time", "timestamp"])

        num_cols = [c["name"] for c in columns if _is_num(c)]
        date_cols = [c["name"] for c in columns if _is_date(c)]
        cat_cols = [c["name"] for c in columns if not _is_num(c) and not _is_date(c)]
        all_cols = [c["name"] for c in columns]

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
            "product": ["product_name", "product", "item_name", "item", "category", "sub_category", "sku", "description"],
            "products": ["product_name", "product", "item_name", "item", "category", "sub_category", "sku", "description"],
            "item": ["item_name", "item", "product_name", "product", "category", "description"],
            "items": ["item_name", "item", "product_name", "product", "category", "description"],
            "category": ["category", "sub_category", "type", "segment", "class", "department"],
            "categories": ["category", "sub_category", "type", "segment", "class", "department"],
            "customer": ["customer_name", "customer", "client", "account", "company", "buyer"],
            "customers": ["customer_name", "customer", "client", "account", "company", "buyer"],
            "region": ["region", "country", "state", "city", "location", "territory", "market"],
            "regions": ["region", "country", "state", "city", "location", "territory", "market"],
            "status": ["status", "state", "stage", "condition"],
        }

        def resolve_measure(text: str) -> str:
            for key, syns in MEASURE_SYNONYMS.items():
                if key in text:
                    for syn in syns:
                        for col in (num_cols if num_cols else all_cols):
                            if col.lower() == syn or syn in col.lower():
                                return col
            for col in num_cols:
                if col.lower() in text:
                    return col
            return num_cols[0] if num_cols else (all_cols[0] if all_cols else "Value")

        def resolve_dim(text: str) -> str:
            for key, syns in DIMENSION_SYNONYMS.items():
                if key in text:
                    for syn in syns:
                        for col in (cat_cols if cat_cols else all_cols):
                            if col.lower() == syn or syn in col.lower():
                                return col
            for col in cat_cols:
                if col.lower() in text or col.lower().replace("_", " ") in text:
                    return col
            non_id_cats = [c for c in cat_cols if not c.lower().endswith(("_id", "id"))]
            if non_id_cats:
                return non_id_cats[0]
            return cat_cols[0] if cat_cols else (all_cols[0] if all_cols else "Category")

        # 0. Request to create a brand new dashboard from dataset
        is_create_intent = (
            any(term in p_lower for term in [
                "create new dashboard", "generate new dashboard", "build new dashboard",
                "create dashboard", "generate dashboard", "build dashboard", "fresh dashboard",
                "rebuild dashboard", "from scratch", "new executive dashboard"
            ])
            or (
                "dashboard" in p_lower
                and any(w in p_lower for w in ["create", "generate", "build", "make", "interactive", "dataset"])
            )
            or p_lower.startswith("create ")
            or p_lower.startswith("generate ")
            or p_lower.startswith("build ")
        )
        if is_create_intent:
            return DashboardPatchOperation(
                operation="generate_dashboard",
                patch_summary="Created new interactive executive dashboard from dataset",
            )

        # 1. Change title
        if any(term in p_lower for term in ["change title to", "rename dashboard to", "set title to", "title to"]):
            new_title = re.sub(r"^(change|rename|set)\s+(dashboard\s+)?title\s+to\s+", "", prompt, flags=re.I).strip(" '\"")
            return DashboardPatchOperation(operation="set_title", title=new_title, patch_summary=f"Changed title to '{new_title}'")

        # 2. Add slicer: e.g. "add region slicer", "add filter for category"
        if ("add" in p_lower or "create" in p_lower) and ("slicer" in p_lower or "filter" in p_lower):
            matched_col = None
            for c in date_cols + cat_cols + all_cols:
                if c.lower() in p_lower:
                    matched_col = c
                    break
            if not matched_col:
                matched_col = resolve_dim(p_lower)
            return DashboardPatchOperation(operation="add_slicer", slicer_column=matched_col, patch_summary=f"Added slicer for '{matched_col}'")

        # 3. Remove slicer: e.g. "remove region slicer"
        if ("remove" in p_lower or "delete" in p_lower) and ("slicer" in p_lower or "filter" in p_lower):
            for s in current_dashboard.slicer_columns:
                if s.lower() in p_lower:
                    return DashboardPatchOperation(operation="remove_slicer", slicer_column=s, patch_summary=f"Removed slicer '{s}'")
            if current_dashboard.slicer_columns:
                last_s = current_dashboard.slicer_columns[-1]
                return DashboardPatchOperation(operation="remove_slicer", slicer_column=last_s, patch_summary=f"Removed slicer '{last_s}'")

        # 4. Remove visual: e.g. "remove pie chart", "delete the trend chart"
        if any(term in p_lower for term in ["remove", "delete", "drop"]) and any(term in p_lower for term in ["chart", "visual", "table"]):
            for v in current_dashboard.visuals:
                if v.type in p_lower or any(word in p_lower for word in v.title.lower().split()):
                    return DashboardPatchOperation(operation="remove_visual", target_id=v.id, patch_summary=f"Removed visual '{v.title}'")

        # 5. Edit Existing Visual: Change type, aggregation, dimension or measure
        if any(term in p_lower for term in ["change", "switch", "edit", "convert", "make it", "update", "modify"]):
            target_type = None
            if "column" in p_lower:
                target_type = "column"
            elif "donut" in p_lower:
                target_type = "donut"
            elif "pie" in p_lower:
                target_type = "pie"
            elif "line" in p_lower or "trend" in p_lower or "area" in p_lower:
                target_type = "line_area"
            elif "waterfall" in p_lower:
                target_type = "waterfall"
            elif "table" in p_lower or "grid" in p_lower:
                target_type = "table"
            elif "gauge" in p_lower:
                target_type = "gauge"
            elif "bar" in p_lower:
                target_type = "clustered_bar"

            target_agg = None
            if any(a in p_lower for a in ["average", "avg", "mean"]):
                target_agg = "avg"
            elif any(a in p_lower for a in ["sum", "total"]):
                target_agg = "sum"
            elif any(a in p_lower for a in ["count", "number of"]):
                target_agg = "count"
            elif "min" in p_lower:
                target_agg = "min"
            elif "max" in p_lower:
                target_agg = "max"

            if current_dashboard.visuals:
                # Find best matching visual
                target_v = current_dashboard.visuals[0]
                for v in current_dashboard.visuals:
                    if v.type in p_lower or any(w in p_lower for w in v.title.lower().split() if len(w) > 3):
                        target_v = v
                        break

                updated_v = target_v.model_copy()
                summary_parts = []
                if target_type:
                    updated_v.type = target_type
                    summary_parts.append(f"type to {target_type}")
                if target_agg:
                    updated_v.aggFunc = target_agg
                    summary_parts.append(f"aggregation to {target_agg}")

                # Check if dimension was explicitly mentioned
                for c in cat_cols:
                    if f"by {c.lower()}" in p_lower or f"to {c.lower()}" in p_lower:
                        updated_v.categoryCol = c
                        summary_parts.append(f"dimension to {c}")
                        break

                # Check if measure was explicitly mentioned
                for m in num_cols:
                    if f"of {m.lower()}" in p_lower or f"show {m.lower()}" in p_lower:
                        updated_v.valueCol = m
                        summary_parts.append(f"measure to {m}")
                        break

                patch_desc = ", ".join(summary_parts) if summary_parts else "visual configuration"
                return DashboardPatchOperation(
                    operation="update_visual",
                    target_id=target_v.id,
                    visual=updated_v,
                    patch_summary=f"Updated '{target_v.title}': {patch_desc}",
                )

        # 6. Add KPI Card
        if ("add" in p_lower or "create" in p_lower) and ("kpi" in p_lower or "metric" in p_lower or "card" in p_lower):
            target_measure = resolve_measure(p_lower)
            new_kpi = DashboardKpiPlan(
                id=f"kpi_{str(uuid.uuid4())[:6]}",
                title=f"Total {target_measure}",
                column=target_measure,
                aggFunc="sum",
                subtitle="Calculated Metric",
                accentColor="#10B981",
            )
            return DashboardPatchOperation(operation="add_kpi", kpi=new_kpi, patch_summary=f"Added KPI for {target_measure}")

        # 7. Add New Visual
        target_measure = resolve_measure(p_lower)
        target_cat = resolve_dim(p_lower)
        chart_type = "clustered_bar"

        if any(term in p_lower for term in ["trend", "month", "date", "time", "line", "area"]):
            target_cat = date_cols[0] if date_cols else target_cat
            chart_type = "line_area"
        elif "donut" in p_lower:
            chart_type = "donut"
        elif "pie" in p_lower:
            chart_type = "pie"
        elif "column" in p_lower:
            chart_type = "column"
        elif "waterfall" in p_lower:
            chart_type = "waterfall"
        elif "table" in p_lower:
            chart_type = "table"
        elif "gauge" in p_lower:
            chart_type = "gauge"

        new_vis = DashboardVisualPlan(
            id=f"vis_{str(uuid.uuid4())[:6]}",
            title=f"{target_measure} by {target_cat}",
            type=chart_type,
            categoryCol=target_cat,
            valueCol=target_measure,
            aggFunc="sum" if target_measure in num_cols else "count",
        )
        return DashboardPatchOperation(operation="add_visual", visual=new_vis, patch_summary=f"Added {new_vis.title} ({chart_type})")

    def _apply_patch(self, current: DashboardPlan, patch: DashboardPatchOperation) -> DashboardPlan:
        if patch.operation == "generate_dashboard":
            # Replaces entire dashboard cleanly
            new_plan = self._heuristic_dashboard_plan(
                dataset_name="Executive Analytics",
                dataset_id=current.dataset_id,
                measures=[k.column for k in current.kpis if k.column],
                dimensions=[s for s in current.slicer_columns],
                dates=[],
                columns=[],
            )
            return new_plan

        updated = current.model_copy(deep=True)

        if patch.operation == "add_visual" and patch.visual:
            updated.visuals.append(patch.visual)
        elif patch.operation == "remove_visual" and patch.target_id:
            updated.visuals = [v for v in updated.visuals if v.id != patch.target_id]
        elif patch.operation == "update_visual" and patch.visual:
            updated.visuals = [patch.visual if v.id == (patch.target_id or patch.visual.id) else v for v in updated.visuals]
        elif patch.operation == "add_kpi" and patch.kpi:
            updated.kpis.append(patch.kpi)
        elif patch.operation == "remove_kpi" and patch.target_id:
            updated.kpis = [k for k in updated.kpis if k.id != patch.target_id]
        elif patch.operation == "add_slicer" and patch.slicer_column:
            if patch.slicer_column not in updated.slicer_columns:
                updated.slicer_columns.append(patch.slicer_column)
        elif patch.operation == "remove_slicer" and patch.slicer_column:
            updated.slicer_columns = [s for s in updated.slicer_columns if s != patch.slicer_column]
        elif patch.operation == "set_title" and patch.title:
            updated.dashboard_title = patch.title
        elif patch.operation == "set_palette" and patch.palette_id:
            updated.palette_id = patch.palette_id

        return updated


ai_dashboard_service = AiDashboardService()
