import pytest

from app.utils.url import UrlRejected, parse_http_url


@pytest.mark.parametrize(
    "url",
    [
        "javascript:alert(1)",
        "ftp://example.com/x",
        "https://user:pw@example.com/x",
        "https://example.com:8443/x",
        "http://example.com:81/x",
        "https://example.com/a b",
        "https://example.com/\x00",
        "https://" + "a" * 2050,
        "",
        "https:///nohost",
    ],
)
def test_rejected(url):
    with pytest.raises(UrlRejected):
        parse_http_url(url)


def test_accepts_plain_and_default_ports():
    assert parse_http_url("https://Example.com/x?y=1").hostname == "example.com"
    assert parse_http_url("http://example.com:80/").port == 80
