from datetime import datetime, timezone
from typing import Optional, List, TYPE_CHECKING
from sqlalchemy import String, Text, Float, Boolean, DateTime, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.session import Base

if TYPE_CHECKING:
    from app.models.article import Article
    from app.models.user import User


class AnalysisReport(Base):
    __tablename__ = "analysis_reports"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    article_id: Mapped[Optional[int]] = mapped_column(ForeignKey("articles.id", ondelete="CASCADE"), nullable=True)
    url: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    input_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    
    trust_score: Mapped[float] = mapped_column(Float, nullable=False)
    verdict: Mapped[str] = mapped_column(String(50), nullable=False)
    stylometry_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    source_reputation_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    ml_authenticity_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    corroboration_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    fact_check_flag: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    manipulation_markers: Mapped[Optional[list]] = mapped_column(JSON, default=list, nullable=True)
    explanation: Mapped[str] = mapped_column(Text, nullable=False)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    article: Mapped[Optional["Article"]] = relationship("Article", back_populates="analysis_reports")
    user: Mapped[Optional["User"]] = relationship("User", back_populates="analysis_reports")
