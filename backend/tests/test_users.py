from conftest import make_client


def test_users_requires_auth():
    client = make_client(logged_in=False)
    assert client.get("/api/users").status_code == 401


def test_users_lists_seeded_users_without_passwords():
    client = make_client()
    response = client.get("/api/users")
    assert response.status_code == 200
    users = response.json()
    assert users == [{"id": 1, "username": "user"}]
    assert "password" not in users[0]


def test_users_lists_all_seeded_accounts(monkeypatch):
    monkeypatch.setenv("SEED_USERS", "user:password,alex:secret2")
    client = make_client()
    usernames = {u["username"] for u in client.get("/api/users").json()}
    assert usernames == {"user", "alex"}
