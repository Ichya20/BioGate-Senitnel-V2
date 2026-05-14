import json
from pathlib import Path
from typing import Annotated, List, Optional

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from insightface.app import FaceAnalysis


api = FastAPI(title="BioGate Sentinel Face API")

api.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_PATH = Path("face_db.json")
FACE_THRESHOLD = 0.65

face_app = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
face_app.prepare(ctx_id=0, det_size=(640, 640))


def load_db() -> List[dict]:
    if not DB_PATH.exists():
        return []

    content = DB_PATH.read_text(encoding="utf-8").strip()

    if content == "":
        return []

    try:
        return json.loads(content)
    except json.JSONDecodeError:
        return []


def save_db(data: List[dict]) -> None:
    DB_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")


def read_image(file_bytes: bytes) -> np.ndarray:
    arr = np.frombuffer(file_bytes, np.uint8)
    image = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("File bukan gambar valid.")
    return image


def get_face_embedding(image: np.ndarray) -> np.ndarray:
    faces = face_app.get(image)

    if len(faces) == 0:
        raise ValueError("Tidak ada wajah terdeteksi.")

    if len(faces) > 1:
        raise ValueError("Terdeteksi lebih dari satu wajah. Gunakan foto satu orang saja.")

    embedding = faces[0].normed_embedding
    return embedding.astype(float)


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.dot(a, b))


@api.get("/api/health")
def health():
    return {"status": "ok", "service": "BioGate Sentinel Face API"}


@api.get("/api/users")
def users():
    db = load_db()
    return [
        {
            "user_id": item["user_id"],
            "name": item["name"],
            "samples": item.get("samples", 1),
        }
        for item in db
    ]
    
@api.post("/api/face/enroll-single")
async def enroll_single_face(
    user_id: str = Form(...),
    name: str = Form(...),
    file1: UploadFile = File(...),
):
    try:
        image = read_image(await file1.read())
        embedding = get_face_embedding(image)

        db = load_db()
        db = [item for item in db if item["user_id"] != user_id]

        db.append(
            {
                "user_id": user_id,
                "name": name,
                "embedding": embedding.tolist(),
                "samples": 1,
            }
        )

        save_db(db)

        return {
            "status": "ENROLLED",
            "user_id": user_id,
            "name": name,
            "samples": 1,
        }

    except Exception as e:
        return {
            "status": "FAILED",
            "message": str(e),
        }

@api.post("/api/face/enroll-multiple")
async def enroll_multiple_face(
    user_id: str = Form(...),
    name: str = Form(...),
    file1: UploadFile = File(...),
    file2: UploadFile = File(None),
    file3: UploadFile = File(None),
    file4: UploadFile = File(None),
    file5: UploadFile = File(None),
):
    try:
        raw_files = [file1, file2, file3, file4, file5]

        files = []
        for f in raw_files:
            if f is None:
                continue
            if not hasattr(f, "filename"):
                continue
            if f.filename is None or f.filename == "":
                continue
            files.append(f)

        if len(files) == 0:
            return {
                "status": "FAILED",
                "message": "Minimal upload 1 foto wajah."
            }

        embeddings = []

        for file in files:
            image_bytes = await file.read()
            image = read_image(image_bytes)
            embedding = get_face_embedding(image)
            embeddings.append(embedding)

        avg_embedding = np.mean(embeddings, axis=0)
        avg_embedding = avg_embedding / np.linalg.norm(avg_embedding)

        db = load_db()
        db = [item for item in db if item["user_id"] != user_id]

        db.append(
            {
                "user_id": user_id,
                "name": name,
                "embedding": avg_embedding.tolist(),
                "samples": len(embeddings),
            }
        )

        save_db(db)

        return {
            "status": "ENROLLED",
            "user_id": user_id,
            "name": name,
            "samples": len(embeddings),
        }

    except Exception as e:
        return {
            "status": "FAILED",
            "message": str(e),
        }

@api.post("/api/face/enroll")
async def enroll_face(
    user_id: Annotated[str, Form()],
    name: Annotated[str, Form()],
    files: Annotated[List[UploadFile], File(description="Upload 1 sampai 5 foto wajah user")],
):
    embeddings = []

    for file in files:
        try:
            image = read_image(await file.read())
            embedding = get_face_embedding(image)
            embeddings.append(embedding)
        except Exception as e:
            return {
                "status": "FAILED",
                "message": f"Gagal proses {file.filename}: {str(e)}",
            }

    if len(embeddings) == 0:
        return {"status": "FAILED", "message": "Tidak ada embedding yang berhasil dibuat."}

    avg_embedding = np.mean(embeddings, axis=0)
    avg_embedding = avg_embedding / np.linalg.norm(avg_embedding)

    db = load_db()
    db = [item for item in db if item["user_id"] != user_id]

    db.append(
        {
            "user_id": user_id,
            "name": name,
            "embedding": avg_embedding.tolist(),
            "samples": len(embeddings),
        }
    )

    save_db(db)

    return {
        "status": "ENROLLED",
        "user_id": user_id,
        "name": name,
        "samples": len(embeddings),
    }


@api.post("/api/face/verify")
async def verify_face(file: UploadFile = File(...)):
    db = load_db()

    if len(db) == 0:
        return {
            "status": "ACCESS_DENIED",
            "reason": "EMPTY_DATABASE",
            "duress_alarm": True,
            "score": 0,
            "user": None,
        }

    try:
        image = read_image(await file.read())
        scan_embedding = get_face_embedding(image)
    except Exception as e:
        return {
            "status": "ACCESS_DENIED",
            "reason": str(e),
            "duress_alarm": True,
            "score": 0,
            "user": None,
        }

    best_user: Optional[dict] = None
    best_score = -1.0

    for user in db:
        saved_embedding = np.array(user["embedding"], dtype=float)
        score = cosine_similarity(scan_embedding, saved_embedding)

        if score > best_score:
            best_score = score
            best_user = user

    if best_score >= FACE_THRESHOLD:
        return {
            "status": "MATCH",
            "reason": "FACE_VERIFIED",
            "duress_alarm": False,
            "score": round(best_score, 4),
            "confidence": round(best_score * 100, 2),
            "user": {
                "user_id": best_user["user_id"],
                "name": best_user["name"],
            },
        }

    return {
        "status": "ACCESS_DENIED",
        "reason": "UNKNOWN_FACE",
        "duress_alarm": True,
        "score": round(best_score, 4),
        "confidence": round(best_score * 100, 2),
        "user": None,
    }