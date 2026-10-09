import re
import uuid
import copy
from typing import List, Dict, Any, Optional
from difflib import SequenceMatcher
from app.schemas.template import (
    RequiredColumnSchema,
    ColumnMappingSuggestion,
    SuggestMappingResponse,
    TemplateApplyResponse,
)


# Starter analytical templates
BUILTIN_TEMPLATES: List[Dict[str, Any]] = [
    {
        "id": "builtin-rev-margin",
        "name": "Revenue & Net Profit Margin",
        "category": "Finance",
        "description": "Calculates Net Revenue (Gross - Discounts), Gross Profit (Net - COGS), and rounded net revenue.",
        "is_builtin": True,
        "created_by": "StepSheet Built-in",
        "required_columns": [
            {"name": "gross_revenue", "data_type": "numeric", "description": "Gross sales or amount before discounts"},
            {"name": "discounts", "data_type": "numeric", "description": "Discount amount subtracted from sales"},
            {"name": "cogs", "data_type": "numeric", "description": "Cost of goods sold"},
        ],
        "steps": [
            {
                "id": "tpl-step-1",
                "type": "math_transform",
                "label": "Calculate Net Revenue = gross_revenue - discounts",
                "enabled": True,
                "params": {
                    "operation": "arithmetic",
                    "column1": "gross_revenue",
                    "column2": "discounts",
                    "math_operator": "-",
                    "output_column": "net_revenue",
                },
            },
            {
                "id": "tpl-step-2",
                "type": "math_transform",
                "label": "Calculate Gross Profit = net_revenue - cogs",
                "enabled": True,
                "params": {
                    "operation": "arithmetic",
                    "column1": "net_revenue",
                    "column2": "cogs",
                    "math_operator": "-",
                    "output_column": "gross_profit",
                },
            },
            {
                "id": "tpl-step-3",
                "type": "math_transform",
                "label": "Round Net Revenue",
                "enabled": True,
                "params": {
                    "operation": "round",
                    "column1": "net_revenue",
                    "decimals": 2,
                    "output_column": "net_revenue_rounded",
                },
            },
        ],
    },
    {
        "id": "builtin-cust-segment",
        "name": "Customer RFM & Tier Segmentation",
        "category": "Marketing",
        "description": "Standardizes customer names with PROPER case and assigns Platinum / Gold / Standard tier based on spend.",
        "is_builtin": True,
        "created_by": "StepSheet Built-in",
        "required_columns": [
            {"name": "customer_name", "data_type": "text", "description": "Customer full or display name"},
            {"name": "total_spend", "data_type": "numeric", "description": "Lifetime or annual spend amount"},
        ],
        "steps": [
            {
                "id": "tpl-step-1",
                "type": "text_transform",
                "label": "Standardize customer name to Title Case",
                "enabled": True,
                "params": {
                    "column": "customer_name",
                    "operation": "proper",
                    "target_column": "clean_customer_name",
                },
            },
            {
                "id": "tpl-step-2",
                "type": "conditional",
                "label": "Assign Customer Tier (Platinum / Gold / Standard)",
                "enabled": True,
                "params": {
                    "target_column": "customer_tier",
                    "rules": [
                        {
                            "column": "total_spend",
                            "operator": "gt",
                            "value": "2000",
                            "result": "Platinum",
                        },
                        {
                            "column": "total_spend",
                            "operator": "gt",
                            "value": "1000",
                            "result": "Gold",
                        },
                    ],
                    "default_value": "Standard",
                },
            },
        ],
    },
    {
        "id": "builtin-date-enrichment",
        "name": "Date Enrichment & Fiscal Quarter",
        "category": "Time Intelligence",
        "description": "Extracts Year, Month, Quarter, and Day Name from a transaction date.",
        "is_builtin": True,
        "created_by": "StepSheet Built-in",
        "required_columns": [
            {"name": "transaction_date", "data_type": "date", "description": "Event or transaction timestamp"},
        ],
        "steps": [
            {
                "id": "tpl-step-1",
                "type": "date_transform",
                "label": "Extract Year",
                "enabled": True,
                "params": {
                    "column": "transaction_date",
                    "operation": "part",
                    "part_name": "year",
                    "target_column": "trans_year",
                },
            },
            {
                "id": "tpl-step-2",
                "type": "date_transform",
                "label": "Extract Quarter",
                "enabled": True,
                "params": {
                    "column": "transaction_date",
                    "operation": "part",
                    "part_name": "quarter",
                    "target_column": "trans_quarter",
                },
            },
            {
                "id": "tpl-step-3",
                "type": "date_transform",
                "label": "Extract Month",
                "enabled": True,
                "params": {
                    "column": "transaction_date",
                    "operation": "part",
                    "part_name": "month",
                    "target_column": "trans_month",
                },
            },
        ],
    },
    {
        "id": "builtin-text-hygiene",
        "name": "Text Hygiene (Trim & Standardize Email)",
        "category": "Data Cleansing",
        "description": "Trims whitespace from contact names and lowercases email addresses.",
        "is_builtin": True,
        "created_by": "StepSheet Built-in",
        "required_columns": [
            {"name": "full_name", "data_type": "text", "description": "Raw name text"},
            {"name": "email_address", "data_type": "text", "description": "Email address"},
        ],
        "steps": [
            {
                "id": "tpl-step-1",
                "type": "text_transform",
                "label": "Trim full name whitespace",
                "enabled": True,
                "params": {
                    "column": "full_name",
                    "operation": "trim",
                    "target_column": "full_name_clean",
                },
            },
            {
                "id": "tpl-step-2",
                "type": "text_transform",
                "label": "Lowercase email address",
                "enabled": True,
                "params": {
                    "column": "email_address",
                    "operation": "lower",
                    "target_column": "email_address_clean",
                },
            },
        ],
    },
]


class TemplateService:
    def __init__(self):
        pass

    def get_builtin_templates(self) -> List[Dict[str, Any]]:
        return copy.deepcopy(BUILTIN_TEMPLATES)

    def suggest_column_mapping(
        self,
        required_columns: List[Dict[str, Any]],
        dataset_columns: List[str],
    ) -> List[ColumnMappingSuggestion]:
        """
        Fuzzy matches each required template column to the actual dataset columns.
        Uses exact token overlap, word similarity, substring checking, and SequenceMatcher.
        """
        suggestions: List[ColumnMappingSuggestion] = []

        def clean_token(s: str) -> str:
            return re.sub(r"[^a-z0-9]", "", s.lower())

        for req in required_columns:
            req_name = req["name"] if isinstance(req, dict) else req.name
            cleaned_req = clean_token(req_name)
            req_words = set(re.findall(r"[a-z0-9]+", req_name.lower()))

            best_match: Optional[str] = None
            best_score: float = 0.0
            match_reason = "Unmatched"

            for actual_col in dataset_columns:
                cleaned_actual = clean_token(actual_col)
                actual_words = set(re.findall(r"[a-z0-9]+", actual_col.lower()))

                # 1. Exact match (case insensitive, ignoring separators)
                if cleaned_actual == cleaned_req:
                    best_match = actual_col
                    best_score = 1.0
                    match_reason = "Exact match"
                    break

                # 2. Token overlap (e.g. 'gross' in 'gross_revenue' and 'sales_gross')
                overlap = req_words.intersection(actual_words)
                if overlap:
                    # Score based on how many words overlap
                    overlap_ratio = len(overlap) / max(len(req_words), 1)
                    score = 0.70 + (0.25 * overlap_ratio)
                    if score > best_score:
                        best_score = round(score, 2)
                        best_match = actual_col
                        match_reason = f"Keyword match ({', '.join(sorted(overlap))})"

                # 3. Substring match
                if cleaned_req in cleaned_actual or cleaned_actual in cleaned_req:
                    score = 0.85
                    if score > best_score:
                        best_score = score
                        best_match = actual_col
                        match_reason = f"Substring match on '{actual_col}'"

                # 4. Fuzzy ratio match
                ratio = SequenceMatcher(None, cleaned_req, cleaned_actual).ratio()
                if ratio > 0.65 and ratio > best_score:
                    best_score = round(ratio, 2)
                    best_match = actual_col
                    match_reason = f"Fuzzy similarity ({int(ratio * 100)}%)"

            if best_score < 0.6:
                best_match = None
                best_score = 0.0
                match_reason = "No matching column found"

            suggestions.append(
                ColumnMappingSuggestion(
                    template_column=req_name,
                    suggested_column=best_match,
                    confidence=best_score,
                    match_reason=match_reason,
                )
            )

        return suggestions

    def rewrite_steps_with_mapping(
        self,
        template_steps: List[Dict[str, Any]],
        column_mapping: Dict[str, str],
    ) -> List[Dict[str, Any]]:
        """
        Substitutes column names in template step definitions with target dataset column names.
        Preserves internal new calculated column references between consecutive steps.
        """
        rewritten: List[Dict[str, Any]] = []

        for step in template_steps:
            new_step = copy.deepcopy(step)
            new_step["id"] = str(uuid.uuid4())
            params = new_step.get("params", {})

            # Replace single column reference
            if "column" in params and params["column"] in column_mapping:
                params["column"] = column_mapping[params["column"]]

            # Replace column1 / column2 (math transforms)
            if "column1" in params and params["column1"] in column_mapping:
                params["column1"] = column_mapping[params["column1"]]
            if "column2" in params and params["column2"] in column_mapping:
                params["column2"] = column_mapping[params["column2"]]

            # Replace left/right columns
            if "left_column" in params and params["left_column"] in column_mapping:
                params["left_column"] = column_mapping[params["left_column"]]
            if "right_column" in params and params["right_column"] in column_mapping:
                params["right_column"] = column_mapping[params["right_column"]]

            # Replace list of columns
            for list_key in ["columns", "group_by_columns", "sort_columns"]:
                if list_key in params and isinstance(params[list_key], list):
                    params[list_key] = [
                        column_mapping.get(c, c) if isinstance(c, str) else c
                        for c in params[list_key]
                    ]

            # Replace conditional rules
            if "rules" in params and isinstance(params["rules"], list):
                for rule in params["rules"]:
                    if isinstance(rule, dict) and "column" in rule:
                        rule["column"] = column_mapping.get(rule["column"], rule["column"])

            # Replace math formula tokens
            if "formula" in params and isinstance(params["formula"], str):
                formula_str = params["formula"]
                for tpl_col, target_col in column_mapping.items():
                    formula_str = re.sub(
                        r"\{" + re.escape(tpl_col) + r"\}",
                        f"{{{target_col}}}",
                        formula_str,
                    )
                    formula_str = re.sub(
                        r"\b" + re.escape(tpl_col) + r"\b",
                        target_col,
                        formula_str,
                    )
                params["formula"] = formula_str

            # Update step label for clarity
            label_str = new_step.get("label", "")
            for tpl_col, target_col in column_mapping.items():
                label_str = label_str.replace(tpl_col, target_col)
            new_step["label"] = label_str
            new_step["params"] = params

            rewritten.append(new_step)

        return rewritten


template_service = TemplateService()
