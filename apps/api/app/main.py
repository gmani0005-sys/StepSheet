import uuid
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.database import engine, Base, SessionLocal
from app.api.v1.api import api_router
from app.models.user import User
from app.core.security import hash_password
from app.core.security_guard import EnterpriseSecurityGuardMiddleware, rate_limiter, micro_cache


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize SQLite / PostgreSQL tables
    Base.metadata.create_all(bind=engine)

    # Safe auto-migration for newly added columns in SQLite
    try:
        with engine.connect() as conn:
            result = conn.exec_driver_sql("PRAGMA table_info(project_shares)")
            cols = [row[1] for row in result.fetchall()]
            if cols and "passcode_hash" not in cols:
                conn.exec_driver_sql("ALTER TABLE project_shares ADD COLUMN passcode_hash VARCHAR(255)")
    except Exception:
        pass

    # Seed demo user if not present
    db = SessionLocal()
    try:
        demo_user = db.query(User).filter(User.email == "demo@stepsheet.dev").first()
        if not demo_user:
            demo_user = User(
                id=str(uuid.uuid4()),
                email="demo@stepsheet.dev",
                hashed_password=hash_password("demo123456"),
                full_name="Demo Analyst",
                is_active=True,
            )
            db.add(demo_user)
            db.commit()
    finally:
        db.close()

    # Enterprise background memory & cache sweeper (10-minute interval)
    async def _sweeper_loop():
        try:
            while True:
                await asyncio.sleep(600)
                rate_limiter.sweep_stale(300.0)
                micro_cache.sweep_stale()
        except asyncio.CancelledError:
            pass

    sweeper_task = asyncio.create_task(_sweeper_loop())

    yield

    sweeper_task.cancel()


app = FastAPI(
    title=settings.PROJECT_NAME,
    description="StepSheet: No-Code Data Workbench with Excel/CSV formula steps, DuckDB engine, and live virtualized grid.",
    version="0.1.0",
    lifespan=lifespan,
)

# Enterprise Security Guard (Bot protection & sliding-window rate limiting)
app.add_middleware(EnterpriseSecurityGuardMiddleware)

# Set up CORS
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=".*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)



@app.middleware("http")
async def add_request_id_header(request, call_next):
    req_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    response = await call_next(request)
    response.headers["X-Request-ID"] = req_id
    return response

# Health endpoint
@app.get("/health", tags=["System"])
def health_check():
    return {
        "status": "ok",
        "app": settings.PROJECT_NAME,
        "environment": settings.ENVIRONMENT,
        "storage": settings.STORAGE_BACKEND,
    }


# Include V1 API
app.include_router(api_router, prefix=settings.API_V1_STR)
