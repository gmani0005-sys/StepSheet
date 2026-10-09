import os
import json
import math
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
import duckdb
from app.core.config import settings
from app.schemas.dataset import ColumnSchema, FilterCondition, SortCondition


class DuckDBEngine:
    def __init__(self):
        # We use in-memory connections with configured limits
        pass

    def get_connection(self) -> duckdb.DuckDBPyConnection:
        conn = duckdb.connect(database=":memory:")
        conn.execute(f"SET memory_limit = '{settings.DUCKDB_MEMORY_LIMIT}';")
        conn.execute(f"SET threads = {settings.DUCKDB_THREADS};")
        return conn

    @staticmethod
    def map_duckdb_type_to_simple(duck_type: str) -> str:
        """Map DuckDB SQL types to high-level data types."""
        duck_upper = duck_type.upper()
        if any(t in duck_upper for t in ["INT", "BIGINT", "SMALLINT", "TINYINT", "HUGEINT"]):
            return "integer"
        if any(t in duck_upper for t in ["FLOAT", "DOUBLE", "DECIMAL", "NUMERIC", "REAL"]):
            return "float"
        if "BOOLEAN" in duck_upper or "BOOL" in duck_upper:
            return "boolean"
        if "DATE" in duck_upper and "TIMESTAMP" not in duck_upper:
            return "date"
        if "TIMESTAMP" in duck_upper or "TIME" in duck_upper:
            return "timestamp"
        return "text"

    def ingest_file_to_parquet(self, source_path: str, target_parquet_path: str, file_format: str) -> Tuple[int, int, List[ColumnSchema]]:
        """
        Ingest CSV or XLSX into an optimized Parquet file.
        Returns: (row_count, column_count, List[ColumnSchema])
        """
        conn = self.get_connection()
        target_parquet_path_sql = target_parquet_path.replace("\\", "/")
        source_path_sql = source_path.replace("\\", "/")

        try:
            if file_format.lower() == "csv":
                # Use DuckDB's high-speed multi-threaded CSV reader
                query = f"""
                    COPY (
                        SELECT * FROM read_csv_auto('{source_path_sql}', header=true, sample_size=20000, ignore_errors=true)
                    ) TO '{target_parquet_path_sql}' (FORMAT PARQUET, COMPRESSION ZSTD);
                """
                conn.execute(query)

            elif file_format.lower() in ["xlsx", "xls"]:
                # For Excel, use Polars or openpyxl to read sheet 1, write to parquet
                import polars as pl
                df = pl.read_excel(source_path)
                df.write_parquet(target_parquet_path, compression="zstd")

            elif file_format.lower() == "parquet":
                # Already parquet, copy or verify
                import shutil
                if source_path != target_parquet_path:
                    shutil.copyfile(source_path, target_parquet_path)

            else:
                raise ValueError(f"Unsupported file format: {file_format}")

            # Now inspect schema and row count from the generated parquet file
            inspect_query = f"DESCRIBE SELECT * FROM read_parquet('{target_parquet_path_sql}');"
            schema_rows = conn.execute(inspect_query).fetchall()

            columns: List[ColumnSchema] = []
            for col_row in schema_rows:
                col_name = str(col_row[0])
                duck_type = str(col_row[1])
                is_null = col_row[2] if len(col_row) > 2 else "YES"
                columns.append(ColumnSchema(
                    name=col_name,
                    physical_type=duck_type,
                    data_type=self.map_duckdb_type_to_simple(duck_type),
                    nullable=is_null == "YES",
                ))

            count_query = f"SELECT count(*) FROM read_parquet('{target_parquet_path_sql}');"
            row_count = conn.execute(count_query).fetchone()[0]

            return row_count, len(columns), columns

        finally:
            conn.close()

    def fetch_rows(
        self,
        parquet_path: str,
        offset: int = 0,
        limit: int = 100,
        sort_conditions: Optional[List[SortCondition]] = None,
        filter_conditions: Optional[List[FilterCondition]] = None,
        search_query: Optional[str] = None,
    ) -> Tuple[int, int, List[Dict[str, Any]], List[ColumnSchema]]:
        """
        Fetch a paginated window of rows from a Parquet dataset.
        Returns: (total_rows, filtered_rows, rows_as_dicts, columns)
        """
        conn = self.get_connection()
        parquet_sql = parquet_path.replace("\\", "/")

        try:
            # First, get schema
            desc_rows = conn.execute(f"DESCRIBE SELECT * FROM read_parquet('{parquet_sql}');").fetchall()
            columns: List[ColumnSchema] = []
            col_names: List[str] = []
            for r in desc_rows:
                col_name = str(r[0])
                duck_type = str(r[1])
                col_names.append(col_name)
                columns.append(ColumnSchema(
                    name=col_name,
                    physical_type=duck_type,
                    data_type=self.map_duckdb_type_to_simple(duck_type),
                    nullable=True
                ))

            # Total rows
            total_rows = conn.execute(f"SELECT count(*) FROM read_parquet('{parquet_sql}');").fetchone()[0]

            # Build WHERE clause
            where_clauses: List[str] = []
            params: List[Any] = []

            if search_query:
                # Text search across all columns
                search_parts = []
                for col in col_names:
                    safe_col = f'"{col}"'
                    search_parts.append(f"CAST({safe_col} AS VARCHAR) ILIKE ?")
                    params.append(f"%{search_query}%")
                if search_parts:
                    where_clauses.append(f"({' OR '.join(search_parts)})")

            if filter_conditions:
                for cond in filter_conditions:
                    if cond.column in col_names:
                        safe_col = f'"{cond.column}"'
                        op = cond.operator.lower()
                        if op == "eq":
                            where_clauses.append(f"{safe_col} = ?")
                            params.append(cond.value)
                        elif op == "neq":
                            where_clauses.append(f"{safe_col} != ?")
                            params.append(cond.value)
                        elif op == "contains":
                            where_clauses.append(f"CAST({safe_col} AS VARCHAR) ILIKE ?")
                            params.append(f"%{cond.value}%")
                        elif op == "gt":
                            where_clauses.append(f"{safe_col} > ?")
                            params.append(cond.value)
                        elif op == "gte":
                            where_clauses.append(f"{safe_col} >= ?")
                            params.append(cond.value)
                        elif op == "lt":
                            where_clauses.append(f"{safe_col} < ?")
                            params.append(cond.value)
                        elif op == "lte":
                            where_clauses.append(f"{safe_col} <= ?")
                            params.append(cond.value)
                        elif op == "is_null":
                            where_clauses.append(f"{safe_col} IS NULL")
                        elif op == "is_not_null":
                            where_clauses.append(f"{safe_col} IS NOT NULL")

            where_str = f" WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

            # Count filtered rows
            count_filtered_sql = f"SELECT count(*) FROM read_parquet('{parquet_sql}'){where_str};"
            if params:
                filtered_rows = conn.execute(count_filtered_sql, params).fetchone()[0]
            else:
                filtered_rows = conn.execute(count_filtered_sql).fetchone()[0]

            # Build ORDER BY
            order_clauses = []
            if sort_conditions:
                for s in sort_conditions:
                    if s.column in col_names:
                        dir_str = "DESC" if s.direction.lower() == "desc" else "ASC"
                        order_clauses.append(f'"{s.column}" {dir_str} NULLS LAST')

            order_str = f" ORDER BY {', '.join(order_clauses)}" if order_clauses else ""

            # Build query with limit and offset
            data_sql = f"SELECT * FROM read_parquet('{parquet_sql}'){where_str}{order_str} LIMIT {limit} OFFSET {offset};"

            # Fetch rows directly using native cursor
            cursor = conn.execute(data_sql, params) if params else conn.execute(data_sql)
            col_names_res = [desc[0] for desc in cursor.description]
            raw_rows = cursor.fetchall()

            # Clean NaNs, infs, and timestamps for JSON compliance
            rows_data = []
            for row in raw_rows:
                record = {}
                for col_name, val in zip(col_names_res, row):
                    if val is None:
                        record[col_name] = None
                    elif isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
                        record[col_name] = None
                    elif hasattr(val, "isoformat"):
                        record[col_name] = val.isoformat()
                    else:
                        record[col_name] = val
                rows_data.append(record)

            return total_rows, filtered_rows, rows_data, columns

        finally:
            conn.close()


duckdb_engine = DuckDBEngine()
