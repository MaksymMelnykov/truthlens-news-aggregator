from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict


class FactCheckClaimBase(BaseModel):
    claim: str
    claimant: Optional[str] = None
    fact_checker: str
    review_url: Optional[str] = None
    rating: str
    explanation: Optional[str] = None
    language: str = "ua"
    published_at: Optional[datetime] = None


class FactCheckClaimCreate(FactCheckClaimBase):
    pass


class FactCheckClaimRead(FactCheckClaimBase):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class FactCheckListResponse(BaseModel):
    total: int
    page: int
    page_size: int
    items: List[FactCheckClaimRead]


class FactCheckMatchResult(BaseModel):
    is_debunked: bool
    confidence: float
    matched_claim: Optional[FactCheckClaimRead] = None
    explanation: Optional[str] = None
