import math
from typing import List, Dict, Any, Optional
from app.schemas.profiling import ColumnProfile, DatasetProfileResponse, TopValue, HistogramBin
from app.services.duckdb_engine import duckdb_engine


class ProfilerService:
    @staticmethod
    def profile_dataset(parquet_path: str) -> DatasetProfileResponse:
        """
        Generate rich column profiling statistics for a Parquet dataset.
        Computes null counts, uniqueness, min/max/mean/median, top values, and histograms.
        """
        conn = duckdb_engine.get_connection()
        parquet_sql = parquet_path.replace("\\", "/")

        try:
            # 1. Total rows
            total_rows = conn.execute(f"SELECT count(*) FROM read_parquet('{parquet_sql}');").fetchone()[0]

            # 2. Schema
            columns_info = conn.execute(f"DESCRIBE SELECT * FROM read_parquet('{parquet_sql}');").fetchall()

            profiles: List[ColumnProfile] = []

            for col_row in columns_info:
                col_name = str(col_row[0])
                duck_type = str(col_row[1])
                simple_type = duckdb_engine.map_duckdb_type_to_simple(duck_type)
                safe_col = f'"{col_name}"'

                if total_rows == 0:
                    profiles.append(ColumnProfile(
                        column_name=col_name,
                        data_type=simple_type,
                        total_count=0,
                        null_count=0,
                        null_percentage=0.0,
                        distinct_count=0,
                        distinct_percentage=0.0,
                        is_unique=False,
                    ))
                    continue

                # Basic counts
                counts_query = f"""
                    SELECT 
                        count(*) as total,
                        count({safe_col}) as non_null,
                        approx_count_distinct({safe_col}) as distinct_cnt
                    FROM read_parquet('{parquet_sql}');
                """
                cnt_row = conn.execute(counts_query).fetchone()
                total = cnt_row[0]
                non_null = cnt_row[1]
                null_count = total - non_null
                null_pct = round((null_count / total) * 100, 2) if total > 0 else 0.0
                distinct_cnt = cnt_row[2]
                distinct_pct = round((distinct_cnt / total) * 100, 2) if total > 0 else 0.0
                is_unique = (distinct_cnt == total and null_count == 0)

                min_val, max_val, mean_val, median_val, std_dev = None, None, None, None, None
                min_len, max_len, avg_len = None, None, None
                histogram_bins: Optional[List[HistogramBin]] = None

                # Numeric calculations
                if simple_type in ["integer", "float"] and non_null > 0:
                    try:
                        num_stats_query = f"""
                            SELECT 
                                min({safe_col}),
                                max({safe_col}),
                                avg({safe_col}),
                                median({safe_col}),
                                stddev({safe_col})
                            FROM read_parquet('{parquet_sql}')
                            WHERE {safe_col} IS NOT NULL;
                        """
                        num_stats = conn.execute(num_stats_query).fetchone()
                        min_val = num_stats[0]
                        max_val = num_stats[1]
                        mean_val = round(num_stats[2], 4) if num_stats[2] is not None else None
                        median_val = round(num_stats[3], 4) if num_stats[3] is not None else None
                        std_dev = round(num_stats[4], 4) if num_stats[4] is not None else None

                        # Histogram generation (10 buckets)
                        if min_val is not None and max_val is not None and min_val < max_val:
                            bucket_width = (max_val - min_val) / 10.0
                            hist_query = f"""
                                WITH buckets AS (
                                    SELECT 
                                        floor(({safe_col} - {min_val}) / {bucket_width}) as b_idx
                                    FROM read_parquet('{parquet_sql}')
                                    WHERE {safe_col} IS NOT NULL
                                )
                                SELECT 
                                    CASE WHEN b_idx >= 10 THEN 9 ELSE b_idx END as bucket,
                                    count(*) as cnt
                                FROM buckets
                                GROUP BY 1
                                ORDER BY 1;
                            """
                            bucket_counts = {int(r[0]): int(r[1]) for r in conn.execute(hist_query).fetchall()}
                            bins = []
                            for i in range(10):
                                b_start = min_val + i * bucket_width
                                b_end = min_val + (i + 1) * bucket_width
                                b_cnt = bucket_counts.get(i, 0)
                                bins.append(HistogramBin(
                                    bin_start=round(float(b_start), 2),
                                    bin_end=round(float(b_end), 2),
                                    count=b_cnt,
                                    label=f"{round(float(b_start), 1)} - {round(float(b_end), 1)}"
                                ))
                            histogram_bins = bins
                    except Exception:
                        pass

                # Date calculations
                elif simple_type in ["date", "timestamp"] and non_null > 0:
                    try:
                        date_stats_query = f"""
                            SELECT min({safe_col}), max({safe_col})
                            FROM read_parquet('{parquet_sql}')
                            WHERE {safe_col} IS NOT NULL;
                        """
                        d_stats = conn.execute(date_stats_query).fetchone()
                        min_val = str(d_stats[0]) if d_stats[0] is not None else None
                        max_val = str(d_stats[1]) if d_stats[1] is not None else None
                    except Exception:
                        pass

                # Text calculations
                elif simple_type == "text" and non_null > 0:
                    try:
                        text_stats_query = f"""
                            SELECT 
                                min(length(cast({safe_col} as varchar))),
                                max(length(cast({safe_col} as varchar))),
                                avg(length(cast({safe_col} as varchar)))
                            FROM read_parquet('{parquet_sql}')
                            WHERE {safe_col} IS NOT NULL;
                        """
                        t_stats = conn.execute(text_stats_query).fetchone()
                        min_len = t_stats[0]
                        max_len = t_stats[1]
                        avg_len = round(t_stats[2], 1) if t_stats[2] is not None else None
                    except Exception:
                        pass

                # Top frequent values
                top_values: List[TopValue] = []
                try:
                    top_query = f"""
                        SELECT {safe_col}, count(*) as cnt
                        FROM read_parquet('{parquet_sql}')
                        WHERE {safe_col} IS NOT NULL
                        GROUP BY 1
                        ORDER BY cnt DESC
                        LIMIT 5;
                    """
                    for t_row in conn.execute(top_query).fetchall():
                        val = t_row[0]
                        cnt = t_row[1]
                        pct = round((cnt / total) * 100, 2) if total > 0 else 0.0
                        top_values.append(TopValue(
                            value=val if not (isinstance(val, float) and (math.isnan(val) or math.isinf(val))) else None,
                            count=cnt,
                            percentage=pct
                        ))
                except Exception:
                    pass

                profiles.append(ColumnProfile(
                    column_name=col_name,
                    data_type=simple_type,
                    total_count=total,
                    null_count=null_count,
                    null_percentage=null_pct,
                    distinct_count=distinct_cnt,
                    distinct_percentage=distinct_pct,
                    is_unique=is_unique,
                    min_value=min_val,
                    max_value=max_val,
                    mean_value=mean_val,
                    median_value=median_val,
                    std_dev=std_dev,
                    min_length=min_len,
                    max_length=max_len,
                    avg_length=avg_len,
                    top_values=top_values,
                    histogram=histogram_bins,
                ))

            return DatasetProfileResponse(
                dataset_id="",  # caller sets id
                total_rows=total_rows,
                total_columns=len(columns_info),
                columns=profiles
            )

        finally:
            conn.close()


profiler_service = ProfilerService()
