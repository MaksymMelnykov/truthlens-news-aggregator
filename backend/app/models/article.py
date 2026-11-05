from datetime import datetime, timezone
from typing import Optional, List, TYPE_CHECKING
from sqlalchemy import String, Text, Float, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.session import Base

if TYPE_CHECKING:
    from app.models.source import Source
    from app.models.analysis import AnalysisReport
    from app.models.bookmark import Bookmark


class Article(Base):
    __tablename__ = "articles"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    url: Mapped[str] = mapped_column(String(1024), unique=True, index=True, nullable=False)
    source_id: Mapped[Optional[int]] = mapped_column(ForeignKey("sources.id", ondelete="SET NULL"), nullable=True)
    domain: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    source_name: Mapped[str] = mapped_column(String(255), nullable=False)
    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    full_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    author: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    language: Mapped[str] = mapped_column(String(10), default="ua", nullable=False)
    category: Mapped[str] = mapped_column(String(100), default="Загальне", nullable=False)
    published_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )
    image_url: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    trust_score: Mapped[float] = mapped_column(Float, default=80.0, nullable=False)
    verdict: Mapped[str] = mapped_column(String(50), default="Verified", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    source: Mapped[Optional["Source"]] = relationship("Source", back_populates="articles")
    analysis_reports: Mapped[List["AnalysisReport"]] = relationship(
        "AnalysisReport", back_populates="article", cascade="all, delete-orphan"
    )
    bookmarks: Mapped[List["Bookmark"]] = relationship(
        "Bookmark", back_populates="article", cascade="all, delete-orphan"
    )
