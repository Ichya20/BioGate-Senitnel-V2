from pathlib import Path
import numpy as np
from resemblyzer import VoiceEncoder, preprocess_wav

BASE_DIR = Path(__file__).resolve().parent
SAMPLES_DIR = BASE_DIR / "voice_samples_wav"
EMBEDDINGS_DIR = BASE_DIR / "voice_embeddings"

EMBEDDINGS_DIR.mkdir(exist_ok=True)

encoder = VoiceEncoder()

def enroll_user(user_dir: Path):
    wav_files = sorted(user_dir.glob("*.wav"))

    if not wav_files:
        print(f"[SKIP] Tidak ada file wav di {user_dir.name}")
        return

    embeddings = []

    for wav_path in wav_files:
        try:
            wav = preprocess_wav(wav_path)
            embed = encoder.embed_utterance(wav)
            embeddings.append(embed)
            print(f"[OK] {user_dir.name} -> {wav_path.name}")
        except Exception as e:
            print(f"[ERROR] {wav_path.name}: {e}")

    if not embeddings:
        print(f"[FAILED] Tidak ada embedding valid untuk {user_dir.name}")
        return

    mean_embedding = np.mean(embeddings, axis=0)
    mean_embedding = mean_embedding / np.linalg.norm(mean_embedding)

    output_path = EMBEDDINGS_DIR / f"{user_dir.name}.npy"
    np.save(output_path, mean_embedding)

    print(f"[SAVED] {output_path}")

def main():
    if not SAMPLES_DIR.exists():
        print(f"[ERROR] Folder tidak ditemukan: {SAMPLES_DIR}")
        return

    for user_dir in sorted(SAMPLES_DIR.iterdir()):
        if user_dir.is_dir():
            enroll_user(user_dir)

if __name__ == "__main__":
    main()