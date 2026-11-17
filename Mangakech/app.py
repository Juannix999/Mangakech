import os
import shutil
import uuid
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from scraper import (
    preparar_capitulo_manga,
    buscar_mangas_api,
    obtener_capitulos_api,
    obtener_paginas_capitulo_api,
)
from motor_ia_ocr import analizar_pagina_con_gemini, traducir_seleccion_con_gemini

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
DOWNLOADS_DIR = BASE_DIR / "capitulos_descargados"
STATIC_DIR.mkdir(exist_ok=True)
DOWNLOADS_DIR.mkdir(exist_ok=True)

app = FastAPI(title="MangaGlot - Aprende Idiomas con Manga")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
app.mount("/capitulos", StaticFiles(directory=str(DOWNLOADS_DIR)), name="capitulos")


class ScrapeRequest(BaseModel):
    url_capitulo: str
    idioma_origen: str = "ja"
    idioma_destino: str = "es"
    api_key: str | None = None
    max_paginas: int = 5


@app.get("/")
def index():
    return FileResponse(str(STATIC_DIR / "index.html"))


@app.post("/api/scrape")
def scrape_and_analyze(req: ScrapeRequest):
    """
    Usa tu función preparar_capitulo_manga mejorada para descargar un capítulo desde una URL
    y opcionalmente analiza sus páginas con el motor híbrido Gemini + OCR Local.
    """
    folder_id = f"cap_{uuid.uuid4().hex[:8]}"
    ruta_carpeta = str(DOWNLOADS_DIR / folder_id)

    try:
        archivos = preparar_capitulo_manga(
            url_capitulo=req.url_capitulo,
            nombre_carpeta=ruta_carpeta,
            max_paginas=req.max_paginas,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not archivos:
        raise HTTPException(
            status_code=404,
            detail="No se encontraron imágenes de manga en la URL proporcionada (puede requerir renderizado JS o selectores específicos).",
        )

    paginas_procesadas = []
    for idx, ruta_img in enumerate(archivos):
        nombre_archivo = os.path.basename(ruta_img)
        url_publica = f"/capitulos/{folder_id}/{nombre_archivo}"
        analisis = None

        if req.api_key or os.environ.get("GEMINI_API_KEY"):
            try:
                analisis = analizar_pagina_con_gemini(
                    ruta_imagen=ruta_img,
                    idioma_origen=req.idioma_origen,
                    idioma_destino=req.idioma_destino,
                    api_key=req.api_key,
                )
            except Exception as err:
                print(f"Error analizando {nombre_archivo}: {err}")

        paginas_procesadas.append({
            "page_number": idx + 1,
            "image_url": url_publica,
            "analysis": analisis,
        })

    return {
        "folder_id": folder_id,
        "total_pages": len(paginas_procesadas),
        "pages": paginas_procesadas,
    }


@app.post("/api/analyze-upload")
async def analyze_uploaded_image(
    file: UploadFile = File(...),
    idioma_origen: str = Form("auto"),
    idioma_destino: str = Form("es"),
    api_key: str = Form(""),
):
    """Permite subir cualquier página de manga/manhwa/manhua desde el celular o PC y analizarla con IA."""
    ext = Path(file.filename or "pagina.jpg").suffix or ".jpg"
    nombre_unico = f"upload_{uuid.uuid4().hex[:10]}{ext}"
    ruta_guardado = DOWNLOADS_DIR / nombre_unico

    with open(ruta_guardado, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    try:
        resultado = analizar_pagina_con_gemini(
            ruta_imagen=str(ruta_guardado),
            idioma_origen=idioma_origen,
            idioma_destino=idioma_destino,
            api_key=api_key.strip() or None,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {
        "image_url": f"/capitulos/{nombre_unico}",
        "analysis": resultado,
    }


class TranslateSelectionRequest(BaseModel):
    texto_seleccionado: str
    oracion_contexto: str = ""
    idioma_origen: str = "ja"
    idioma_destino: str = "es"
    api_key: str | None = None


@app.post("/api/translate-selection")
def translate_selection(req: TranslateSelectionRequest):
    """Traduce una palabra o frase de varias palabras al idioma que el usuario quiera."""
    try:
        return traducir_seleccion_con_gemini(
            texto_seleccionado=req.texto_seleccionado,
            oracion_contexto=req.oracion_contexto,
            idioma_origen=req.idioma_origen,
            idioma_destino=req.idioma_destino,
            api_key=req.api_key,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/mangadex/search")
def api_search_mangas(q: str = "", lang: str = "all"):
    """Busca mangas en vivo desde la API oficial de MangaDex."""
    try:
        return {"results": buscar_mangas_api(query=q, idioma=lang)}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/mangadex/chapters/{manga_id}")
def api_get_chapters(manga_id: str, lang: str = "all"):
    """Obtiene los capítulos reales de un manga desde MangaDex."""
    try:
        return {"chapters": obtener_capitulos_api(manga_id=manga_id, idioma=lang)}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/mangadex/pages/{chapter_id}")
def api_get_chapter_pages(chapter_id: str):
    """Obtiene las páginas de imagen de un capítulo desde MangaDex At-Home."""
    try:
        return {"pages": obtener_paginas_capitulo_api(chapter_id=chapter_id)}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)
