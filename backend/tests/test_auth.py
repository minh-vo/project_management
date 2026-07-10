from conftest import make_client


def test_login_success_sets_cookie():
    client = make_client(logged_in=False)
    response = client.post(
        "/api/login", json={"username": "user", "password": "password"}
    )
    assert response.status_code == 200
    assert response.json() == {"username": "user"}
    assert "session" in response.cookies


def test_login_wrong_password():
    client = make_client(logged_in=False)
    response = client.post(
        "/api/login", json={"username": "user", "password": "wrong"}
    )
    assert response.status_code == 401
    assert "session" not in response.cookies


def test_login_wrong_username():
    client = make_client(logged_in=False)
    response = client.post(
        "/api/login", json={"username": "admin", "password": "password"}
    )
    assert response.status_code == 401


def test_me_requires_auth():
    client = make_client(logged_in=False)
    assert client.get("/api/me").status_code == 401


def test_me_after_login():
    client = make_client()
    response = client.get("/api/me")
    assert response.status_code == 200
    assert response.json() == {"username": "user"}


def test_tampered_cookie_rejected():
    client = make_client(logged_in=False)
    client.cookies.set("session", "forged-value")
    assert client.get("/api/me").status_code == 401


def test_logout_clears_session():
    client = make_client()
    assert client.get("/api/me").status_code == 200
    response = client.post("/api/logout")
    assert response.status_code == 200
    assert client.get("/api/me").status_code == 401


def test_multiple_seeded_users_get_isolated_sessions(monkeypatch):
    monkeypatch.setenv("SEED_USERS", "user:password,alex:secret2")
    alex = make_client(logged_in=False)
    response = alex.post("/api/login", json={"username": "alex", "password": "secret2"})
    assert response.status_code == 200
    assert alex.get("/api/me").json() == {"username": "alex"}

    default_user = make_client(username="user", password="password")
    assert default_user.get("/api/me").json() == {"username": "user"}


def test_session_cookie_signs_user_id_not_username():
    import itsdangerous

    client = make_client()
    payload = itsdangerous.URLSafeTimedSerializer(
        "dev-session-secret", salt="session"
    ).loads(client.cookies["session"])
    assert isinstance(payload, int)
