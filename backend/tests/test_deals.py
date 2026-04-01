"""Tests for deal endpoints."""

import pytest


def test_create_deal(client, auth_headers):
    """Test creating a new deal."""
    response = client.post("/api/v1/deals/", headers=auth_headers, json={
        "name": "Test Deal",
        "deal_type": "acquisition",
        "industry": "manufacturing",
        "loan_amount_requested": 1000000,
        "loan_term_months": 84,
        "annual_revenue": 2000000,
        "ebitda": 400000
    })
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Test Deal"
    assert data["status"] == "draft"
    assert data["loan_amount_requested"] == 1000000


def test_create_deal_with_full_data(client, auth_headers):
    """Test creating a deal with all fields."""
    response = client.post("/api/v1/deals/", headers=auth_headers, json={
        "name": "Full Deal",
        "deal_type": "growth",
        "industry": "technology",
        "business_description": "Tech company growth",
        "loan_amount_requested": 500000,
        "loan_term_months": 60,
        "annual_revenue": 1500000,
        "gross_profit": 750000,
        "ebitda": 300000,
        "capex": 50000,
        "debt_service": 25000,
        "addbacks": [
            {"description": "Owner salary", "amount": 50000}
        ],
        "business_assets": [
            {"type": "equipment", "value": 100000, "description": "Servers"}
        ],
        "personal_assets": [
            {"type": "primary_residence", "value": 300000}
        ],
        "owner_credit_score": 720,
        "owner_experience_years": 5
    })
    assert response.status_code == 201
    data = response.json()
    assert data["ebitda"] == 300000
    assert data["owner_credit_score"] == 720


def test_list_deals(client, auth_headers):
    """Test listing deals."""
    # Create a deal first
    client.post("/api/v1/deals/", headers=auth_headers, json={
        "name": "List Test Deal",
        "deal_type": "acquisition",
        "industry": "manufacturing",
        "loan_amount_requested": 1000000,
        "annual_revenue": 2000000,
        "ebitda": 400000
    })
    
    response = client.get("/api/v1/deals/", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1


def test_get_deal(client, auth_headers):
    """Test getting a specific deal."""
    # Create a deal
    create_response = client.post("/api/v1/deals/", headers=auth_headers, json={
        "name": "Get Test Deal",
        "deal_type": "acquisition",
        "industry": "manufacturing",
        "loan_amount_requested": 1000000,
        "annual_revenue": 2000000,
        "ebitda": 400000
    })
    deal_id = create_response.json()["id"]
    
    # Get the deal
    response = client.get(f"/api/v1/deals/{deal_id}", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Get Test Deal"


def test_update_deal(client, auth_headers):
    """Test updating a deal."""
    # Create a deal
    create_response = client.post("/api/v1/deals/", headers=auth_headers, json={
        "name": "Update Test Deal",
        "deal_type": "acquisition",
        "industry": "manufacturing",
        "loan_amount_requested": 1000000,
        "annual_revenue": 2000000,
        "ebitda": 400000
    })
    deal_id = create_response.json()["id"]
    
    # Update the deal
    response = client.put(f"/api/v1/deals/{deal_id}", headers=auth_headers, json={
        "name": "Updated Deal Name",
        "loan_amount_requested": 1500000
    })
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Updated Deal Name"
    assert data["loan_amount_requested"] == 1500000


def test_delete_draft_deal(client, auth_headers):
    """Test deleting a draft deal."""
    # Create a deal
    create_response = client.post("/api/v1/deals/", headers=auth_headers, json={
        "name": "Delete Test Deal",
        "deal_type": "acquisition",
        "industry": "manufacturing",
        "loan_amount_requested": 1000000,
        "annual_revenue": 2000000,
        "ebitda": 400000
    })
    deal_id = create_response.json()["id"]
    
    # Delete the deal
    response = client.delete(f"/api/v1/deals/{deal_id}", headers=auth_headers)
    assert response.status_code == 204
    
    # Verify it's deleted
    response = client.get(f"/api/v1/deals/{deal_id}", headers=auth_headers)
    assert response.status_code == 404


def test_deal_not_found(client, auth_headers):
    """Test getting nonexistent deal."""
    response = client.get("/api/v1/deals/99999", headers=auth_headers)
    assert response.status_code == 404


def test_lender_cannot_create_deal(client, lender_auth_headers):
    """Test that lenders cannot create deals."""
    response = client.post("/api/v1/deals/", headers=lender_auth_headers, json={
        "name": "Lender Deal",
        "deal_type": "acquisition",
        "industry": "manufacturing",
        "loan_amount_requested": 1000000,
        "annual_revenue": 2000000,
        "ebitda": 400000
    })
    assert response.status_code == 403
