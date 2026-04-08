from datetime import datetime
from typing import Optional, Any
from pydantic import BaseModel, Field


class AuditLogResponse(BaseModel):
    id: int
    user_id: Optional[int]
    action: str = Field(..., max_length=100)
    entity_type: str = Field(..., max_length=100)
    entity_id: Optional[int]
    details: Optional[Any]
    ip_address: Optional[str] = Field(..., max_length=500)
    created_at: datetime
    
    class Config:
        from_attributes = True


class AuditLogListResponse(BaseModel):
    total: int
    items: list[AuditLogResponse]
