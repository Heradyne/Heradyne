from typing import Any, Optional, Dict
from sqlalchemy.orm import Session

from app.models.assumption import SystemAssumption


class AssumptionService:
    """Service for managing system assumptions."""
    
    _cache: Dict[str, Any] = {}
    
    @staticmethod
    def get_assumption(db: Session, category: str, key: str, user_id: Optional[int] = None) -> Optional[Any]:
        """
        Get a specific assumption value.
        If user_id is provided, returns user-specific override if it exists,
        otherwise falls back to system default.
        """
        # Try user-specific first if user_id provided
        if user_id is not None:
            cache_key = f"{user_id}.{category}.{key}"
            if cache_key in AssumptionService._cache:
                return AssumptionService._cache[cache_key]
            
            user_assumption = db.query(SystemAssumption).filter(
                SystemAssumption.user_id == user_id,
                SystemAssumption.category == category,
                SystemAssumption.key == key
            ).first()
            
            if user_assumption:
                AssumptionService._cache[cache_key] = user_assumption.value
                return user_assumption.value
        
        # Fall back to system default
        cache_key = f"system.{category}.{key}"
        
        if cache_key in AssumptionService._cache:
            return AssumptionService._cache[cache_key]
        
        assumption = db.query(SystemAssumption).filter(
            SystemAssumption.user_id.is_(None),
            SystemAssumption.category == category,
            SystemAssumption.key == key
        ).first()
        
        if assumption:
            AssumptionService._cache[cache_key] = assumption.value
            return assumption.value
        return None
    
    @staticmethod
    def get_all_by_category(db: Session, category: str, user_id: Optional[int] = None) -> Dict[str, Any]:
        """
        Get all assumptions in a category.
        If user_id is provided, merges system defaults with user overrides.
        """
        # Get system defaults
        system_assumptions = db.query(SystemAssumption).filter(
            SystemAssumption.user_id.is_(None),
            SystemAssumption.category == category
        ).all()
        
        result = {a.key: a.value for a in system_assumptions}
        
        # Merge user overrides if user_id provided
        if user_id is not None:
            user_assumptions = db.query(SystemAssumption).filter(
                SystemAssumption.user_id == user_id,
                SystemAssumption.category == category
            ).all()
            
            for a in user_assumptions:
                result[a.key] = a.value
        
        return result
    
    @staticmethod
    def get_effective_assumptions(db: Session, user_id: Optional[int] = None) -> Dict[str, Dict[str, Any]]:
        """
        Get all effective assumptions organized by category.
        If user_id is provided, merges system defaults with user overrides.
        """
        # Get system defaults
        system_assumptions = db.query(SystemAssumption).filter(
            SystemAssumption.user_id.is_(None)
        ).all()
        
        result: Dict[str, Dict[str, Any]] = {}
        for a in system_assumptions:
            if a.category not in result:
                result[a.category] = {}
            result[a.category][a.key] = a.value
        
        # Merge user overrides if user_id provided
        if user_id is not None:
            user_assumptions = db.query(SystemAssumption).filter(
                SystemAssumption.user_id == user_id
            ).all()
            
            for a in user_assumptions:
                if a.category not in result:
                    result[a.category] = {}
                result[a.category][a.key] = a.value
        
        return result
    
    @staticmethod
    def set_assumption(
        db: Session, 
        category: str, 
        key: str, 
        value: Any,
        description: Optional[str] = None,
        user_id: Optional[int] = None
    ) -> SystemAssumption:
        """Set or update an assumption (system-wide or user-specific)."""
        assumption = db.query(SystemAssumption).filter(
            SystemAssumption.category == category,
            SystemAssumption.key == key,
            SystemAssumption.user_id == user_id if user_id else SystemAssumption.user_id.is_(None)
        ).first()
        
        if assumption:
            assumption.value = value
            if description:
                assumption.description = description
        else:
            assumption = SystemAssumption(
                user_id=user_id,
                category=category,
                key=key,
                value=value,
                description=description
            )
            db.add(assumption)
        
        db.commit()
        db.refresh(assumption)
        
        # Update cache
        if user_id:
            cache_key = f"{user_id}.{category}.{key}"
        else:
            cache_key = f"system.{category}.{key}"
        AssumptionService._cache[cache_key] = value
        
        return assumption
    
    @staticmethod
    def clear_cache():
        """Clear the assumption cache."""
        AssumptionService._cache.clear()


assumption_service = AssumptionService()
