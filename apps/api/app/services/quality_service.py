import uuid
import datetime
from typing import List, Dict, Any, Optional
import duckdb
from app.services.duckdb_engine import duckdb_engine
from app.services.step_compiler import step_compiler
from app.schemas.quality import QualityRule, RuleResult, QualityReportResponse
from app.schemas.steps import StepSchema


class QualityService:
    """
    Data Integrity & Quality Suite:
    Executes analytical verification queries in DuckDB to produce comprehensive
    pass/fail audit reports, failing row samples, and reconciliation checks.
    """

    def evaluate_quality_rules(
        self,
        dataset_id: str,
        local_parquet_path: str,
        initial_columns: List[str],
        rules: List[QualityRule],
        pipeline_steps: Optional[List[StepSchema]] = None,
        dataset_paths: Optional[Dict[str, str]] = None,
    ) -> QualityReportResponse:
        conn = duckdb_engine.get_connection()
        escaped_path = local_parquet_path.replace("\\", "/")

        if pipeline_steps and len(pipeline_steps) > 0:
            compiled_sql, _, _ = step_compiler.compile_pipeline(
                parquet_path=local_parquet_path,
                steps=pipeline_steps,
                initial_columns=initial_columns,
                dataset_paths=dataset_paths or {dataset_id: local_parquet_path},
            )
            sql_source = compiled_sql
        else:
            sql_source = f"SELECT * FROM read_parquet('{escaped_path}')"

        # Register working CTE/view
        conn.execute(f"CREATE OR REPLACE TEMPORARY VIEW target_data AS {sql_source}")

        # Get total rows
        total_rows = conn.execute("SELECT COUNT(*) FROM target_data").fetchone()[0]

        results: List[RuleResult] = []
        passed_count = 0
        failed_count = 0

        for r in rules:
            rule_result = self._evaluate_single_rule(conn, r, total_rows, dataset_paths)
            results.append(rule_result)
            if rule_result.status == "pass":
                passed_count += 1
            else:
                failed_count += 1

        total_rules = len(rules)
        health_score = round((passed_count / total_rules * 100.0), 1) if total_rules > 0 else 100.0

        return QualityReportResponse(
            dataset_id=dataset_id,
            total_rules=total_rules,
            passed_count=passed_count,
            failed_count=failed_count,
            health_score=health_score,
            results=results,
            evaluated_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
        )

    def _evaluate_single_rule(
        self,
        conn: duckdb.DuckDBPyConnection,
        rule: QualityRule,
        total_rows: int,
        dataset_paths: Optional[Dict[str, str]] = None,
    ) -> RuleResult:
        col = rule.column
        rtype = rule.rule_type
        params = rule.params or {}

        fail_cond = ""
        query_expr = ""

        if rtype == "not_null":
            fail_cond = f'"{col}" IS NULL'
            query_expr = f'"{col}" IS NULL'

        elif rtype == "unique":
            query_expr = f'COUNT("{col}") > 1'
            fail_cond = f'"{col}" IN (SELECT "{col}" FROM target_data WHERE "{col}" IS NOT NULL GROUP BY "{col}" HAVING COUNT(*) > 1)'

        elif rtype == "range":
            min_v = params.get("min")
            max_v = params.get("max")
            conds = []
            if min_v is not None:
                conds.append(f'CAST("{col}" AS DOUBLE) < {min_v}')
            if max_v is not None:
                conds.append(f'CAST("{col}" AS DOUBLE) > {max_v}')
            fail_cond = " OR ".join(conds) if conds else "1=0"
            query_expr = f"NOT ({' AND '.join(conds)})" if conds else "True"

        elif rtype == "allowed_values":
            allowed = params.get("allowed_values", [])
            if allowed:
                formatted_vals = ", ".join([f"'{str(v).replace('\'', '\'\'')}'" for v in allowed])
                fail_cond = f'CAST("{col}" AS VARCHAR) NOT IN ({formatted_vals})'
                query_expr = f'"{col}" IN ({formatted_vals})'
            else:
                fail_cond = "1=0"
                query_expr = "True"

        elif rtype == "regex":
            pattern = params.get("pattern", "").replace("'", "''")
            fail_cond = f"NOT REGEXP_MATCHES(CAST(\"{col}\" AS VARCHAR), '{pattern}')"
            query_expr = f"REGEXP_MATCHES(\"{col}\", '{pattern}')"

        elif rtype == "cross_column":
            col2 = params.get("compare_column", "")
            op = params.get("operator", "<=")
            fail_cond = f'NOT ("{col}" {op} "{col2}")'
            query_expr = f'"{col}" {op} "{col2}"'

        elif rtype == "referential_integrity":
            f_ds_id = params.get("foreign_dataset_id")
            f_col = params.get("foreign_column", col)
            f_path = (dataset_paths or {}).get(f_ds_id, "") if f_ds_id else ""
            if f_path:
                try:
                    f_esc = f_path.replace("\\", "/")
                    count_q = f"""
                        SELECT COUNT(*) FROM target_data t
                        LEFT JOIN read_parquet('{f_esc}') f ON t."{col}" = f."{f_col}"
                        WHERE t."{col}" IS NOT NULL AND f."{f_col}" IS NULL
                    """
                    sample_query = f"""
                        SELECT t.* FROM target_data t
                        LEFT JOIN read_parquet('{f_esc}') f ON t."{col}" = f."{f_col}"
                        WHERE t."{col}" IS NOT NULL AND f."{f_col}" IS NULL
                        LIMIT 10
                    """
                    failed_count = conn.execute(count_q).fetchone()[0]
                    cur = conn.execute(sample_query)
                    s_cols = [d[0] for d in cur.description]
                    sample_rows = [dict(zip(s_cols, r)) for r in cur.fetchall()]
                    pct = round((failed_count / total_rows * 100.0), 2) if total_rows > 0 else 0.0
                    return RuleResult(
                        rule_id=rule.id,
                        rule_type=rtype,
                        column=col,
                        label=rule.label,
                        severity=rule.severity,
                        status="pass" if failed_count == 0 else "fail",
                        total_rows=total_rows,
                        failed_rows_count=failed_count,
                        failed_percentage=pct,
                        sample_failing_rows=sample_rows,
                        query_expression=f'Foreign key exists in {f_col}',
                        message=f"{failed_count} orphans found without match in reference table" if failed_count > 0 else "All keys found in reference table",
                    )
                except Exception:
                    fail_cond = "1=0"
            else:
                fail_cond = "1=0"

        elif rtype == "row_count_reconciliation":
            target_count = params.get("target_count")
            diff = abs(total_rows - int(target_count)) if target_count is not None else 0
            is_pass = diff == 0
            return RuleResult(
                rule_id=rule.id,
                rule_type=rtype,
                column="[dataset]",
                label=rule.label,
                severity=rule.severity,
                status="pass" if is_pass else "fail",
                total_rows=total_rows,
                failed_rows_count=diff,
                failed_percentage=0.0,
                sample_failing_rows=[],
                query_expression=f"COUNT(*) == {target_count}",
                message=f"Row count matches expected {target_count}" if is_pass else f"Row count {total_rows} differs from expected {target_count} by {diff} rows",
            )

        elif rtype == "sum_reconciliation":
            ref_sum = float(params.get("reference_sum", 0.0))
            tol = float(params.get("tolerance", 0.01))
            actual_sum = conn.execute(f'SELECT COALESCE(SUM(CAST("{col}" AS DOUBLE)), 0.0) FROM target_data').fetchone()[0]
            diff = abs(actual_sum - ref_sum)
            is_pass = diff <= tol
            return RuleResult(
                rule_id=rule.id,
                rule_type=rtype,
                column=col,
                label=rule.label,
                severity=rule.severity,
                status="pass" if is_pass else "fail",
                total_rows=total_rows,
                failed_rows_count=0 if is_pass else 1,
                failed_percentage=0.0,
                sample_failing_rows=[],
                query_expression=f'SUM("{col}") == {ref_sum} (±{tol})',
                message=f"Sum {actual_sum:.2f} matches reference {ref_sum:.2f}" if is_pass else f"Sum {actual_sum:.2f} differs from reference {ref_sum:.2f} by {diff:.2f}",
            )

        else:
            fail_cond = "1=0"

        count_sql = f"SELECT COUNT(*) FROM target_data WHERE {fail_cond}"
        sample_sql = f"SELECT * FROM target_data WHERE {fail_cond} LIMIT 10"

        try:
            failed_count = conn.execute(count_sql).fetchone()[0]
            cur = conn.execute(sample_sql)
            s_cols = [d[0] for d in cur.description]
            sample_rows = [dict(zip(s_cols, r)) for r in cur.fetchall()]
        except Exception:
            failed_count = 0
            sample_rows = []

        pct = round((failed_count / total_rows * 100.0), 2) if total_rows > 0 else 0.0
        status = "pass" if failed_count == 0 else "fail"
        msg = f"Passed: 0 violations" if status == "pass" else f"Failed: {failed_count} rows ({pct}%) violate {rule.label}"

        return RuleResult(
            rule_id=rule.id,
            rule_type=rtype,
            column=col,
            label=rule.label,
            severity=rule.severity,
            status=status,
            total_rows=total_rows,
            failed_rows_count=failed_count,
            failed_percentage=pct,
            sample_failing_rows=sample_rows,
            query_expression=query_expr,
            message=msg,
        )

    def generate_quick_audit_rules(self, dataset_id: str, columns: List[Dict[str, Any]]) -> List[QualityRule]:
        rules: List[QualityRule] = []

        for col in columns:
            name = col["name"]
            dtype = col.get("data_type", "text")

            if any(k in name.lower() for k in ["id", "key", "code", "email", "date"]):
                rules.append(
                    QualityRule(
                        id=str(uuid.uuid4()),
                        rule_type="not_null",
                        column=name,
                        label=f"{name} must not be null",
                        severity="error",
                    )
                )

            if name.lower() in ["id", "order_id", "customer_id", "email"]:
                rules.append(
                    QualityRule(
                        id=str(uuid.uuid4()),
                        rule_type="unique",
                        column=name,
                        label=f"{name} must be unique",
                        severity="error",
                    )
                )

            if dtype in ["integer", "float"] and any(k in name.lower() for k in ["amount", "price", "revenue", "cost", "qty", "quantity", "score"]):
                rules.append(
                    QualityRule(
                        id=str(uuid.uuid4()),
                        rule_type="range",
                        column=name,
                        label=f"{name} must be >= 0",
                        severity="warning",
                        params={"min": 0},
                    )
                )

        if not rules and columns:
            rules.append(
                QualityRule(
                    id=str(uuid.uuid4()),
                    rule_type="not_null",
                    column=columns[0]["name"],
                    label=f"{columns[0]['name']} must not be null",
                    severity="warning",
                )
            )

        return rules


quality_service = QualityService()
