from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import String, Text, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from app.db.session import Base


class FactCheckClaim(Base):
    __tablename__ = "fact_check_claims"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    claim: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    claimant: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    fact_checker: Mapped[str] = mapped_column(String(255), nullable=False)  # StopFake, VoxCheck, Google FactCheck
    review_url: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    rating: Mapped[str] = mapped_column(String(100), nullable=False)  # Фейк, Маніпуляція, Неправда
    explanation: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    language: Mapped[str] = mapped_column(String(10), default="ua", nullable=False)
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )
