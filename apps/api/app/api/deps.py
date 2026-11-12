from typing import Generator, Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.database import get_db
from app.core.security import decode_token
from app.models.user import User

security_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> User:
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = credentials.credentials
    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired access token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User identity not found in token",
        )
    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User does not exist or is inactive",
        )
    return user


def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> Optional[User]:
    if not credentials:
        # Fall back to demo user if available or None
        demo_user = db.query(User).filter(User.email == "demo@stepsheet.dev").first()
        return demo_user
    try:
        return get_current_user(credentials, db)
    except Exception:
        return db.query(User).filter(User.email == "demo@stepsheet.dev").first()


def get_current_user_enforced(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> Optional[User]:
    """The access-control entry point for preview/export/join/dataset
    endpoints. When settings.REQUIRE_AUTH is True, this behaves exactly like
    get_current_user (a valid bearer token is mandatory). When it is False
    (the default), it falls back to get_current_user_optional so anonymous/
    local use keeps working unchanged -- a known, documented tradeoff: every
    unauthenticated caller shares one demo account (see upload_dataset)."""
    if settings.REQUIRE_AUTH:
        return get_current_user(credentials, db)
    return get_current_user_optional(credentials, db)


def check_dataset_access(dataset, user: Optional[User]) -> None:
    """When REQUIRE_AUTH is enabled, enforce that `user` owns `dataset`.
    No-op when REQUIRE_AUTH is False (default), preserving current anonymous
    behaviour. Call this for the primary dataset AND every dataset referenced
    by a pipeline's steps (lookups, joins, appends)."""
    if not settings.REQUIRE_AUTH:
        return
    if dataset is None:
        return
    if not user or dataset.owner_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this dataset",
        )
