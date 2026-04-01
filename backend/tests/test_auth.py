"""Tests for authentication endpoints."""


def test_register_user(client):
    """Test user registration."""
    response = client.post("/api/v1/auth/register", json={
        "email": "newuser@example.com",
        "password": "securepassword123",
        "full_name": "New User",
        "company_name": "New Company",
        "role": "borrower"
    })
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == "newuser@example.com"
    assert data["role"] == "borrower"
    assert "id" in data


def test_register_duplicate_email(client, test_user):
    """Test registration with duplicate email fails."""
    response = client.post("/api/v1/auth/register", json={
        "email": "test@example.com",
        "password": "anotherpassword",
        "full_name": "Another User",
        "role": "borrower"
    })
    assert response.status_code == 400
    assert "already registered" in response.json()["detail"]


def test_login_success(client, test_user):
    """Test successful login."""
    response = client.post("/api/v1/auth/login", json={
        "email": "test@example.com",
        "password": "testpassword"
    })
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


def test_login_wrong_password(client, test_user):
    """Test login with wrong password."""
    response = client.post("/api/v1/auth/login", json={
        "email": "test@example.com",
        "password": "wrongpassword"
    })
    assert response.status_code == 401


def test_login_nonexistent_user(client):
    """Test login with nonexistent user."""
    response = client.post("/api/v1/auth/login", json={
        "email": "nonexistent@example.com",
        "password": "anypassword"
    })
    assert response.status_code == 401


def test_get_current_user(client, auth_headers):
    """Test getting current user info."""
    response = client.get("/api/v1/users/me", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "test@example.com"


def test_unauthorized_access(client):
    """Test accessing protected endpoint without auth."""
    response = client.get("/api/v1/users/me")
    assert response.status_code == 403  # No Authorization header
