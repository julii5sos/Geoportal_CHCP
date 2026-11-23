"""Gráficas de la Plataforma SIG (webapp/static/js/graficas.js)."""
import json
import shutil
import subprocess
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
NODE = shutil.which("node")
MODULO = json.dumps(str(RAIZ / "webapp/static/js/graficas.js"))


@unittest.skipUnless(NODE, "node no disponible")
class GraficasTests(unittest.TestCase):
    def node(self, codigo):
        salida = subprocess.run([NODE, "-"], input=f"const G = require({MODULO});\n{codigo}", capture_output=True, text=True, check=True)
        return json.loads(salida.stdout)

    def test_marcas_redondas_y_cubren_el_maximo(self):
        r = self.node("console.log(JSON.stringify([G.marcas(37), G.marcas(1234), G.marcas(0)]))")
        self.assertEqual(r[0], [0, 10, 20, 30, 40])
        self.assertGreaterEqual(r[1][-1], 1234)
        self.assertEqual(r[2], [0, 1])

    def test_barras_ordenadas_con_porcentaje_y_tooltip(self):
        html = self.node("""console.log(JSON.stringify(G.barrasClases([{etiqueta:'A',color:'#111111',valor:10},{etiqueta:'B',color:'#222222',valor:30}])))""")
        self.assertLess(html.index(">B<"), html.index(">A<"))
        self.assertRegex(html, r"75[.,]0 %")
        self.assertIn("data-tip", html)

    def test_serie_apilada_marca_el_anio_y_tiene_una_columna_por_anio(self):
        html = self.node("""console.log(JSON.stringify(G.serieApilada({anios:[2020,2021,2022],series:[{etiqueta:'X',color:'#123456',valores:[1,2,3]}],marcado:2021})))""")
        self.assertEqual(html.count('class="g-col'), 3)
        self.assertEqual(html.count("g-atenuada"), 2)
        self.assertIn('data-anio="2021"', html)

    def test_mancuernas_cambio_con_signo(self):
        html = self.node("""console.log(JSON.stringify(G.mancuernas({filas:[{etiqueta:'Bosque',color:'#1d6b35',a:100,b:60}],anioA:2020,anioB:2025})))""")
        self.assertIn("−40 ha", html)

    def test_linea_escala_fija_con_bandas(self):
        html = self.node("""console.log(JSON.stringify(G.linea({anios:[2020,2021,2022],valores:[-14.1,-14.3,-13.9],min:-32,max:-8,bandas:[{desde:-32,hasta:-22,etiqueta:'agua',color:'#2166ac'}],marcasY:[-30,-20,-10]})))""")
        self.assertIn('class="g-banda"', html)
        self.assertIn(">agua<", html)
        self.assertIn(">−30<", html.replace("-30", "−30"))

    def test_tabla_equivalente(self):
        html = self.node("console.log(JSON.stringify(G.tablaDatos(['Año','Valor'],[[2020,'1 ha']])))")
        self.assertIn("<details", html)
        self.assertIn("<td>2020</td>", html)


class PlataformaTemasTests(unittest.TestCase):
    def test_plantilla_carga_graficas_y_barra_de_anios(self):
        html = (RAIZ / "webapp/templates/plataforma_estatica.html").read_text(encoding="utf-8")
        self.assertIn("js/graficas.js", html)
        self.assertLess(html.index("js/graficas.js"), html.index("js/plataforma_estatica.js"))
        self.assertIn('id="pe-anios"', html)
        self.assertIn('id="pe-temas"', html)

    def test_temas_cubren_las_cinco_fuentes_del_indice(self):
        js = (RAIZ / "webapp/static/js/plataforma_estatica.js").read_text(encoding="utf-8")
        for clave in ("k: 'jrc'", "k: 'hansen'", "k: 'esri'", "k: 'ndvi'", "k: 'gedi'", "k: 'preev'"):
            self.assertIn(clave, js)


if __name__ == "__main__":
    unittest.main()
