import logging
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_active_user
from app.models.user import User, UserRole
from app.models.deal import Deal
from app.models.collateral import (
    PreQualifiedAsset, AssetCategory, AssetType, VerificationStatus,
    COLLATERAL_HAIRCUTS
)
from app.services.collateral_pricing import collateral_pricing_engine
from app.services.audit import audit_service

router = APIRouter()


# Schemas
class AssetCreateRequest(BaseModel):
    asset_type: str  # personal or business
    category: str
    name: str
    description: Optional[str] = None
    stated_value: float
    
    # Real estate fields
    address: Optional[str] = None
    property_type: Optional[str] = None
    square_feet: Optional[int] = None
    year_built: Optional[int] = None
    
    # Vehicle fields
    make: Optional[str] = None
    model: Optional[str] = None
    year: Optional[int] = None
    vin: Optional[str] = None
    mileage: Optional[int] = None
    
    # Equipment fields
    condition: Optional[str] = None
    age_years: Optional[int] = None
    
    # Liens
    has_lien: bool = False
    lien_amount: Optional[float] = None
    lien_holder: Optional[str] = None


class AssetUpdateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    stated_value: Optional[float] = None
    address: Optional[str] = None
    property_type: Optional[str] = None
    square_feet: Optional[int] = None
    year_built: Optional[int] = None
    make: Optional[str] = None
    model: Optional[str] = None
    year: Optional[int] = None
    vin: Optional[str] = None
    mileage: Optional[int] = None
    condition: Optional[str] = None
    age_years: Optional[int] = None
    has_lien: Optional[bool] = None
    lien_amount: Optional[float] = None
    lien_holder: Optional[str] = None
    is_active: Optional[bool] = None


class AssetResponse(BaseModel):
    id: int
    borrower_id: int
    asset_type: str
    category: str
    name: str
    description: Optional[str]
    
    # Type-specific fields
    address: Optional[str]
    property_type: Optional[str]
    square_feet: Optional[int]
    year_built: Optional[int]
    make: Optional[str]
    model: Optional[str]
    year: Optional[int]
    vin: Optional[str]
    mileage: Optional[int]
    condition: Optional[str]
    age_years: Optional[int]
    
    # Valuation
    stated_value: float
    estimated_value: Optional[float]
    forced_sale_value: Optional[float]
    collateral_value: Optional[float]
    valuation_confidence: Optional[float]
    valuation_method: Optional[str]
    valuation_notes: Optional[str]
    last_valued_at: Optional[datetime]
    
    # Liens
    has_lien: bool
    lien_amount: Optional[float]
    lien_holder: Optional[str]
    net_equity: Optional[float]
    
    # Status
    verification_status: str
    is_active: bool
    times_used_as_collateral: int
    
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CollateralSummary(BaseModel):
    total_assets: int
    total_stated_value: float
    total_estimated_value: float
    total_collateral_value: float
    total_forced_sale_value: float
    personal_assets_count: int
    personal_assets_value: float
    business_assets_count: int
    business_assets_value: float
    pending_verification: int
    verified: int


class CategoryInfo(BaseModel):
    value: str
    label: str
    type: str
    haircut: float
    description: str


# Helper to convert model to response
def asset_to_response(asset: PreQualifiedAsset) -> AssetResponse:
    return AssetResponse(
        id=asset.id,
        borrower_id=asset.borrower_id,
        asset_type=asset.asset_type.value,
        category=asset.category.value,
        name=asset.name,
        description=asset.description,
        address=asset.address,
        property_type=asset.property_type,
        square_feet=asset.square_feet,
        year_built=asset.year_built,
        make=asset.make,
        model=asset.model,
        year=asset.year,
        vin=asset.vin,
        mileage=asset.mileage,
        condition=asset.condition,
        age_years=asset.age_years,
        stated_value=asset.stated_value,
        estimated_value=asset.estimated_value,
        forced_sale_value=asset.forced_sale_value,
        collateral_value=asset.collateral_value,
        valuation_confidence=asset.valuation_confidence,
        valuation_method=asset.valuation_method,
        valuation_notes=asset.valuation_notes,
        last_valued_at=asset.last_valued_at,
        has_lien=asset.has_lien or False,
        lien_amount=asset.lien_amount,
        lien_holder=asset.lien_holder,
        net_equity=asset.net_equity,
        verification_status=asset.verification_status.value,
        is_active=asset.is_active or True,
        times_used_as_collateral=asset.times_used_as_collateral or 0,
        created_at=asset.created_at,
        updated_at=asset.updated_at
    )


# Endpoints

@router.get("/categories", response_model=List[CategoryInfo])
def get_asset_categories():
    """Get all available asset categories with their haircuts."""
    categories = []
    
    category_labels = {
        # Personal
        "real_estate": ("Real Estate", "Personal residence, rental property, land"),
        "vehicle": ("Vehicle", "Car, truck, motorcycle"),
        "investment_account": ("Investment Account", "Brokerage account, stocks, bonds"),
        "retirement_account": ("Retirement Account", "401k, IRA, pension"),
        "cash_savings": ("Cash & Savings", "Savings account, CDs, money market"),
        "jewelry": ("Jewelry", "Watches, precious metals, gems"),
        "collectibles": ("Collectibles", "Art, antiques, rare items"),
        "other_personal": ("Other Personal", "Other personal assets"),
        # Business
        "equipment": ("Equipment", "Machinery, tools, technology"),
        "inventory": ("Inventory", "Raw materials, finished goods"),
        "accounts_receivable": ("Accounts Receivable", "Outstanding invoices"),
        "real_property": ("Business Real Estate", "Commercial property, warehouse"),
        "intellectual_property": ("Intellectual Property", "Patents, trademarks, copyrights"),
        "vehicles_fleet": ("Vehicle Fleet", "Business vehicles, trucks"),
        "furniture_fixtures": ("Furniture & Fixtures", "Office furniture, fixtures"),
        "other_business": ("Other Business", "Other business assets"),
    }
    
    for cat in AssetCategory:
        label, desc = category_labels.get(cat.value, (cat.value, ""))
        asset_type = "personal" if cat.value in [
            "real_estate", "vehicle", "investment_account", "retirement_account",
            "cash_savings", "jewelry", "collectibles", "other_personal"
        ] else "business"
        
        categories.append(CategoryInfo(
            value=cat.value,
            label=label,
            type=asset_type,
            haircut=COLLATERAL_HAIRCUTS.get(cat, 0.50),
            description=desc
        ))
    
    return categories


@router.get("/my-assets", response_model=List[AssetResponse])
def get_my_assets(
    asset_type: Optional[str] = None,
    active_only: bool = True,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get all pre-qualified assets for the current borrower."""
    if current_user.role != UserRole.BORROWER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only borrowers can view their assets"
        )
    
    query = db.query(PreQualifiedAsset).filter(
        PreQualifiedAsset.borrower_id == current_user.id
    )
    
    if asset_type:
        try:
            at = AssetType(asset_type)
            query = query.filter(PreQualifiedAsset.asset_type == at)
        except ValueError:
            pass
    
    if active_only:
        query = query.filter(PreQualifiedAsset.is_active == True)
    
    assets = query.order_by(PreQualifiedAsset.created_at.desc()).all()
    
    return [asset_to_response(a) for a in assets]


@router.get("/summary", response_model=CollateralSummary)
def get_collateral_summary(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get summary of borrower's pre-qualified collateral."""
    if current_user.role not in [UserRole.BORROWER, UserRole.LENDER,
                                  UserRole.CREDIT_COMMITTEE, UserRole.INSURER, UserRole.ADMIN]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )

    # Lenders/insurers see aggregate summary across all active deals
    if current_user.role == UserRole.BORROWER:
        assets = db.query(PreQualifiedAsset).filter(
            PreQualifiedAsset.borrower_id == current_user.id,
            PreQualifiedAsset.is_active == True
        ).all()
    else:
        assets = db.query(PreQualifiedAsset).filter(
            PreQualifiedAsset.is_active == True
        ).all()
    
    totals = collateral_pricing_engine.get_total_collateral_value(assets)
    
    pending = sum(1 for a in assets if a.verification_status == VerificationStatus.PENDING)
    verified = sum(1 for a in assets if a.verification_status == VerificationStatus.VERIFIED)
    
    return CollateralSummary(
        total_assets=len(assets),
        total_stated_value=totals["total_stated_value"],
        total_estimated_value=totals["total_estimated_value"],
        total_collateral_value=totals["total_collateral_value"],
        total_forced_sale_value=totals["total_forced_sale_value"],
        personal_assets_count=totals["personal_assets"]["count"],
        personal_assets_value=totals["personal_assets"]["value"],
        business_assets_count=totals["business_assets"]["count"],
        business_assets_value=totals["business_assets"]["value"],
        pending_verification=pending,
        verified=verified
    )


@router.post("/", response_model=AssetResponse, status_code=status.HTTP_201_CREATED)
def create_asset(
    request: AssetCreateRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Create a new pre-qualified asset."""
    if current_user.role != UserRole.BORROWER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only borrowers can add assets"
        )
    
    # Validate asset type and category
    try:
        asset_type = AssetType(request.asset_type)
        category = AssetCategory(request.category)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid asset type or category"
        )
    
    # Create asset
    asset = PreQualifiedAsset(
        borrower_id=current_user.id,
        asset_type=asset_type,
        category=category,
        name=request.name,
        description=request.description,
        stated_value=request.stated_value,
        address=request.address,
        property_type=request.property_type,
        square_feet=request.square_feet,
        year_built=request.year_built,
        make=request.make,
        model=request.model,
        year=request.year,
        vin=request.vin,
        mileage=request.mileage,
        condition=request.condition,
        age_years=request.age_years,
        has_lien=request.has_lien,
        lien_amount=request.lien_amount if request.has_lien else None,
        lien_holder=request.lien_holder if request.has_lien else None,
        verification_status=VerificationStatus.PENDING,
        is_active=True,
        times_used_as_collateral=0
    )
    
    db.add(asset)
    db.flush()
    
    # Run through pricing engine
    valuation = collateral_pricing_engine.value_asset(asset)
    asset.estimated_value = valuation["estimated_value"]
    asset.forced_sale_value = valuation["forced_sale_value"]
    asset.collateral_value = valuation["collateral_value"]
    asset.valuation_confidence = valuation["valuation_confidence"]
    asset.valuation_method = valuation["valuation_method"]
    asset.valuation_notes = valuation["valuation_notes"]
    asset.net_equity = valuation["net_equity"]
    asset.last_valued_at = datetime.utcnow()
    
    db.commit()
    db.refresh(asset)
    
    # Audit log
    audit_service.log(
        db=db,
        action="asset_created",
        entity_type="prequalified_asset",
        entity_id=asset.id,
        user_id=current_user.id,
        details={
            "name": asset.name,
            "category": category.value,
            "stated_value": request.stated_value,
            "collateral_value": asset.collateral_value
        }
    )
    
    return asset_to_response(asset)


@router.get("/{asset_id}", response_model=AssetResponse)
def get_asset(
    asset_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get a specific asset."""
    asset = db.query(PreQualifiedAsset).filter(PreQualifiedAsset.id == asset_id).first()
    
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")
    
    if current_user.role != UserRole.ADMIN and asset.borrower_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    
    return asset_to_response(asset)


@router.put("/{asset_id}", response_model=AssetResponse)
def update_asset(
    asset_id: int,
    request: AssetUpdateRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Update an asset and re-run valuation."""
    asset = db.query(PreQualifiedAsset).filter(PreQualifiedAsset.id == asset_id).first()
    
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")
    
    if asset.borrower_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    
    # Update fields
    update_data = request.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(asset, field, value)
    
    # Re-run valuation if value-affecting fields changed
    valuation_fields = ['stated_value', 'square_feet', 'year_built', 'year', 'mileage', 
                        'condition', 'age_years', 'has_lien', 'lien_amount']
    if any(f in update_data for f in valuation_fields):
        valuation = collateral_pricing_engine.value_asset(asset)
        asset.estimated_value = valuation["estimated_value"]
        asset.forced_sale_value = valuation["forced_sale_value"]
        asset.collateral_value = valuation["collateral_value"]
        asset.valuation_confidence = valuation["valuation_confidence"]
        asset.valuation_method = valuation["valuation_method"]
        asset.valuation_notes = valuation["valuation_notes"]
        asset.net_equity = valuation["net_equity"]
        asset.last_valued_at = datetime.utcnow()
    
    db.commit()
    db.refresh(asset)
    
    return asset_to_response(asset)


@router.delete("/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_asset(
    asset_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Delete (deactivate) an asset."""
    asset = db.query(PreQualifiedAsset).filter(PreQualifiedAsset.id == asset_id).first()
    
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")
    
    if asset.borrower_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    
    # Soft delete
    asset.is_active = False
    db.commit()


@router.post("/{asset_id}/revalue", response_model=AssetResponse)
def revalue_asset(
    asset_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Re-run the pricing engine on an asset."""
    asset = db.query(PreQualifiedAsset).filter(PreQualifiedAsset.id == asset_id).first()
    
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")
    
    if current_user.role != UserRole.ADMIN and asset.borrower_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    
    # Re-run valuation
    valuation = collateral_pricing_engine.value_asset(asset)
    asset.estimated_value = valuation["estimated_value"]
    asset.forced_sale_value = valuation["forced_sale_value"]
    asset.collateral_value = valuation["collateral_value"]
    asset.valuation_confidence = valuation["valuation_confidence"]
    asset.valuation_method = valuation["valuation_method"]
    asset.valuation_notes = valuation["valuation_notes"]
    asset.net_equity = valuation["net_equity"]
    asset.last_valued_at = datetime.utcnow()
    
    db.commit()
    db.refresh(asset)
    
    return asset_to_response(asset)


@router.post("/apply-to-deal/{deal_id}")
def apply_assets_to_deal(
    deal_id: int,
    asset_ids: List[int],
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Apply pre-qualified assets to a deal as collateral."""
    if current_user.role != UserRole.BORROWER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only borrowers can apply assets to deals"
        )
    
    # Get deal
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deal not found")
    
    if deal.borrower_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    
    # Get assets
    assets = db.query(PreQualifiedAsset).filter(
        PreQualifiedAsset.id.in_(asset_ids),
        PreQualifiedAsset.borrower_id == current_user.id,
        PreQualifiedAsset.is_active == True
    ).all()
    
    if len(assets) != len(asset_ids):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Some assets not found or not owned by you"
        )
    
    # Separate into personal and business
    personal_assets = []
    business_assets = []
    
    for asset in assets:
        asset_data = {
            "prequalified_asset_id": asset.id,
            "type": asset.category.value,
            "name": asset.name,
            "description": asset.description,
            "stated_value": asset.stated_value,
            "estimated_value": asset.estimated_value,
            "collateral_value": asset.collateral_value,
        }
        
        if asset.asset_type == AssetType.PERSONAL:
            personal_assets.append(asset_data)
        else:
            business_assets.append(asset_data)
        
        # Increment usage counter
        asset.times_used_as_collateral = (asset.times_used_as_collateral or 0) + 1
    
    # Update deal
    deal.personal_assets = personal_assets
    deal.business_assets = business_assets
    
    db.commit()
    
    return {
        "message": "Assets applied to deal successfully",
        "deal_id": deal_id,
        "personal_assets_applied": len(personal_assets),
        "business_assets_applied": len(business_assets),
        "total_personal_collateral": sum(a["collateral_value"] or 0 for a in personal_assets),
        "total_business_collateral": sum(a["collateral_value"] or 0 for a in business_assets),
    }


@router.get("/for-deal/{deal_id}")
def get_assets_for_deal(
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get assets that have been applied to a deal."""
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deal not found")
    
    if current_user.role == UserRole.ADMIN:
        pass  # admin sees all
    elif current_user.role in [UserRole.LENDER, UserRole.CREDIT_COMMITTEE,
                                UserRole.LOAN_OFFICER, UserRole.INSURER]:
        pass  # lenders/insurers can read deal collateral
    elif deal.borrower_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    
    return {
        "deal_id": deal_id,
        "personal_assets": deal.personal_assets or [],
        "business_assets": deal.business_assets or [],
    }
