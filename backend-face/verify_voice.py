from pathlib import Path
import numpy as np
from resemblyzer import VoiceEncoder, preprocess_wav

BASE_DIR = Path(__file__).resolve().parent
EMBEDDINGS_DIR = BASE_DIR / "voice_embeddings"

encoder = VoiceEncoder()

def cosine_similarity(a, b):
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))

def verify_voice(audio_path: str, expected_user: str, threshold: float = 0.75):
    audio_path = Path(audio_path)
    embedding_path = EMBEDDINGS_DIR / f"{expected_user}.npy"

    if not embedding_path.exists():
        return {
            "status": "FAILED",
            "reason": f"Embedding untuk user {expected_user} tidak ditemukan",
            "score": 0.0,
            "match": False
        }

    registered_embedding = np.load(embedding_path)

    wav = preprocess_wav(audio_path)
    current_embedding = encoder.embed_utterance(wav)

    score = cosine_similarity(current_embedding, registered_embedding)
    match = score >= threshold

    return {
        "status": "MATCH" if match else "ACCESS_DENIED",
        "user": expected_user,
        "score": round(score, 4),
        "threshold": threshold,
        "match": match
    }