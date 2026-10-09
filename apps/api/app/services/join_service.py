from typing import List, Dict, Any, Tuple, Optional
from app.schemas.joins import (
    JoinKeyPair,
    JoinType,
    CardinalityVerdict,
    TypeMismatch,
    PreJoinHealthCheckResponse,
    JoinResultReport,
)
from app.services.duckdb_engine import duckdb_engine


class JoinService:
    @staticmethod
    def run_health_check(
        left_parquet_path: str,
        right_parquet_path: str,
        key_pairs: List[JoinKeyPair],
        join_type: JoinType = "left",
    ) -> PreJoinHealthCheckResponse:
        """
        Runs pre-join health check before join is executed:
        - Detects type mismatches with suggested casts
        - Computes duplicate keys on each side
        - Reports clear cardinality verdict (1:1, 1:N, N:1, N:N)
        - Generates fan-out warnings and estimated match rate
        """
        conn = duckdb_engine.get_connection()
        left_sql = left_parquet_path.replace("\\", "/")
        right_sql = right_parquet_path.replace("\\", "/")

        try:
            # 1. Row counts
            left_total = conn.execute(f"SELECT count(*) FROM read_parquet('{left_sql}');").fetchone()[0]
            right_total = conn.execute(f"SELECT count(*) FROM read_parquet('{right_sql}');").fetchone()[0]

            if not key_pairs:
                return PreJoinHealthCheckResponse(
                    left_row_count=left_total,
                    right_row_count=right_total,
                    left_key_nulls=0,
                    right_key_nulls=0,
                    left_key_duplicates=0,
                    right_key_duplicates=0,
                    cardinality="one-to-one",
                    cardinality_description="No keys specified (Cross join behavior)",
                    fanout_warning=f"Cross join will produce {left_total * right_total:,} rows!" if join_type == "cross" else None,
                    type_mismatches=[],
                    estimated_match_rate=100.0 if join_type == "cross" else 0.0,
                    estimated_result_rows=left_total * right_total if join_type == "cross" else left_total,
                    suggested_fixes=[],
                )

            # Get column types from DESCRIBE
            left_desc = {r[0]: r[1] for r in conn.execute(f"DESCRIBE SELECT * FROM read_parquet('{left_sql}');").fetchall()}
            right_desc = {r[0]: r[1] for r in conn.execute(f"DESCRIBE SELECT * FROM read_parquet('{right_sql}');").fetchall()}

            type_mismatches: List[TypeMismatch] = []
            suggested_fixes: List[str] = []

            for kp in key_pairs:
                l_type = left_desc.get(kp.left_col, "VARCHAR")
                r_type = right_desc.get(kp.right_col, "VARCHAR")
                if l_type.upper() != r_type.upper():
                    # Simple compatibility check
                    l_simple = duckdb_engine.map_duckdb_type_to_simple(l_type)
                    r_simple = duckdb_engine.map_duckdb_type_to_simple(r_type)
                    if l_simple != r_simple:
                        type_mismatches.append(
                            TypeMismatch(
                                left_col=kp.left_col,
                                left_type=l_type,
                                right_col=kp.right_col,
                                right_type=r_type,
                                suggested_cast=f"Cast '{kp.right_col}' to {l_type}",
                            )
                        )
                        suggested_fixes.append(
                            f"Type mismatch on '{kp.left_col}' ({l_simple}) ↔ '{kp.right_col}' ({r_simple}). Enable auto-cast or change type."
                        )

            # Check nulls and uniqueness for primary key pair
            p_key = key_pairs[0]
            l_col = f'"{p_key.left_col}"'
            r_col = f'"{p_key.right_col}"'

            l_stats = conn.execute(
                f"""
                SELECT 
                    count(*) - count({l_col}) as nulls,
                    count({l_col}) - approx_count_distinct({l_col}) as dups,
                    approx_count_distinct({l_col}) as distinct_cnt
                FROM read_parquet('{left_sql}');
            """
            ).fetchone()
            left_nulls = l_stats[0]
            left_dups = max(0, l_stats[1])
            left_distinct = l_stats[2]

            r_stats = conn.execute(
                f"""
                SELECT 
                    count(*) - count({r_col}) as nulls,
                    count({r_col}) - approx_count_distinct({r_col}) as dups,
                    approx_count_distinct({r_col}) as distinct_cnt
                FROM read_parquet('{right_sql}');
            """
            ).fetchone()
            right_nulls = r_stats[0]
            right_dups = max(0, r_stats[1])
            right_distinct = r_stats[2]

            # Cardinality determination
            left_has_dups = left_dups > 0
            right_has_dups = right_dups > 0

            cardinality: CardinalityVerdict
            card_desc: str

            if not left_has_dups and not right_has_dups:
                cardinality = "one-to-one"
                card_desc = "Each record in the left table matches at most one record in the right table (ideal for lookups)."
            elif not left_has_dups and right_has_dups:
                cardinality = "one-to-many"
                card_desc = "Left key is unique, but right table contains duplicate keys. Result rows will expand."
            elif left_has_dups and not right_has_dups:
                cardinality = "many-to-one"
                card_desc = "Left table has multiple occurrences of keys matching single lookup records in the right table."
            else:
                cardinality = "many-to-many"
                card_desc = "Both tables contain duplicate keys. Multiplicative row expansion (fan-out) will occur."

            # Calculate match rate
            match_conds = []
            for kp in key_pairs:
                lc = f'l."{kp.left_col}"'
                rc = f'r."{kp.right_col}"'
                if kp.trim_whitespace:
                    lc = f'trim(cast({lc} as varchar))'
                    rc = f'trim(cast({rc} as varchar))'
                if kp.case_insensitive:
                    lc = f'lower(cast({lc} as varchar))'
                    rc = f'lower(cast({rc} as varchar))'
                match_conds.append(f"{lc} = {rc}")

            on_clause = " AND ".join(match_conds)

            match_query = f"""
                SELECT 
                    count(distinct l."{p_key.left_col}") as matched_keys,
                    count(*) as total_matched_rows
                FROM read_parquet('{left_sql}') l
                INNER JOIN read_parquet('{right_sql}') r ON {on_clause};
            """
            m_res = conn.execute(match_query).fetchone()
            matched_keys = m_res[0]
            matched_rows = m_res[1]

            match_rate = round((matched_keys / max(left_distinct, 1)) * 100, 1)

            # Fanout detection
            fanout_warning = None
            est_rows = left_total

            if join_type in ["left", "inner", "full"]:
                if right_has_dups:
                    fanout_warning = (
                        f"Fan-out Warning: The right table has {right_dups:,} duplicate keys. "
                        f"Your result will expand to ~{matched_rows:,} rows vs {left_total:,} in the left table. "
                        f"This may inflate sum and total aggregations!"
                    )
                    suggested_fixes.append("Enable 'Deduplicate Right Table First' to prevent row inflation.")
                    est_rows = matched_rows
                elif join_type == "left":
                    est_rows = left_total
                elif join_type == "inner":
                    est_rows = matched_rows

            if left_nulls > 0:
                suggested_fixes.append(f"Left table has {left_nulls:,} null keys which will not match.")
            if right_nulls > 0:
                suggested_fixes.append(f"Right table has {right_nulls:,} null keys which will not match.")

            return PreJoinHealthCheckResponse(
                left_row_count=left_total,
                right_row_count=right_total,
                left_key_nulls=left_nulls,
                right_key_nulls=right_nulls,
                left_key_duplicates=left_dups,
                right_key_duplicates=right_dups,
                cardinality=cardinality,
                cardinality_description=card_desc,
                fanout_warning=fanout_warning,
                type_mismatches=type_mismatches,
                estimated_match_rate=min(match_rate, 100.0),
                estimated_result_rows=est_rows,
                suggested_fixes=suggested_fixes,
            )

        finally:
            conn.close()


join_service = JoinService()
