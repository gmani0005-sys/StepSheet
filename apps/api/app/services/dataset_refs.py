"""Shared helper for collecting every dataset_id a pipeline's steps refer to
(lookups, joins, and multi-file appends). Both /pipelines/preview and the
export endpoints need this, and previously only resolved
lookup_dataset_id/right_dataset_id/append_dataset_id -- silently missing the
`dataset_ids` LIST used by multi-file append (SPEC.md flaw)."""
from typing import Iterable, List


SINGLE_REF_KEYS = ("lookup_dataset_id", "right_dataset_id", "append_dataset_id")


def collect_referenced_dataset_ids(steps: Iterable) -> List[str]:
    """Return every dataset_id referenced by any step's params, preserving
    first-seen order and de-duplicating. `steps` is a list of StepSchema (or
    anything with a `.params` dict)."""
    seen = []
    for s in steps:
        params = getattr(s, "params", None) or {}
        for key in SINGLE_REF_KEYS:
            ref_id = params.get(key)
            if ref_id and ref_id not in seen:
                seen.append(ref_id)
        many = params.get("dataset_ids")
        if isinstance(many, (list, tuple)):
            for ref_id in many:
                if ref_id and ref_id not in seen:
                    seen.append(ref_id)
    return seen
