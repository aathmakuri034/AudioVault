from app.core.errors import AppError, InvalidUrl, ServerBusy, error_body
from app.core.security import generate_download_token, secrets_match


def test_error_shape_and_defaults():
    assert error_body("x", "y") == {"error": {"code": "x", "message": "y"}}
    err = InvalidUrl()
    assert (err.code, err.status_code, err.message) == (
        "invalid_url",
        422,
        "Unable to process this URL.",
    )
    assert ServerBusy().status_code == 503


def test_app_error_overrides():
    err = AppError("m", code="custom", status_code=418)
    assert (err.code, err.status_code, err.message) == ("custom", 418, "m")


def test_secrets_match():
    assert secrets_match("abc", "abc")
    assert not secrets_match("abd", "abc")
    assert not secrets_match(None, "abc")
    assert not secrets_match("", "")
    assert secrets_match("pässword", "pässword")


def test_token_is_random_and_urlsafe():
    a, b = generate_download_token(), generate_download_token()
    assert a != b
    assert len(a) >= 43
