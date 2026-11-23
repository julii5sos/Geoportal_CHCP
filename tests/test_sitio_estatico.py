import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]


class SitioEstaticoTests(unittest.TestCase):
    def test_construye_paginas_y_datos_sin_rutas_absolutas_ni_credenciales(self):
        spec = importlib.util.spec_from_file_location("sitio", RAIZ / "scripts" / "construir_sitio_estatico.py")
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        with tempfile.TemporaryDirectory() as tmp:
            destino = Path(tmp) / "sitio"
            mod.construir(destino, "https://ejemplo.hf.space", "https://github.com/julii5sos/Geoportal_CHCP")
            for archivo in ("index.html", "panel.html", "plataforma.html", "monitoreo.html", "static/js/plataforma_estatica.js", "coberturas.html", "metodologia.html", "acerca.html", "ficha.html", "restauracion.html", "validacion.html", "campo.html", ".nojekyll", "static/js/monitoreo.js", "static/js/ficha.js", "static/js/restauracion.js", "static/js/red_conectividad.js", "static/js/validacion.js", "static/js/campo.js", "static/vendor/leaflet.js",
                            "datos/territorio.json", "datos/estadisticas_territoriales.json", "datos/sinia_catalogo.json"):
                self.assertTrue((destino / archivo).exists(), archivo)
            import re
            for pagina in ("index.html", "panel.html", "plataforma.html", "coberturas.html", "metodologia.html", "acerca.html", "ficha.html", "restauracion.html", "validacion.html", "campo.html"):
                html = (destino / pagina).read_text(encoding="utf-8")
                self.assertNotIn('"/static/', html)
                self.assertIn("window.CHCP_STATIC", html)
                self.assertIn("https://ejemplo.hf.space/platform", html)
                self.assertEqual(re.findall(r'href="/[a-z]', html), [], pagina)
            stats = json.loads((destino / "datos/estadisticas_territoriales.json").read_text(encoding="utf-8"))
            self.assertEqual(len(stats["territorios"]), 54)
            todo = " ".join(p.read_text(encoding="utf-8", errors="ignore") for p in destino.rglob("*") if p.is_file() and p.suffix in {".html", ".json", ".js"})
            self.assertNotIn("private_key", todo)


class PaqueteSinConexionTests(unittest.TestCase):
    def test_paquete_con_lanzadores_y_sitio(self):
        import zipfile
        spec = importlib.util.spec_from_file_location("sitio", RAIZ / "scripts" / "construir_sitio_estatico.py")
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        with tempfile.TemporaryDirectory() as tmp:
            destino = Path(tmp) / "sitio"
            destino.mkdir()
            (destino / "index.html").write_text("<!doctype html>", encoding="utf-8")
            (destino / "datos").mkdir()
            (destino / "datos" / "a.json").write_text("{}", encoding="utf-8")
            salida = mod.empaquetar_sin_conexion(destino)
            with zipfile.ZipFile(salida) as z:
                nombres = set(z.namelist())
                bat = z.read("Geoportal_CHCP/Abrir Geoportal (Windows).bat").decode("ascii")
                info = z.getinfo("Geoportal_CHCP/Abrir Geoportal (Mac o Linux).command")
            self.assertIn("Geoportal_CHCP/sitio/index.html", nombres)
            self.assertIn("Geoportal_CHCP/sitio/datos/a.json", nombres)
            self.assertIn("Geoportal_CHCP/servidor.ps1", nombres)
            self.assertIn("Geoportal_CHCP/LEEME.txt", nombres)
            self.assertFalse(any("descargas" in n for n in nombres))  # el zip no se incluye a sí mismo
            self.assertIn('%~dp0servidor.ps1', bat)
            self.assertIn("\r\n", bat)
            self.assertTrue((info.external_attr >> 16) & 0o111)

    def test_servidor_windows_solo_sirve_la_carpeta_sitio(self):
        ps1 = (RAIZ / "scripts" / "sin_conexion" / "servidor.ps1").read_bytes()
        self.assertTrue(ps1.startswith(b"\xef\xbb\xbf"))  # UTF-8 con BOM: PowerShell 5.1 lee bien los acentos
        texto = ps1.decode("utf-8-sig")
        self.assertIn("http://localhost:$puerto/", texto)
        self.assertIn("$archivo.StartsWith($raiz)", texto)

    def test_aviso_al_abrir_como_archivo(self):
        js = (RAIZ / "webapp" / "static" / "js" / "common.js").read_text(encoding="utf-8")
        self.assertIn("location.protocol === 'file:'", js)
        self.assertIn("Abrir Geoportal (Windows).bat", js)


class FichaRutaTests(unittest.TestCase):
    def test_ruta_geometria_rechaza_identificadores_invalidos(self):
        try:
            from webapp.main import create_app
        except Exception as exc:  # dependencias web ausentes
            self.skipTest(str(exc))
        app = create_app()
        cliente = app.test_client()
        self.assertEqual(cliente.get("/ficha").status_code, 200)
        self.assertEqual(cliente.get("/api/v1/panel/geometry/..%2Fsecretos").status_code, 404)
        self.assertEqual(cliente.get("/api/v1/panel/geometry/no-existe").status_code, 404)

    def test_rutas_de_mapas_rechazan_archivos_no_permitidos(self):
        try:
            from webapp.main import create_app
        except Exception as exc:
            self.skipTest(str(exc))
        cliente = create_app().test_client()
        self.assertEqual(cliente.get("/restauracion").status_code, 200)
        self.assertEqual(cliente.get("/api/v1/panel/maps/s5/..%2F..%2Fsecretos.png").status_code, 404)
        self.assertEqual(cliente.get("/api/v1/panel/maps/s5/config.py").status_code, 400)
        # Un archivo válido que no existe (los datos reales pueden ya incluir eri.png).
        self.assertEqual(cliente.get("/api/v1/panel/maps/s5/capa_inexistente.png").status_code, 404)
