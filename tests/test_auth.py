from tests.conftest import auth, signup


def test_signup_login_me(client) -> None:
    body = signup(client, "별빛")
    assert body["user"]["nickname"] == "별빛"
    assert body["user"]["role"] == "user"

    res = client.post(
        "/api/auth/login", json={"email": body["user"]["email"], "password": "password123"}
    )
    assert res.status_code == 200
    me = client.get("/api/auth/me", headers=auth(res.json()))
    assert me.status_code == 200
    assert me.json()["nickname"] == "별빛"


def test_wrong_password_gives_same_message(client) -> None:
    signup(client, "dreamer")
    wrong = client.post(
        "/api/auth/login", json={"email": "dreamer@example.com", "password": "nope-nope"}
    )
    missing = client.post(
        "/api/auth/login", json={"email": "nobody@example.com", "password": "nope-nope"}
    )
    assert wrong.status_code == missing.status_code == 401
    assert wrong.json() == missing.json()
    assert wrong.json()["detail"]["code"] == "invalid_credentials"


def test_duplicate_email_and_nickname(client) -> None:
    signup(client, "dreamer")
    res = client.post(
        "/api/auth/signup",
        json={"email": "DREAMER@example.com", "password": "password123", "nickname": "other"},
    )
    assert res.status_code == 409 and res.json()["detail"]["code"] == "email_taken"
    res = client.post(
        "/api/auth/signup",
        json={"email": "new@example.com", "password": "password123", "nickname": "Dreamer"},
    )
    assert res.status_code == 409 and res.json()["detail"]["code"] == "nickname_taken"


def test_reserved_and_invalid_nickname(client) -> None:
    for nickname in ("me", "admin", "a", "공백 있음"):
        res = client.post(
            "/api/auth/signup",
            json={"email": "x@example.com", "password": "password123", "nickname": nickname},
        )
        assert res.status_code == 422, nickname


def test_me_requires_token(client) -> None:
    assert client.get("/api/auth/me").status_code == 401
    bad = client.get("/api/auth/me", headers={"Authorization": "Bearer not-a-token"})
    assert bad.status_code == 401
    assert bad.json()["detail"]["code"] == "login_required"
