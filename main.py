# =============================================================================
# main.py — API de pointage par reconnaissance faciale (version finale)
# Stack : FastAPI + InsightFace (buffalo_l) + SQLite
#
# Documentation officielle :
#   FastAPI (fichiers, formulaires)  : https://fastapi.tiangolo.com/tutorial/request-files/
#   FastAPI (réponses personnalisées): https://fastapi.tiangolo.com/advanced/custom-response/
#   InsightFace                      : https://github.com/deepinsight/insightface/tree/master/python-package
#   sqlite3                          : https://docs.python.org/3/library/sqlite3.html
#   OpenCV VideoCapture (caméra IP)  : https://docs.opencv.org/4.x/d8/dfe/classcv_1_1VideoCapture.html
# =============================================================================

import sqlite3
from datetime import datetime, date

import cv2
import numpy as np
from fastapi import FastAPI, UploadFile, Form
from fastapi.responses import PlainTextResponse
from fastapi.staticfiles import StaticFiles
from insightface.app import FaceAnalysis

# ----------------------------- Réglages --------------------------------------
# Seuil validé expérimentalement : même personne 0.786-0.797, inconnu 0.299.
SEUIL_COSINUS = 0.40
DB = "attendance.db"

# --------------------- Modèle : chargé UNE SEULE FOIS ------------------------
face_app = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
face_app.prepare(ctx_id=-1, det_size=(640, 640))


def read_upload(file_bytes: bytes):
    """Octets uploadés -> image OpenCV (BGR)."""
    arr = np.frombuffer(file_bytes, dtype=np.uint8)
    return cv2.imdecode(arr, cv2.IMREAD_COLOR)


def all_embeddings(img_bgr):
    """TOUS les visages de l'image -> [(embedding, bbox), ...] (photos de groupe)."""
    return [(f.normed_embedding, f.bbox.tolist()) for f in face_app.get(img_bgr)]


def largest_embedding(img_bgr):
    """Le PLUS GRAND visage seulement (enrôlement : une personne à la fois)."""
    faces = face_app.get(img_bgr)
    if not faces:
        return None
    f = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
    return f.normed_embedding


# ----------------------------- Base de données -------------------------------
# persons   : nom + embedding (JAMAIS la photo — minimisation RGPD)
# presences : registre officiel, UNE ligne par personne et par jour (UNIQUE)
# logs      : journal de TOUTES les reconnaissances (audit)
def init_db():
    con = sqlite3.connect(DB)
    con.execute("""CREATE TABLE IF NOT EXISTS persons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        embedding BLOB NOT NULL)""")
    con.execute("""CREATE TABLE IF NOT EXISTS presences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        date TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        UNIQUE(name, date))""")
    con.execute("""CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        similarity REAL,
        timestamp TEXT NOT NULL)""")
    con.commit()
    con.close()


init_db()
app = FastAPI(title="Attendance AI")


# ------------------- Cœur : reconnaissance d'une image -----------------------
# Factorisé dans UNE fonction, réutilisée par /recognize (upload/webcam)
# et /recognize_ip (caméra IP) : même logique, deux sources d'image.
def recognize_image(img_bgr):
    detections = all_embeddings(img_bgr)
    if not detections:
        return {"faces": [], "error": "aucun visage détecté"}

    con = sqlite3.connect(DB)
    persons = [(n, np.frombuffer(b, dtype=np.float32))
               for n, b in con.execute("SELECT name, embedding FROM persons")]
    today = date.today().isoformat()
    now = datetime.now().isoformat(timespec="seconds")

    results = []
    for emb, bbox in detections:
        best_name, best_sim = None, -1.0
        for pname, pemb in persons:          # 1-vs-N : cosinus = produit scalaire
            sim = float(np.dot(emb, pemb))
            if sim > best_sim:
                best_name, best_sim = pname, sim

        known = best_name is not None and best_sim >= SEUIL_COSINUS
        display = best_name if known else None

        con.execute("INSERT INTO logs (name, similarity, timestamp) VALUES (?,?,?)",
                    (display or "inconnu", round(best_sim, 3), now))

        first_today = False
        if known:
            cur = con.execute(   # INSERT OR IGNORE : la contrainte UNIQUE fait le tri
                "INSERT OR IGNORE INTO presences (name, date, timestamp) VALUES (?,?,?)",
                (display, today, now))
            first_today = cur.rowcount == 1

        results.append({"known": known, "name": display,
                        "similarity": round(best_sim, 3),
                        "first_today": first_today, "bbox": bbox})
    con.commit()
    con.close()
    return {"faces": results}


# ----------------------------- Routes -----------------------------------------
@app.post("/enroll")
async def enroll(name: str = Form(...), file: UploadFile = None):
    """Inscription. Protections : nom UNIQUE (SQL) + anti-doublon de VISAGE
    (le même visage ne peut pas exister sous deux noms)."""
    img = read_upload(await file.read())
    emb = largest_embedding(img)
    if emb is None:
        return {"ok": False, "error": "aucun visage détecté"}

    con = sqlite3.connect(DB)
    for name_db, blob in con.execute("SELECT name, embedding FROM persons"):
        if float(np.dot(emb, np.frombuffer(blob, dtype=np.float32))) >= SEUIL_COSINUS:
            con.close()
            return {"ok": False,
                    "error": f"ce visage semble déjà enrôlé sous '{name_db}'"}
    try:
        con.execute("INSERT INTO persons (name, embedding) VALUES (?, ?)",
                    (name, emb.astype(np.float32).tobytes()))
        con.commit()
    except sqlite3.IntegrityError:
        return {"ok": False, "error": f"le nom '{name}' existe déjà"}
    finally:
        con.close()
    return {"ok": True, "name": name}


@app.post("/recognize")
async def recognize(file: UploadFile = None):
    """Reconnaissance depuis une image uploadée (webcam navigateur ou photo)."""
    return recognize_image(read_upload(await file.read()))


@app.post("/recognize_ip")
def recognize_ip(url: str = Form(...)):
    """Reconnaissance depuis une CAMÉRA RÉSEAU (IP) : le navigateur ne sait pas
    lire les flux RTSP, donc c'est le BACKEND qui capture une frame via OpenCV.
    `url` : rtsp://... ou http://.../video (dépend du modèle de caméra)."""
    cap = cv2.VideoCapture(url)
    ok, frame = cap.read()
    cap.release()
    if not ok or frame is None:
        return {"faces": [], "error": "impossible de lire le flux caméra (URL/format ?)"}
    return recognize_image(frame)


@app.get("/persons")
def persons_list():
    """Liste des personnes enrôlées (pour le tableau de bord)."""
    con = sqlite3.connect(DB)
    rows = con.execute("SELECT name FROM persons ORDER BY name").fetchall()
    con.close()
    return [r[0] for r in rows]


@app.get("/presences")
def presences():
    """Registre officiel du jour."""
    con = sqlite3.connect(DB)
    rows = con.execute(
        "SELECT name, timestamp FROM presences WHERE date = ? ORDER BY id DESC",
        (date.today().isoformat(),)).fetchall()
    con.close()
    return [{"name": n, "timestamp": t} for n, t in rows]


@app.get("/stats/daily")
def stats_daily(day: str = None):
    """Bilan d'une journée : présents (avec heure) ET absents.
    Absents = personnes enrôlées SANS ligne de présence ce jour-là —
    c'est la jointure mentale registre/annuaire faite en SQL simple."""
    day = day or date.today().isoformat()
    con = sqlite3.connect(DB)
    pres = con.execute(
        "SELECT name, timestamp FROM presences WHERE date = ? ORDER BY timestamp",
        (day,)).fetchall()
    everyone = [r[0] for r in con.execute("SELECT name FROM persons ORDER BY name")]
    con.close()
    present_names = {n for n, _ in pres}
    return {"date": day,
            "presents": [{"name": n, "timestamp": t} for n, t in pres],
            "absents": [n for n in everyone if n not in present_names],
            "total": len(everyone)}


@app.get("/stats/monthly")
def stats_monthly(month: str = None):
    """Bilan d'un mois (format YYYY-MM) : présences par jour + total par personne."""
    month = month or date.today().isoformat()[:7]
    con = sqlite3.connect(DB)
    by_day = con.execute(
        "SELECT date, COUNT(*) FROM presences WHERE date LIKE ? GROUP BY date ORDER BY date",
        (month + "%",)).fetchall()
    by_person = con.execute(
        "SELECT name, COUNT(*) FROM presences WHERE date LIKE ? GROUP BY name ORDER BY COUNT(*) DESC",
        (month + "%",)).fetchall()
    total_persons = con.execute("SELECT COUNT(*) FROM persons").fetchone()[0]
    con.close()
    return {"month": month, "total_persons": total_persons,
            "by_day": [{"date": d, "count": c} for d, c in by_day],
            "by_person": [{"name": n, "count": c} for n, c in by_person]}


@app.get("/export/daily")
def export_daily(day: str = None):
    """Export CSV du bilan quotidien (présents + absents).
    PlainTextResponse + en-tête Content-Disposition = le navigateur télécharge."""
    d = stats_daily(day)
    lines = ["name,status,timestamp"]
    lines += [f"{p['name']},present,{p['timestamp']}" for p in d["presents"]]
    lines += [f"{n},absent," for n in d["absents"]]
    return PlainTextResponse(
        "\n".join(lines), media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=presences_{d['date']}.csv"})


@app.get("/export/monthly")
def export_monthly(month: str = None):
    """Export CSV du bilan mensuel (jours de présence par personne)."""
    m = stats_monthly(month)
    lines = ["name,days_present"] + [f"{p['name']},{p['count']}" for p in m["by_person"]]
    return PlainTextResponse(
        "\n".join(lines), media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=presences_{m['month']}.csv"})


@app.get("/logs")
def logs():
    """Journal technique (100 dernières reconnaissances)."""
    con = sqlite3.connect(DB)
    rows = con.execute(
        "SELECT name, similarity, timestamp FROM logs ORDER BY id DESC LIMIT 100").fetchall()
    con.close()
    return [{"name": n, "similarity": s, "timestamp": t} for n, s, t in rows]


@app.delete("/person/{name}")
def delete_person(name: str):
    """Droit à l'effacement (RGPD) : personne + présences + logs."""
    con = sqlite3.connect(DB)
    n = con.execute("DELETE FROM persons WHERE name = ?", (name,)).rowcount
    con.execute("DELETE FROM presences WHERE name = ?", (name,))
    con.execute("DELETE FROM logs WHERE name = ?", (name,))
    con.commit()
    con.close()
    return {"ok": n > 0}


# Frontend React buildé, servi par FastAPI (même origine -> pas de CORS, hors ligne).
# DOIT rester la dernière déclaration.
app.mount("/", StaticFiles(directory="frontend/dist", html=True), name="static")
