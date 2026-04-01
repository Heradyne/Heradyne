"""Tests for policy endpoints."""


def test_create_lender_policy(client, lender_auth_headers):
    """Test creating a lender policy."""
    response = client.post("/api/v1/policies/lender", headers=lender_auth_headers, json={
        "name": "Test Lending Policy",
        "is_active": True,
        "min_loan_size": 100000,
        "max_loan_size": 5000000,
        "min_dscr": 1.2,
        "max_pd": 0.05,
        "max_leverage": 4.0,
        "allowed_industries": ["manufacturing", "technology"]
    })
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Test Lending Policy"
    assert data["min_dscr"] == 1.2


def test_list_lender_policies(client, lender_auth_headers):
    """Test listing lender policies."""
    # Create a policy first
    client.post("/api/v1/policies/lender", headers=lender_auth_headers, json={
        "name": "List Test Policy",
        "min_loan_size": 100000
    })
    
    response = client.get("/api/v1/policies/lender", headers=lender_auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1


def test_update_lender_policy(client, lender_auth_headers):
    """Test updating a lender policy."""
    # Create a policy
    create_response = client.post("/api/v1/policies/lender", headers=lender_auth_headers, json={
        "name": "Update Test Policy",
        "min_loan_size": 100000
    })
    policy_id = create_response.json()["id"]
    
    # Update it
    response = client.put(f"/api/v1/policies/lender/{policy_id}", headers=lender_auth_headers, json={
        "name": "Updated Policy Name",
        "min_loan_size": 200000
    })
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Updated Policy Name"
    assert data["min_loan_size"] == 200000


def test_borrower_cannot_create_policy(client, auth_headers):
    """Test that borrowers cannot create lender policies."""
    response = client.post("/api/v1/policies/lender", headers=auth_headers, json={
        "name": "Borrower Policy",
        "min_loan_size": 100000
    })
    assert response.status_code == 403
