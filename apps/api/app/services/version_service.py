import uuid
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from app.models.version import ProjectVersion
from app.models.pipeline import Pipeline
from app.schemas.version import (
    StepDiffItem,
    ParamDiffItem,
    VersionDiffResponse,
)


class VersionService:
    def create_version(
        self,
        db: Session,
        project_id: str,
        message: str,
        steps: List[Dict[str, Any]],
        author_email: str = "demo@stepsheet.dev",
        dataset_id: Optional[str] = None,
    ) -> ProjectVersion:
        # Determine next version number
        last_v = (
            db.query(ProjectVersion)
            .filter(ProjectVersion.project_id == project_id)
            .order_by(ProjectVersion.version_number.desc())
            .first()
        )
        next_ver = (last_v.version_number + 1) if last_v else 1

        version = ProjectVersion(
            id=str(uuid.uuid4()),
            project_id=project_id,
            version_number=next_ver,
            message=message,
            author_email=author_email,
            steps_snapshot=steps,
            dataset_id=dataset_id,
        )
        db.add(version)
        db.commit()
        db.refresh(version)
        return version

    def list_versions(self, db: Session, project_id: str) -> List[ProjectVersion]:
        return (
            db.query(ProjectVersion)
            .filter(ProjectVersion.project_id == project_id)
            .order_by(ProjectVersion.version_number.desc())
            .all()
        )

    def diff_steps(
        self,
        from_ver_num: int,
        to_ver_num: int,
        old_steps: List[Dict[str, Any]],
        new_steps: List[Dict[str, Any]],
    ) -> VersionDiffResponse:
        """
        Computes structured step diff between two versions:
        Identifies added steps, removed steps, and param-level modifications.
        """
        diff_items: List[StepDiffItem] = []
        old_map = {s.get("id"): (idx, s) for idx, s in enumerate(old_steps)}
        new_map = {s.get("id"): (idx, s) for idx, s in enumerate(new_steps)}

        added_count = 0
        removed_count = 0
        modified_count = 0

        # Check for modified or unchanged or added
        for idx, new_s in enumerate(new_steps):
            s_id = new_s.get("id")
            if s_id in old_map:
                old_idx, old_s = old_map[s_id]
                old_params = old_s.get("params", {})
                new_params = new_s.get("params", {})

                param_diffs: List[ParamDiffItem] = []
                all_keys = set(list(old_params.keys()) + list(new_params.keys()))
                for k in sorted(all_keys):
                    val_old = old_params.get(k)
                    val_new = new_params.get(k)
                    if val_old != val_new:
                        param_diffs.append(
                            ParamDiffItem(
                                param_key=k,
                                old_value=val_old,
                                new_value=val_new,
                            )
                        )

                # Check if label or enabled changed
                if old_s.get("enabled") != new_s.get("enabled"):
                    param_diffs.append(
                        ParamDiffItem(
                            param_key="enabled",
                            old_value=old_s.get("enabled"),
                            new_value=new_s.get("enabled"),
                        )
                    )
                if old_s.get("label") != new_s.get("label"):
                    param_diffs.append(
                        ParamDiffItem(
                            param_key="label",
                            old_value=old_s.get("label"),
                            new_value=new_s.get("label"),
                        )
                    )

                if param_diffs or old_idx != idx:
                    modified_count += 1
                    diff_items.append(
                        StepDiffItem(
                            step_id=s_id,
                            change_type="modified",
                            step_type=new_s.get("type", "step"),
                            label=new_s.get("label", ""),
                            old_position=old_idx + 1,
                            new_position=idx + 1,
                            param_diffs=param_diffs,
                        )
                    )
            else:
                # Newly added step
                added_count += 1
                diff_items.append(
                    StepDiffItem(
                        step_id=s_id,
                        change_type="added",
                        step_type=new_s.get("type", "step"),
                        label=new_s.get("label", ""),
                        old_position=None,
                        new_position=idx + 1,
                        param_diffs=[],
                    )
                )

        # Check for removed steps
        for old_id, (old_idx, old_s) in old_map.items():
            if old_id not in new_map:
                removed_count += 1
                diff_items.append(
                    StepDiffItem(
                        step_id=old_id,
                        change_type="removed",
                        step_type=old_s.get("type", "step"),
                        label=old_s.get("label", ""),
                        old_position=old_idx + 1,
                        new_position=None,
                        param_diffs=[],
                    )
                )

        return VersionDiffResponse(
            from_version=from_ver_num,
            to_version=to_ver_num,
            total_changes=added_count + removed_count + modified_count,
            added_count=added_count,
            removed_count=removed_count,
            modified_count=modified_count,
            diff_steps=diff_items,
        )

    def restore_version(
        self,
        db: Session,
        project_id: str,
        version_id: str,
        author_email: str = "demo@stepsheet.dev",
    ) -> ProjectVersion:
        """
        Restores the pipeline steps from a chosen historical version and commits
        a new version milestone noting the rollback.
        """
        target_v = (
            db.query(ProjectVersion)
            .filter(ProjectVersion.id == version_id, ProjectVersion.project_id == project_id)
            .first()
        )
        if not target_v:
            raise ValueError("Target version not found")

        # Update latest pipeline if one exists
        pipeline = db.query(Pipeline).filter(Pipeline.project_id == project_id).first()
        if pipeline:
            pipeline.steps = target_v.steps_snapshot
            db.commit()

        # Create new version milestone representing the restore
        new_version = self.create_version(
            db=db,
            project_id=project_id,
            message=f"Reverted to Version {target_v.version_number} ('{target_v.message}')",
            steps=target_v.steps_snapshot,
            author_email=author_email,
            dataset_id=target_v.dataset_id,
        )
        return new_version


version_service = VersionService()
