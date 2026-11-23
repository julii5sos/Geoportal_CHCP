"""Incorpora el Informe Final del Mapa de Cobertura Boscosa y Uso de Suelo 2021 (MiAMBIENTE).

Fuente: «Informe Final del Mapa de Cobertura Boscosa y Uso de Suelo 2021, de Panamá».
Ministerio de Ambiente, Dirección de Información Ambiental, abril de 2022.

1. Leyenda (Cuadro N° 2, pp. 21–22): las 33 categorías numeradas. En los 18 códigos presentes
   en la CHCP, el número coincide con el valor de píxel verificado espacialmente
   (auditoría 2026-11-21). Los otros 15 pasan a «documentada_informe_oficial»: su nombre consta
   en la leyenda numerada oficial, pero su valor de píxel no se ha comprobado espacialmente
   (no aparecen en la cuenca). No se presentan como oficiales.
2. Exactitud oficial (sección 10, Cuadros 3–5, pp. 57–61): matriz de confusión frente al
   «Mapatón 2020» (9 800 muestras). Se guarda en data/validacion/exactitud_oficial_mcbyus2021.json
   con exactitudes de usuario y de productor, y un resumen bosque / no bosque derivado de la
   matriz (por conteos, sin ponderar por área).
3. Coberturas en la Cuenca del Canal (Cuadro N° 26, p. 85), para comparar con el asset.

Idempotente: python scripts/aplicar_informe_mcbyus2021.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
LEYENDAS = RAIZ / "data" / "leyendas_sinia.json"
EXACTITUD = RAIZ / "data" / "validacion" / "exactitud_oficial_mcbyus2021.json"

INFORME = ("MiAMBIENTE, Dirección de Información Ambiental (2022). Informe Final del Mapa de Cobertura "
           "Boscosa y Uso de Suelo 2021, de Panamá. Abril de 2022.")
REF_LEYENDA = f"{INFORME} Cuadro N° 2, pp. 21–22."

# Cuadro N° 2 (nombres normalizados en ortografía; el orden y el número son los del informe).
CUADRO_2 = {
    1: "Bosque latifoliado mixto maduro", 2: "Bosque latifoliado mixto secundario", 3: "Bosque de mangle",
    4: "Bosque de orey", 5: "Bosque de cativo", 6: "Bosque de rafia", 7: "Bosque plantado de coníferas",
    8: "Bosque plantado de latifoliadas", 9: "Rastrojo y vegetación arbustiva", 10: "Vegetación herbácea",
    11: "Vegetación baja inundable", 12: "Afloramiento rocoso", 13: "Playa y arena natural", 14: "Café",
    15: "Cítrico", 16: "Palma aceitera", 17: "Plátano/banano", 18: "Otro cultivo permanente", 19: "Arroz",
    20: "Caña de azúcar", 21: "Horticultura mixta", 22: "Maíz", 23: "Piña", 24: "Otro cultivo anual",
    25: "Área heterogénea de producción agrícola", 26: "Pasto", 27: "Superficie de agua", 28: "Área poblada",
    29: "Infraestructura", 30: "Explotación minera", 31: "Estanque para acuicultura", 32: "Salinera",
    33: "Albinas",
}
# Grupo según el sistema jerarquizado del informe (Cuadro N° 1) para códigos sin grupo conocido.
GRUPO_INFORME = {13: "areas_abiertas_naturales", 15: "cultivos", 16: "cultivos", 17: "cultivos", 18: "cultivos",
                 19: "cultivos", 20: "cultivos", 21: "cultivos", 22: "cultivos", 31: "areas_intervenidas",
                 32: "areas_intervenidas", 33: "areas_abiertas_naturales"}
# Definiciones del informe (sección 7.3, pp. 24–35), resumidas con palabras propias.
DEFINICIONES = {
    1: "Bosque natural dominado por árboles adultos de copa grande y composición cercana a la original; cobertura mantenida al menos 40 años, aunque haya tenido tala selectiva.",
    2: "Bosque natural en recuperación: más especies pioneras, árboles de diámetros medios o bajos y más sotobosque; altura media > 5 m y dosel > 30 %. Incluye rastrojos menores de 5 m declarados con fines forestales.",
    3: "Bosque natural en el que al menos el 60 % de los árboles dominantes son especies de mangle.",
    4: "Bosque natural en el que al menos el 60 % de los árboles dominantes son orey (Campnosperma panamensis).",
    5: "Bosque natural en el que al menos el 60 % de los árboles dominantes son cativo (Prioria copaifera).",
    6: "Bosque natural en el que al menos el 60 % de los individuos dominantes son rafia (Raphia taedigera).",
    7: "Plantación forestal de coníferas (pinos, cipreses y otras).",
    8: "Plantación forestal de especies latifoliadas.",
    9: "Vegetación secundaria que crece tras el uso agropecuario, de altura media menor de 5 m, o formación de arbustos con más del 30 % de cobertura. No se considera bosque hasta alcanzar 5 m de altura y 30 % de copa.",
    10: "Vegetación herbácea natural no inundable con más del 70 % de cobertura y sin pastoreo (eso la distingue del pasto).",
    11: "Vegetación baja en tierras inundadas la mayor parte del año: pantanos, ciénagas y llanuras de inundación.",
    12: "Roca expuesta o suelo desnudo sin vegetación, sobre todo en laderas de fuerte pendiente.",
    13: "Terrenos bajos arenosos o pedregosos con vegetación escasa (menos del 30 %): playas, bancos de arena y dunas.",
    14: "Cultivo permanente de café.", 15: "Cultivo permanente de cítricos.", 16: "Cultivo permanente de palma aceitera.",
    17: "Cultivo permanente de plátano o banano.",
    18: "Otros cultivos permanentes de poca extensión (mango, marañón, aguacate y similares).",
    19: "Cultivo anual de arroz.", 20: "Cultivo de caña de azúcar.", 21: "Cultivo de hortalizas variadas.",
    22: "Cultivo anual de maíz.", 23: "Cultivo de piña.", 24: "Otros cultivos anuales.",
    25: "Mosaico de cultivos, pastos, rastrojos y sistemas agroforestales o silvopastoriles demasiado pequeños para separarlos.",
    26: "Tierra con forraje herbáceo para el ganado, natural o sembrado.",
    27: "Cuerpos y cauces de agua permanentes o estacionales (al menos 4 meses al año con agua).",
    28: "Lugares poblados urbanos (1 500 o más habitantes, con servicios y continuidad física) y rurales.",
    29: "Instalaciones comerciales, industriales y de servicios, red vial y ferroviaria, puertos, aeropuertos, obras hidráulicas y redes eléctricas.",
    30: "Explotación de minerales e hidrocarburos, incluidas las áreas abandonadas sin recuperación significativa.",
    31: "Cuerpos de agua artificiales para la cría de peces y crustáceos.",
    32: "Terreno costero con estructuras para producir sal.",
    33: "Zonas costeras bajas, inundadas ocasionalmente por la marea, sin vegetación o con vegetación escasa adaptada a la sal.",
}
ESTADO = "documentada_informe_oficial"
DESCRIPCION_ESTADO = ("Nombre y número tomados de la leyenda numerada del informe final oficial del mapa; el número "
                      "coincide con el valor de píxel en los códigos verificados espacialmente, pero este código no "
                      "se ha comprobado espacialmente (no aparece en la CHCP). No se presenta como oficial.")

# Sección 10: clases del Mapatón (Cuadro N° 3) y matriz (Cuadro N° 5). Filas: mapa 2021; columnas: Mapatón.
CLASES = ["A", "C", "F", "G", "I", "L", "M", "O", "P", "R", "S", "W"]
NOMBRES = {"A": "Cultivos anuales", "C": "Bosque plantado de coníferas", "F": "Bosque maduro", "G": "Pasto",
           "I": "Asentamientos", "L": "Bosque plantado de latifoliadas", "M": "Bosque de mangle", "O": "Otras tierras",
           "P": "Cultivos permanentes", "R": "Rastrojos", "S": "Bosque secundario", "W": "Humedales"}
MATRIZ = [
    [181, 0, 2, 40, 0, 0, 0, 0, 13, 4, 5, 1],
    [0, 10, 0, 0, 0, 0, 0, 0, 0, 3, 1, 0],
    [3, 0, 2995, 32, 2, 1, 4, 3, 2, 38, 295, 12],
    [181, 0, 19, 1744, 73, 10, 3, 7, 7, 216, 169, 7],
    [8, 0, 4, 28, 145, 0, 0, 0, 1, 9, 15, 20],
    [2, 0, 0, 11, 0, 58, 0, 0, 1, 2, 6, 1],
    [0, 0, 8, 2, 0, 0, 195, 1, 0, 5, 20, 10],
    [0, 0, 2, 1, 1, 0, 1, 8, 0, 0, 1, 7],
    [4, 0, 0, 0, 2, 1, 0, 0, 51, 2, 5, 1],
    [30, 1, 18, 206, 14, 3, 1, 0, 4, 194, 215, 3],
    [67, 0, 284, 296, 22, 21, 14, 2, 8, 293, 1130, 21],
    [4, 0, 13, 8, 1, 0, 14, 2, 0, 3, 8, 178],
]
TOTALES_FILA = [246, 14, 3387, 2436, 230, 81, 241, 21, 66, 689, 2158, 231]
TOTALES_COLUMNA = [480, 11, 3345, 2368, 260, 94, 232, 23, 87, 769, 1870, 261]
# «Bosques y otras tierras boscosas» del mapa general: bosques (naturales y plantados) y rastrojo.
BOSQUE_GENERAL = {"C", "F", "L", "M", "R", "S"}

# Cuadro N° 26: coberturas 2021 en la cuenca endorreica del Canal (ha).
CUADRO_26_HA = {1: 128585.38, 2: 63650.55, 7: 148.90, 8: 6494.46, 9: 3367.36, 10: 6453.60, 11: 667.29,
                12: 774.02, 22: 1.43, 23: 2626.80, 26: 75206.81, 27: 45383.55, 28: 9680.65, 29: 1162.81, 30: 21.59}
CUADRO_26_TOTAL_HA = 344225.19


def exactitud() -> dict:
    n = sum(TOTALES_FILA)
    for i, fila in enumerate(MATRIZ):
        assert sum(fila) == TOTALES_FILA[i], f"fila {CLASES[i]}"
    for j in range(len(CLASES)):
        assert sum(f[j] for f in MATRIZ) == TOTALES_COLUMNA[j], f"columna {CLASES[j]}"
    diag = sum(MATRIZ[i][i] for i in range(len(CLASES)))
    pe = sum(TOTALES_FILA[i] * TOTALES_COLUMNA[i] for i in range(len(CLASES))) / n ** 2
    po = diag / n
    por_clase = [{
        "clase": c, "nombre": NOMBRES[c],
        "exactitud_usuario": round(MATRIZ[i][i] / TOTALES_FILA[i], 3),
        "exactitud_productor": round(MATRIZ[i][i] / TOTALES_COLUMNA[i], 3),
        "muestras_mapa": TOTALES_FILA[i], "muestras_referencia": TOTALES_COLUMNA[i],
    } for i, c in enumerate(CLASES)]
    b = [i for i, c in enumerate(CLASES) if c in BOSQUE_GENERAL]
    nb = [i for i, c in enumerate(CLASES) if c not in BOSQUE_GENERAL]
    bb = sum(MATRIZ[i][j] for i in b for j in b)
    bn = sum(MATRIZ[i][j] for i in b for j in nb)   # mapa bosque, referencia no bosque
    nbb = sum(MATRIZ[i][j] for i in nb for j in b)  # mapa no bosque, referencia bosque
    nn = sum(MATRIZ[i][j] for i in nb for j in nb)
    return {
        "fuente": f"{INFORME} Sección 10 y Cuadros N° 3–5, pp. 57–61.",
        "referencia": "Mapatón 2020: datos de actividad del Inventario Nacional de Gases de Efecto Invernadero, "
                      "interpretados sobre imágenes de alta resolución de 2020 (9 800 muestras de 25 puntos).",
        "interpretes": "Tres especialistas que no participaron en la elaboración del mapa (informe, p. 19).",
        "muestras": n,
        "exactitud_global": round(po, 3),
        "exactitud_global_informe": 0.703,
        "kappa": round((po - pe) / (1 - pe), 3),
        "kappa_informe": 0.615,
        "clases": por_clase,
        "matriz": {"filas_mapa_2021": CLASES, "columnas_mapaton": CLASES, "valores": MATRIZ},
        "bosque_y_otras_tierras_boscosas": {
            "definicion": "Clases C, F, L, M, R y S (bosques naturales y plantados y rastrojo), como en el mapa general.",
            "matriz_2x2": {"mapa_bosque_ref_bosque": bb, "mapa_bosque_ref_no_bosque": bn,
                           "mapa_no_bosque_ref_bosque": nbb, "mapa_no_bosque_ref_no_bosque": nn},
            "exactitud_global": round((bb + nn) / n, 3),
            "exactitud_usuario_bosque": round(bb / (bb + bn), 3),
            "exactitud_productor_bosque": round(bb / (bb + nbb), 3),
            "exactitud_usuario_no_bosque": round(nn / (nn + nbb), 3),
            "exactitud_productor_no_bosque": round(nn / (nn + bn), 3),
            "nota": "Derivado por el geoportal agregando la matriz oficial. Son proporciones de muestras: no están "
                    "ponderadas por el área de cada estrato ni tienen intervalos de confianza.",
        },
        "limitaciones": [
            "La referencia es de 2020 y el mapa de 2021: parte del desacuerdo puede ser cambio real.",
            "El informe no describe un diseño probabilístico con probabilidades de inclusión; no se pueden estimar "
            "áreas corregidas por error ni intervalos de confianza (Olofsson et al. 2014).",
            "Es una evaluación nacional; no hay cifras específicas para la Cuenca del Canal.",
            "Las categorías se agrupan en 12 clases del Mapatón (p. ej., pasto con vegetación herbácea; "
            "área heterogénea con asentamientos).",
        ],
    }


def comparar_asset() -> list[dict]:
    """Superficie del asset en la CHCP (auditoría 2026-11-21) frente al Cuadro N° 26 del informe."""
    import csv

    aud = json.loads((RAIZ / "docs" / "validacion" / "auditoria_assets_sinia.json").read_text(encoding="utf-8"))
    asset = {int(h["codigo"]): float(h["sum"]) for h in aud["assets"]["2021_detallado"]["inventario_chcp"]["histograma_ha"]}
    filas = []
    for codigo in sorted(set(asset) | set(CUADRO_26_HA)):
        a, i = asset.get(codigo, 0.0), CUADRO_26_HA.get(codigo, 0.0)
        filas.append({"codigo": codigo, "categoria": CUADRO_2[codigo], "asset_ha": round(a, 1), "informe_ha": round(i, 1),
                      "diferencia_ha": round(a - i, 1), "diferencia_pct": round((a - i) / i * 100, 1) if i else None})
    total_a, total_i = sum(asset.values()), CUADRO_26_TOTAL_HA
    filas.append({"codigo": "", "categoria": "Total", "asset_ha": round(total_a, 1), "informe_ha": total_i,
                  "diferencia_ha": round(total_a - total_i, 1), "diferencia_pct": round((total_a - total_i) / total_i * 100, 1)})
    destino = RAIZ / "docs" / "auditoria" / "datos" / "B_2021_asset_vs_informe.csv"
    with destino.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(filas[0]))
        w.writeheader()
        w.writerows(filas)
    return filas


def main() -> int:
    datos = json.loads(LEYENDAS.read_text(encoding="utf-8"))
    datos["estados"][ESTADO] = DESCRIPCION_ESTADO
    cambios = 0
    for fila in datos["leyendas"]["2021_detallado"]:
        codigo = int(fila["codigo"])
        nombre = CUADRO_2[codigo]
        fila["nombre_informe_oficial"] = nombre
        fila["documento_oficial"] = REF_LEYENDA
        if codigo in CUADRO_26_HA:
            fila["area_chcp_informe_ha"] = CUADRO_26_HA[codigo]
        if not fila.get("descripcion"):
            fila["descripcion"] = DEFINICIONES[codigo] + " (Resumen del informe oficial, sección 7.3.)"
        if fila["estado"] in ("verificada_espacialmente", "verificada_valor_atributo"):
            continue
        nueva = {
            "estado": ESTADO,
            "categoria": f"Código {codigo} · {nombre} (informe oficial; sin verificar en la cuenca)",
            "candidato_leyenda_oficial": nombre,
            "fuente_correspondencia": REF_LEYENDA,
        }
        if fila.get("grupo_derivado") in (None, "no_identificado") and codigo in GRUPO_INFORME:
            nueva["grupo_derivado"] = GRUPO_INFORME[codigo]
        if any(fila.get(k) != v for k, v in nueva.items()):
            fila.update(nueva)
            cambios += 1
    LEYENDAS.write_text(json.dumps(datos, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    EXACTITUD.parent.mkdir(parents=True, exist_ok=True)
    exa = exactitud()
    exa["cuenca_canal_cuadro_26"] = {"total_ha": CUADRO_26_TOTAL_HA, "por_codigo_ha": CUADRO_26_HA}
    EXACTITUD.write_text(json.dumps(exa, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    comparar_asset()
    print(f"{cambios} códigos documentados por el informe; exactitud global {exa['exactitud_global']} "
          f"(informe {exa['exactitud_global_informe']}), kappa {exa['kappa']} (informe {exa['kappa_informe']}); "
          f"bosque/no bosque {exa['bosque_y_otras_tierras_boscosas']['exactitud_global']}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
