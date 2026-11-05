from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


class HistoryItemRead(BaseModel):
    id: int
    user_id: int
    query_type: str
    query_preview: str
    trust_score: float
    verdict: str
    analysis_id: Optional[int] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
