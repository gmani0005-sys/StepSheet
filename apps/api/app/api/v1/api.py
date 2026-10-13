from fastapi import APIRouter
from app.api.v1.endpoints import (
    auth,
    datasets,
    profiling,
    projects,
    pipelines,
    joins,
    ai,
    quality,
    export,
    templates,
    versions,
    sharing,
    audit,
    export_jobs,
)

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
api_router.include_router(datasets.router, prefix="/datasets", tags=["Datasets"])
api_router.include_router(profiling.router, prefix="/profiling", tags=["Profiling"])
api_router.include_router(projects.router, prefix="/projects", tags=["Projects"])
api_router.include_router(pipelines.router, prefix="/pipelines", tags=["Pipelines"])
api_router.include_router(joins.router, prefix="/joins", tags=["Joins & Lookups"])
api_router.include_router(ai.router, prefix="/ai", tags=["AI Step Assistant"])
api_router.include_router(quality.router, prefix="/quality", tags=["Data Integrity & Quality"])
api_router.include_router(export.router, prefix="/export", tags=["Exporters & Pipeline Runner"])
api_router.include_router(export_jobs.router, prefix="/exports", tags=["Export Jobs & Delivery"])
api_router.include_router(templates.router, prefix="/templates", tags=["Templates & Column Mapping"])
api_router.include_router(versions.router, tags=["Versioning & Step Diff"])
api_router.include_router(sharing.router, tags=["Sharing & Access"])
api_router.include_router(audit.router, tags=["Audit Trail"])


@api_router.get("/health", tags=["System"])
def api_health():
    return {"status": "ok", "version": "0.1.0"}


