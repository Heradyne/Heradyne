from datetime import datetime
from typing import Any, Optional, List
from pydantic import BaseModel, Field


class AssumptionBase(BaseModel):
    category: str = Field(..., min_length=1, max_length=100)
    key: str = Field(..., min_length=1, max_length=100)
    value: Any
    description: Optional[str] = Field(None, max_length=2000)


class AssumptionCreate(AssumptionBase):
    user_id: Optional[int] = None  # If null, creates system-wide assumption


class AssumptionUpdate(BaseModel):
    value: Any
    description: Optional[str] = Field(None, max_length=2000)


class AssumptionResponse(AssumptionBase):
    id: int
    user_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class AssumptionWithUserResponse(AssumptionResponse):
    """Response that includes user info for admin views"""
    user_email: Optional[str] = Field(None, max_length=320)
    user_name: Optional[str] = Field(None, max_length=255)


class UserAssumptionOverride(BaseModel):
    """Request to create/update a user-specific override"""
    user_id: int
    category: str = Field(..., max_length=500)
    key: str = Field(..., max_length=500)
    value: Any
    description: Optional[str] = Field(None, max_length=2000)


class BulkAssignAssumptions(BaseModel):
    """Assign multiple assumptions to a user"""
    user_id: int
    assumption_ids: List[int]  # IDs of system assumptions to copy as overrides
