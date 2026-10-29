import plataforma


def test_aviso_wayland(monkeypatch):
    monkeypatch.setattr(plataforma, "ES_LINUX", True)
    monkeypatch.setenv("XDG_SESSION_TYPE", "wayland")
    assert "Wayland" in plataforma.aviso_raton()


def test_aviso_sin_pantalla(monkeypatch):
    monkeypatch.setattr(plataforma, "ES_LINUX", True)
    monkeypatch.delenv("XDG_SESSION_TYPE", raising=False)
    monkeypatch.delenv("DISPLAY", raising=False)
    assert "DISPLAY" in plataforma.aviso_raton()


def test_sin_aviso_en_x11(monkeypatch):
    monkeypatch.setattr(plataforma, "ES_LINUX", True)
    monkeypatch.setenv("XDG_SESSION_TYPE", "x11")
    monkeypatch.setenv("DISPLAY", ":0")
    assert plataforma.aviso_raton() is None


def test_sin_aviso_en_windows(monkeypatch):
    monkeypatch.setattr(plataforma, "ES_LINUX", False)
    assert plataforma.aviso_raton() is None
