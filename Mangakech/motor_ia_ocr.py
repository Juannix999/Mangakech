import json
import os
from pathlib import Path
from typing import Any
from pydantic import BaseModel, Field


# =====================================================================
# Esquemas de Datos Estructurados (Pydantic) para Gemini + OCR Híbrido
# =====================================================================

class BoundingBox(BaseModel):
    x: float = Field(description="Coordenada X izquierda normalizada (0.0 a 1.0)")
    y: float = Field(description="Coordenada Y superior normalizada (0.0 a 1.0)")
    w: float = Field(description="Ancho del globo normalizado (0.0 a 1.0)")
    h: float = Field(description="Alto del globo normalizado (0.0 a 1.0)")


class WordToken(BaseModel):
    surface: str = Field(description="Palabra tal como aparece en el globo")
    reading: str = Field(description="Lectura fonética: Furigana/Romaji para japonés, Romanización para coreano, Pinyin para chino, o IPA")
    base_form: str = Field(description="Forma base o de diccionario de la palabra")
    pos: str = Field(description="Categoría gramatical en español (ej. Sustantivo, Verbo, Partícula, Expresión)")
    meaning: str = Field(description="Significado traducido según el contexto exacto de la escena")
    grammar_note: str = Field(default="", description="Breve nota gramatical o de uso útil para el estudiante")


class SpeechBubble(BaseModel):
    id: str = Field(description="Identificador único del globo, ej. b1, b2")
    box: BoundingBox
    original_text: str = Field(description="Oración completa en el idioma original del manga")
    reading_full: str = Field(description="Lectura fonética de la oración completa")
    translated_text: str = Field(description="Traducción natural de la oración completa al idioma destino")
    words: list[WordToken] = Field(description="Desglose secuencial palabra por palabra de la oración")


class PageAnalysisResult(BaseModel):
    source_language: str = Field(description="Código o nombre del idioma original detectado (ja, ko, zh, en, fr, etc.)")
    target_language: str = Field(description="Idioma al que se tradujo (ej. es)")
    engine_used: str = Field(description="Motor empleado: 'hybrid_gemini_local_ocr' o 'gemini_vision'")
    bubbles: list[SpeechBubble]


# =====================================================================
# Etapa 1: Detector OCR Local Opcional (EasyOCR + MangaOCR)
# =====================================================================

def ejecutar_ocr_local(ruta_imagen: str, idioma_origen: str = "ja") -> list[dict[str, Any]]:
    """
    Intenta detectar cajas de texto con EasyOCR y refinar texto japonés con MangaOCR si están instalados.
    Si no están instalados en el entorno, retorna una lista vacía y delega el 100% a Gemini Vision.
    """
    detecciones_locales: list[dict[str, Any]] = []
    try:
        import easyocr  # type: ignore
        from PIL import Image

        mapa_idiomas = {
            "ja": ["ja", "en"],
            "ko": ["ko", "en"],
            "zh": ["ch_sim", "en"],
            "en": ["en"],
            "fr": ["fr", "en"],
            "es": ["es", "en"],
        }
        langs = mapa_idiomas.get(idioma_origen, ["ja", "en"])
        reader = easyocr.Reader(langs, gpu=False, verbose=False)

        with Image.open(ruta_imagen) as img:
            ancho_img, alto_img = img.size

            # Opcional: cargar MangaOCR para japonés vertical de alta precisión
            mocr = None
            if idioma_origen == "ja":
                try:
                    from manga_ocr import MangaOcr  # type: ignore
                    mocr = MangaOcr()
                except ImportError:
                    mocr = None

            resultados = reader.readtext(ruta_imagen)
            for idx, (bbox, texto_easy, conf) in enumerate(resultados):
                if conf < 0.25:
                    continue
                xs = [p[0] for p in bbox]
                ys = [p[1] for p in bbox]
                xmin, xmax = max(0, min(xs)), min(ancho_img, max(xs))
                ymin, ymax = max(0, min(ys)), min(alto_img, max(ys))

                texto_final = texto_easy
                if mocr is not None and (xmax - xmin) > 10 and (ymax - ymin) > 10:
                    recorte = img.crop((xmin, ymin, xmax, ymax))
                    texto_final = mocr(recorte)

                detecciones_locales.append({
                    "id": f"local_{idx+1}",
                    "box": {
                        "x": round(xmin / ancho_img, 4),
                        "y": round(ymin / alto_img, 4),
                        "w": round((xmax - xmin) / ancho_img, 4),
                        "h": round((ymax - ymin) / alto_img, 4),
                    },
                    "ocr_text": texto_final,
                })
    except ImportError:
        # EasyOCR no instalado; se utiliza directamente Gemini Vision Multimodal
        pass
    except Exception as e:
        print(f"[OCR Local] Aviso: {e}")

    return detecciones_locales


# =====================================================================
# Etapa 2: Fusión con Gemini Multimodal (Visión + Tokenización + Traducción)
# =====================================================================

def analizar_pagina_con_gemini(
    ruta_imagen: str,
    idioma_origen: str = "auto",
    idioma_destino: str = "es",
    api_key: str | None = None,
) -> dict[str, Any]:
    """
    Fusiona las pistas del OCR local (si existen) con la visión multimodal de Gemini 2.5 Flash
    para detectar globos de manga, extraer texto en cualquier idioma, traducir y separar palabra por palabra.
    """
    clave = api_key or os.environ.get("GEMINI_API_KEY")
    if not clave:
        raise ValueError(
            "Se requiere GEMINI_API_KEY para analizar imágenes nuevas con IA. "
            "Puedes ingresarla en el botón 'Configurar IA / Importar' de la aplicación."
        )

    from google import genai
    from google.genai import types
    from PIL import Image

    # 1. Ejecutar OCR local si está disponible para fusionar coordenadas precisas
    pistas_locales = ejecutar_ocr_local(ruta_imagen, idioma_origen if idioma_origen != "auto" else "ja")
    modo_motor = "hybrid_gemini_local_ocr" if pistas_locales else "gemini_vision"

    pistas_texto = ""
    if pistas_locales:
        pistas_texto = (
            "\nAdemás, el motor OCR local detectó preliminarmente estas regiones y textos (úsalos para "
            "mejorar la precisión de las coordenadas y agrupa líneas que pertenezcan al mismo globo):\n"
            f"{json.dumps(pistas_locales, ensure_ascii=False)}\n"
        )

    prompt = f"""
Eres un profesor experto en idiomas y analizador de manga/manhwa/manhua/cómics.
Analiza esta página de manga:
1. Detecta TODOS los globos de diálogo (speech bubbles) en orden de lectura natural (derecha a izquierda si es manga japonés, o izquierda a derecha si es manhwa/occidental).
2. Para cada globo, devuelve su recuadro ('box') con coordenadas normalizadas entre 0.0 y 1.0 (x, y son la esquina superior izquierda; w, h son el ancho y alto del globo de texto).
3. Extrae el texto original exacto ('original_text') y su lectura fonética completa ('reading_full').
4. Traduce la oración completa de forma natural al idioma '{idioma_destino}' ('translated_text').
5. Divide la oración palabra por palabra ('words') para que un estudiante pueda tocar cada palabra en la pantalla y ver su lectura, forma base de diccionario, categoría gramatical, significado en este contexto y una breve nota gramatical.
Idioma origen esperado: {idioma_origen}. Idioma de traducción y explicaciones: {idioma_destino}.
{pistas_texto}
""".strip()

    client = genai.Client(api_key=clave)
    with Image.open(ruta_imagen) as img:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[img, prompt],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=PageAnalysisResult,
                temperature=0.1,
            ),
        )

    resultado = json.loads(response.text)
    resultado["engine_used"] = modo_motor
    return resultado


class SelectionTranslationResult(BaseModel):
    selected_text: str
    reading: str
    target_language: str
    translated_text: str
    literal_breakdown: str
    grammar_explanation: str


def traducir_seleccion_con_gemini(
    texto_seleccionado: str,
    oracion_contexto: str,
    idioma_origen: str,
    idioma_destino: str,
    api_key: str | None = None,
) -> dict[str, Any]:
    """Traduce una palabra o frase de varias palabras seleccionadas con el táctil al idioma que el usuario elija."""
    clave = api_key or os.environ.get("GEMINI_API_KEY")
    if not clave:
        raise ValueError("Se requiere GEMINI_API_KEY para traducción avanzada con Gemini.")

    from google import genai
    from google.genai import types

    prompt = f"""
Traduce el siguiente fragmento o palabra seleccionada de un manga al idioma '{idioma_destino}'.
- Fragmento seleccionado: "{texto_seleccionado}"
- Oración completa del globo (contexto): "{oracion_contexto}"
- Idioma origen: "{idioma_origen}"
- Idioma destino requerido: "{idioma_destino}"

Devuelve la lectura fonética, la traducción exacta en '{idioma_destino}', el desglose literal de las palabras seleccionadas y una breve explicación gramatical en '{idioma_destino}'.
""".strip()

    client = genai.Client(api_key=clave)
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=SelectionTranslationResult,
            temperature=0.1,
        ),
    )
    return json.loads(response.text)

