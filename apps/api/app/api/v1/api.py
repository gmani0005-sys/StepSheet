from fastapi import APIRouter
from app.api.v1.endpoints import auth, datasets, profiling, projects

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
api_router.include_router(datasets.router, prefix="/datasets", tags=["Datasets"])
api_router.include_router(profiling.router, prefix="/profiling", tags=["Profiling"])
api_router.include_router(projects.router, prefix="/projects", tags=["Projects"])
