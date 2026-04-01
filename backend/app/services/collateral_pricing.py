"""
Collateral Pricing Engine

This service values pre-qualified assets using various methodologies:
- Real estate: Comparable sales analysis, price per square foot
- Vehicles: Market value based on make/model/year/mileage
- Equipment: Depreciated replacement cost
- Financial accounts: Face value with appropriate haircuts
- Other assets: Conservative estimates with higher haircuts

All values include a "haircut" to account for liquidation risk.
"""

from typing import Dict, Any, Optional, Tuple
from datetime import datetime
from sqlalchemy.orm import Session

from app.models.collateral import (
    PreQualifiedAsset, AssetCategory, AssetType, VerificationStatus,
    COLLATERAL_HAIRCUTS, DEPRECIATION_RATES
)


class CollateralPricingEngine:
    """Engine for valuing pre-qualified collateral assets."""
    
    # Average price per square foot by property type (simplified)
    REAL_ESTATE_PSF = {
        "single_family": 200,
        "condo": 250,
        "townhouse": 180,
        "multi_family": 150,
        "commercial": 175,
        "industrial": 100,
        "land": 50,
        "retail": 200,
        "office": 225,
    }
    
    # Base vehicle values by age (simplified depreciation curve)
    # Percentage of original value retained
    VEHICLE_AGE_FACTOR = {
        0: 1.00,  # New
        1: 0.80,  # 1 year old
        2: 0.70,
        3: 0.60,
        4: 0.52,
        5: 0.45,
        6: 0.40,
        7: 0.35,
        8: 0.30,
        9: 0.27,
        10: 0.25,
    }
    
    # Mileage adjustment (per 10k miles over average)
    MILEAGE_ADJUSTMENT = 0.02  # 2% reduction per 10k miles over average
    AVERAGE_ANNUAL_MILES = 12000
    
    # Condition multipliers
    CONDITION_MULTIPLIER = {
        "excellent": 1.10,
        "good": 1.00,
        "fair": 0.85,
        "poor": 0.60,
    }
    
    @classmethod
    def value_asset(cls, asset: PreQualifiedAsset) -> Dict[str, Any]:
        """
        Value an asset and return pricing details.
        
        Returns:
            Dict with estimated_value, forced_sale_value, collateral_value,
            valuation_confidence, valuation_method, and notes
        """
        category = asset.category
        
        # Route to appropriate valuation method
        if category == AssetCategory.REAL_ESTATE:
            return cls._value_real_estate(asset)
        elif category in [AssetCategory.VEHICLE, AssetCategory.VEHICLES_FLEET]:
            return cls._value_vehicle(asset)
        elif category in [AssetCategory.EQUIPMENT, AssetCategory.FURNITURE_FIXTURES]:
            return cls._value_equipment(asset)
        elif category in [AssetCategory.INVESTMENT_ACCOUNT, AssetCategory.RETIREMENT_ACCOUNT, 
                          AssetCategory.CASH_SAVINGS]:
            return cls._value_financial_account(asset)
        elif category == AssetCategory.INVENTORY:
            return cls._value_inventory(asset)
        elif category == AssetCategory.ACCOUNTS_RECEIVABLE:
            return cls._value_receivables(asset)
        else:
            return cls._value_other(asset)
    
    @classmethod
    def _value_real_estate(cls, asset: PreQualifiedAsset) -> Dict[str, Any]:
        """Value real estate based on square footage and property type."""
        stated = asset.stated_value
        
        # If we have square footage, use price per square foot
        if asset.square_feet and asset.square_feet > 0:
            property_type = asset.property_type or "single_family"
            psf = cls.REAL_ESTATE_PSF.get(property_type, 150)
            
            # Adjust for age (older properties worth slightly less)
            if asset.year_built:
                age = datetime.now().year - asset.year_built
                age_factor = max(0.70, 1.0 - (age * 0.005))  # 0.5% per year, min 70%
            else:
                age_factor = 0.90  # Unknown age = conservative
            
            calculated_value = asset.square_feet * psf * age_factor
            
            # Use average of stated and calculated, weighted toward calculated
            estimated_value = (calculated_value * 0.6 + stated * 0.4)
            confidence = 0.75
            method = "comp_analysis_psf"
            notes = f"Based on ${psf}/sqft for {property_type}, age factor {age_factor:.2f}"
        else:
            # No square footage - use stated value with lower confidence
            estimated_value = stated * 0.90  # 10% conservative adjustment
            confidence = 0.50
            method = "stated_value_adjusted"
            notes = "Limited data - using stated value with conservative adjustment"
        
        return cls._apply_haircut_and_liens(asset, estimated_value, confidence, method, notes)
    
    @classmethod
    def _value_vehicle(cls, asset: PreQualifiedAsset) -> Dict[str, Any]:
        """Value vehicle based on year, mileage, and condition."""
        stated = asset.stated_value
        current_year = datetime.now().year
        
        # Calculate age
        vehicle_year = asset.year or (current_year - 5)  # Default to 5 years old
        age = current_year - vehicle_year
        age = min(age, 10)  # Cap at 10 years for our table
        
        # Get age factor
        age_factor = cls.VEHICLE_AGE_FACTOR.get(age, 0.20)
        
        # Mileage adjustment
        mileage = asset.mileage or (age * cls.AVERAGE_ANNUAL_MILES)
        expected_mileage = age * cls.AVERAGE_ANNUAL_MILES
        excess_mileage = max(0, mileage - expected_mileage)
        mileage_adjustment = 1.0 - (excess_mileage / 10000 * cls.MILEAGE_ADJUSTMENT)
        mileage_adjustment = max(0.70, mileage_adjustment)  # Floor at 70%
        
        # Condition multiplier
        condition = (asset.condition or "good").lower()
        condition_mult = cls.CONDITION_MULTIPLIER.get(condition, 1.0)
        
        # Estimate value
        # Assume stated value is their purchase price or current estimate
        # Apply our factors
        estimated_value = stated * age_factor * mileage_adjustment * condition_mult
        
        # If the result is way off from stated, adjust
        if estimated_value < stated * 0.5:
            estimated_value = (estimated_value + stated * 0.5) / 2
        
        confidence = 0.70
        method = "market_value_adjusted"
        notes = f"Age factor: {age_factor:.2f}, Mileage adj: {mileage_adjustment:.2f}, Condition: {condition}"
        
        return cls._apply_haircut_and_liens(asset, estimated_value, confidence, method, notes)
    
    @classmethod
    def _value_equipment(cls, asset: PreQualifiedAsset) -> Dict[str, Any]:
        """Value equipment using depreciated replacement cost."""
        stated = asset.stated_value
        
        # Get age
        age = asset.age_years or 3  # Default to 3 years
        
        # Apply depreciation
        depreciation_rate = DEPRECIATION_RATES.get(asset.category, 0.10)
        remaining_value = (1 - depreciation_rate) ** age
        remaining_value = max(0.20, remaining_value)  # Floor at 20%
        
        # Condition adjustment
        condition = (asset.condition or "good").lower()
        condition_mult = cls.CONDITION_MULTIPLIER.get(condition, 1.0)
        
        estimated_value = stated * remaining_value * condition_mult
        
        confidence = 0.65
        method = "depreciated_cost"
        notes = f"Age: {age} years, Depreciation rate: {depreciation_rate:.0%}, Condition: {condition}"
        
        return cls._apply_haircut_and_liens(asset, estimated_value, confidence, method, notes)
    
    @classmethod
    def _value_financial_account(cls, asset: PreQualifiedAsset) -> Dict[str, Any]:
        """Value financial accounts at face value."""
        stated = asset.stated_value
        
        # Financial accounts are valued at face value
        # Haircut will be applied based on type
        estimated_value = stated
        
        confidence = 0.90
        method = "face_value"
        
        if asset.category == AssetCategory.RETIREMENT_ACCOUNT:
            notes = "Retirement account - subject to early withdrawal penalties"
        elif asset.category == AssetCategory.INVESTMENT_ACCOUNT:
            notes = "Investment account - market value may fluctuate"
        else:
            notes = "Cash/savings - highly liquid"
        
        return cls._apply_haircut_and_liens(asset, estimated_value, confidence, method, notes)
    
    @classmethod
    def _value_inventory(cls, asset: PreQualifiedAsset) -> Dict[str, Any]:
        """Value inventory conservatively."""
        stated = asset.stated_value
        
        # Inventory can be obsolete, seasonal, or perishable
        # Use conservative estimate
        condition = (asset.condition or "good").lower()
        condition_mult = cls.CONDITION_MULTIPLIER.get(condition, 1.0)
        
        estimated_value = stated * 0.70 * condition_mult  # 30% immediate discount
        
        confidence = 0.55
        method = "cost_basis_adjusted"
        notes = f"Inventory valued at 70% of stated cost, condition: {condition}"
        
        return cls._apply_haircut_and_liens(asset, estimated_value, confidence, method, notes)
    
    @classmethod
    def _value_receivables(cls, asset: PreQualifiedAsset) -> Dict[str, Any]:
        """Value accounts receivable based on quality."""
        stated = asset.stated_value
        
        # AR quality varies - assume typical collection rate
        collection_rate = 0.85  # 85% expected collection
        
        estimated_value = stated * collection_rate
        
        confidence = 0.60
        method = "expected_collection"
        notes = f"Accounts receivable valued at {collection_rate:.0%} expected collection"
        
        return cls._apply_haircut_and_liens(asset, estimated_value, confidence, method, notes)
    
    @classmethod
    def _value_other(cls, asset: PreQualifiedAsset) -> Dict[str, Any]:
        """Value other assets conservatively."""
        stated = asset.stated_value
        
        # Conservative valuation for unknown asset types
        estimated_value = stated * 0.60  # 40% discount
        
        confidence = 0.40
        method = "conservative_estimate"
        notes = "Asset type requires conservative valuation approach"
        
        return cls._apply_haircut_and_liens(asset, estimated_value, confidence, method, notes)
    
    @classmethod
    def _apply_haircut_and_liens(
        cls, 
        asset: PreQualifiedAsset, 
        estimated_value: float,
        confidence: float,
        method: str,
        notes: str
    ) -> Dict[str, Any]:
        """Apply collateral haircut and account for liens."""
        
        # Get haircut for this asset type
        haircut = COLLATERAL_HAIRCUTS.get(asset.category, 0.50)
        
        # Forced sale value (quick liquidation)
        forced_sale_value = estimated_value * 0.70  # 30% liquidation discount
        
        # Collateral value (what we'll lend against)
        collateral_value = estimated_value * (1 - haircut)
        
        # Account for liens
        lien_amount = asset.lien_amount or 0
        if lien_amount > 0:
            net_equity = estimated_value - lien_amount
            collateral_value = max(0, collateral_value - lien_amount)
            forced_sale_value = max(0, forced_sale_value - lien_amount)
            notes += f" | Lien: ${lien_amount:,.0f} to {asset.lien_holder or 'unknown'}"
        else:
            net_equity = estimated_value
        
        return {
            "estimated_value": round(estimated_value, 2),
            "forced_sale_value": round(forced_sale_value, 2),
            "collateral_value": round(collateral_value, 2),
            "valuation_confidence": round(confidence, 2),
            "valuation_method": method,
            "valuation_notes": notes,
            "net_equity": round(net_equity, 2),
            "haircut_applied": f"{haircut:.0%}",
        }
    
    @classmethod
    def get_total_collateral_value(cls, assets: list[PreQualifiedAsset]) -> Dict[str, float]:
        """Calculate total collateral value across multiple assets."""
        total_stated = 0
        total_estimated = 0
        total_collateral = 0
        total_forced_sale = 0
        
        by_type = {
            "personal": {"count": 0, "value": 0},
            "business": {"count": 0, "value": 0},
        }
        
        for asset in assets:
            if not asset.is_active:
                continue
                
            total_stated += asset.stated_value or 0
            total_estimated += asset.estimated_value or 0
            total_collateral += asset.collateral_value or 0
            total_forced_sale += asset.forced_sale_value or 0
            
            asset_type = asset.asset_type.value
            by_type[asset_type]["count"] += 1
            by_type[asset_type]["value"] += asset.collateral_value or 0
        
        return {
            "total_stated_value": total_stated,
            "total_estimated_value": total_estimated,
            "total_collateral_value": total_collateral,
            "total_forced_sale_value": total_forced_sale,
            "personal_assets": by_type["personal"],
            "business_assets": by_type["business"],
        }


# Singleton instance
collateral_pricing_engine = CollateralPricingEngine()
