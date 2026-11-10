import uuid
from typing import Dict, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.ai_credit import AiCreditTransaction


class CreditLedgerService:
    """
    Manages AI credit accounting, entitlement verification, idempotency,
    and refund policies in strict compliance with Section 8 of the Master Prompt.
    Local Ollama inference is 100% free and unlimited.
    """

    DEFAULT_STARTER_CREDITS = 100
    LOCAL_PROVIDER = "ollama"

    def get_entitlement_status(self, db: Session, user_id: Optional[str] = None, provider: str = "ollama") -> Dict[str, Any]:
        """
        Returns entitlement and remaining credits for the session.
        Local Ollama mode has unlimited free credits.
        """
        if provider == self.LOCAL_PROVIDER:
            return {
                "provider": "ollama",
                "is_unlimited": True,
                "credits_remaining": 999999,
                "credits_used": 0,
                "tier": "Local AI (Unlimited & Free)",
                "can_execute": True,
            }

        # Cloud provider calculation
        if not user_id:
            # Anonymous local-first session starter quota
            user_id = "default_local_user"

        total_debited = (
            db.query(func.coalesce(func.sum(AiCreditTransaction.credits_debited), 0))
            .filter(
                AiCreditTransaction.user_id == user_id,
                AiCreditTransaction.status == "completed",
            )
            .scalar()
        ) or 0

        remaining = max(0, self.DEFAULT_STARTER_CREDITS - int(total_debited))

        return {
            "provider": provider,
            "is_unlimited": False,
            "credits_total": self.DEFAULT_STARTER_CREDITS,
            "credits_used": int(total_debited),
            "credits_remaining": remaining,
            "tier": "Cloud AI Starter",
            "can_execute": remaining > 0,
        }

    def record_transaction(
        self,
        db: Session,
        operation_type: str,
        provider: str,
        model: str,
        credits: int = 0,
        user_id: Optional[str] = None,
        idempotency_key: Optional[str] = None,
        latency_ms: Optional[float] = None,
        prompt_tokens: Optional[int] = None,
        completion_tokens: Optional[int] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> AiCreditTransaction:
        """
        Records an auditable usage transaction. If an idempotency key matches
        an existing transaction, returns the existing record to prevent duplicate charges.
        """
        if idempotency_key:
            existing = (
                db.query(AiCreditTransaction)
                .filter(AiCreditTransaction.idempotency_key == idempotency_key)
                .first()
            )
            if existing:
                return existing

        tx = AiCreditTransaction(
            id=str(uuid.uuid4()),
            user_id=user_id or "default_local_user",
            idempotency_key=idempotency_key,
            operation_type=operation_type,
            provider=provider,
            model=model,
            credits_debited=0 if provider == self.LOCAL_PROVIDER else credits,
            status="completed",
            latency_ms=latency_ms,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            metadata_json=metadata,
        )
        db.add(tx)
        db.commit()
        db.refresh(tx)
        return tx

    def refund_transaction(self, db: Session, idempotency_key: str, reason: str = "operation_failed") -> bool:
        """
        Refunds or cancels a debited transaction when downstream processing fails.
        """
        if not idempotency_key:
            return False

        tx = (
            db.query(AiCreditTransaction)
            .filter(AiCreditTransaction.idempotency_key == idempotency_key)
            .first()
        )
        if tx and tx.status != "refunded":
            tx.status = "refunded"
            tx.credits_debited = 0
            if tx.metadata_json is None:
                tx.metadata_json = {}
            tx.metadata_json["refund_reason"] = reason
            db.commit()
            return True
        return False


credit_ledger = CreditLedgerService()
