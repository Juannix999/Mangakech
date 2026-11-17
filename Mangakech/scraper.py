import os
import re
from urllib.parse import urljoin, urlparse
import requests
from bs4 import BeautifulSoup


EXTENSIONES_VALIDAS = {'.jpg', '.jpeg', '.png', '.webp', '.avif'}
PALABRAS_CLAVE_MANGA = ('manga', 'chapter', 'capitulo', 'pages', 'page', 'scan', 'uploads', 'media', 'cdn', 'img')
PALABRAS_EXCLUIDAS = ('logo', 'avatar', 'icon', 'banner', 'ads', 'favicon', 'button')


def obtener_extension(img_url: str, content_type: str = "") -> str:
    """Determina la extensión correcta de la imagen según su URL o encabezado HTTP."""
    path = urlparse(img_url).path.lower()
    for ext in EXTENSIONES_VALIDAS:
        if path.endswith(ext):
            return ext

    content_type = content_type.lower()
    if 'webp' in content_type:
        return '.webp'
    if 'png' in content_type:
        return '.png'
    return '.jpg'


def extraer_url_imagen(img_tag) -> str | None:
    """Extrae la URL real de una etiqueta <img> soportando lazy-loading y srcset."""
    atributos = ['data-src', 'data-lazy-src', 'data-original', 'data-url', 'src']
    for attr in atributos:
        val = img_tag.get(attr)
        if val and isinstance(val, str):
            val = val.strip()
            if val and not val.startswith('data:image'):
                return val

    srcset = img_tag.get('srcset') or img_tag.get('data-srcset')
    if srcset and isinstance(srcset, str):
        primera = srcset.split(',')[0].strip().split(' ')[0]
        if primera and not primera.startswith('data:image'):
            return primera

    return None


def es_imagen_de_pagina(img_url: str) -> bool:
    """Filtra íconos/logos y prioriza imágenes que parecen páginas de manga/manhwa."""
    url_lower = img_url.lower()
    if any(excl in url_lower for excl in PALABRAS_EXCLUIDAS):
        return False
    if any(palabra in url_lower for palabra in PALABRAS_CLAVE_MANGA):
        return True
    # También aceptamos imágenes numeradas típicas (ej. 01.jpg, 002.webp)
    nombre_archivo = os.path.basename(urlparse(url_lower).path)
    return bool(re.match(r'^\d+[\w\-]*\.(jpg|jpeg|png|webp|avif)$', nombre_archivo))


def preparar_capitulo_manga(url_capitulo: str, nombre_carpeta: str = "capitulo_descargado", max_paginas: int = 40) -> list[str]:
    """
    Descarga y organiza las páginas de un capítulo de manga manejando rutas relativas,
    protección anti-hotlink (Referer) y atributos lazy-load.
    Retorna la lista de rutas de archivos descargados.
    """
    os.makedirs(nombre_carpeta, exist_ok=True)

    headers = {
        'User-Agent': (
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
            'AppleWebKit/537.36 (KHTML, like Gecko) '
            'Chrome/124.0.0.0 Safari/537.36'
        ),
        'Referer': url_capitulo,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    }

    print(f"Conectando con: {url_capitulo}")
    session = requests.Session()
    respuesta = session.get(url_capitulo, headers=headers, timeout=20)

    if respuesta.status_code != 200:
        raise RuntimeError(f"Error al conectar con la página. Código HTTP: {respuesta.status_code}")

    soup = BeautifulSoup(respuesta.text, 'html.parser')
    imagenes = soup.find_all('img')

    archivos_descargados: list[str] = []
    urls_vistas: set[str] = set()
    contador = 1

    for img in imagenes:
        if contador > max_paginas:
            break

        raw_url = extraer_url_imagen(img)
        if not raw_url:
            continue

        # Resuelve automáticamente URLs con //, rutas relativas /uploads/... o rutas completas
        img_url = urljoin(url_capitulo, raw_url)
        if img_url in urls_vistas:
            continue

        if es_imagen_de_pagina(img_url):
            urls_vistas.add(img_url)
            try:
                res_img = session.get(img_url, headers=headers, timeout=20)
                if res_img.status_code == 200 and len(res_img.content) > 8_000:
                    ext = obtener_extension(img_url, res_img.headers.get('Content-Type', ''))
                    nombre_archivo = os.path.join(nombre_carpeta, f"pagina_{contador:03d}{ext}")
                    with open(nombre_archivo, 'wb') as f:
                        f.write(res_img.content)
                    print(f"Guardada: {nombre_archivo}")
                    archivos_descargados.append(nombre_archivo)
                    contador += 1
            except Exception as e:
                print(f"No se pudo descargar la imagen {img_url}: {e}")

    print(f"\n¡Proceso finalizado! Se descargaron {len(archivos_descargados)} páginas en '{nombre_carpeta}'.")
    return archivos_descargados


# =====================================================================
# Integración con API Real de Manga (MangaDex API Oficial)
# =====================================================================

MANGADEX_API = "https://api.mangadex.org"


def buscar_mangas_api(query: str = "", idioma: str = "ja", limit: int = 12) -> list[dict]:
    """Busca mangas reales en la API pública de MangaDex con portadas y metadatos."""
    params: list[tuple[str, str | int]] = [
        ("limit", limit),
        ("includes[]", "cover_art"),
        ("contentRating[]", "safe"),
        ("contentRating[]", "suggestive"),
        ("order[followedCount]", "desc"),
    ]
    if query.strip():
        params.append(("title", query.strip()))
    if idioma and idioma != "all":
        params.append(("availableTranslatedLanguage[]", idioma))

    res = requests.get(f"{MANGADEX_API}/manga", params=params, timeout=15)
    res.raise_for_status()
    data = res.json().get("data", [])

    resultados = []
    for item in data:
        manga_id = item["id"]
        attrs = item.get("attributes", {})
        titles = attrs.get("title", {})
        titulo = (
            titles.get("es")
            or titles.get("en")
            or titles.get("ja-ro")
            or titles.get("ja")
            or next(iter(titles.values()), "Manga")
        )
        desc_map = attrs.get("description", {})
        descripcion = desc_map.get("es") or desc_map.get("en") or ""

        cover_file = None
        for rel in item.get("relationships", []):
            if rel.get("type") == "cover_art":
                cover_file = rel.get("attributes", {}).get("fileName")
                break

        cover_url = (
            f"https://uploads.mangadex.org/covers/{manga_id}/{cover_file}.256.jpg"
            if cover_file
            else ""
        )

        resultados.append({
            "id": manga_id,
            "title": titulo,
            "description": descripcion[:220],
            "originalLanguage": attrs.get("originalLanguage", "ja"),
            "cover_url": cover_url,
        })
    return resultados


def obtener_capitulos_api(manga_id: str, idioma: str = "en", limit: int = 20) -> list[dict]:
    """Obtiene la lista de capítulos disponibles de un manga en el idioma solicitado."""
    params: list[tuple[str, str | int]] = [
        ("limit", limit),
        ("order[chapter]", "asc"),
    ]
    if idioma and idioma != "all":
        params.append(("translatedLanguage[]", idioma))

    res = requests.get(f"{MANGADEX_API}/manga/{manga_id}/feed", params=params, timeout=15)
    res.raise_for_status()
    data = res.json().get("data", [])

    capitulos = []
    for ch in data:
        attrs = ch.get("attributes", {})
        if attrs.get("externalUrl"):
            continue
        capitulos.append({
            "id": ch["id"],
            "chapter": attrs.get("chapter") or "1",
            "title": attrs.get("title") or f"Capítulo {attrs.get('chapter') or 1}",
            "language": attrs.get("translatedLanguage", idioma),
            "pages": attrs.get("pages", 0),
        })
    return capitulos


def obtener_paginas_capitulo_api(chapter_id: str, data_saver: bool = True) -> list[str]:
    """Obtiene las URLs directas de todas las páginas de un capítulo desde MangaDex At-Home."""
    res = requests.get(f"{MANGADEX_API}/at-home/server/{chapter_id}", timeout=15)
    res.raise_for_status()
    payload = res.json()
    base_url = payload.get("baseUrl")
    chapter_info = payload.get("chapter", {})
    hash_code = chapter_info.get("hash")
    archivos = chapter_info.get("dataSaver" if data_saver else "data", [])
    modo = "data-saver" if data_saver else "data"

    return [f"{base_url}/{modo}/{hash_code}/{nombre}" for nombre in archivos]


if __name__ == "__main__":
    url_ejemplo = "https://tu-sitio-de-manga-preferido.com/capitulo-1"
    # preparar_capitulo_manga(url_ejemplo)
