# BioGate Sentinel 2.0

BioGate Sentinel 2.0 is a web-based biometric authentication prototype that combines **Face Recognition**, **Voice Biometric Verification**, and **Secure Vault Access**. The system works as a multi-factor security gateway where users must pass facial recognition, passphrase validation, and voice biometric verification before accessing the protected vault.

## Features

- Real-time face recognition
- Voice biometric verification
- Passphrase-based voice authentication
- Secure vault access
- Duress protocol for emergency conditions
- Access event logging
- Cybersecurity-style interface
- Separate backend API for face and voice processing

## Tech Stack

**Frontend:** React, TypeScript, Vite, Tailwind CSS, Motion React, Lucide React  
**Backend:** Python, FastAPI, Uvicorn, InsightFace, OpenCV, Resemblyzer, FFmpeg  
**Server:** Node.js, Express

## Project Structure

```text
BioGate-Sentinel/
├── backend-face/
│   ├── main.py
│   ├── enroll_voice.py
│   ├── verify_voice.py
│   ├── requirements.txt
│   ├── voice_samples_wav/      # ignored
│   ├── voice_embeddings/       # ignored
│   └── face_db.json            # ignored
│
├── src/
│   ├── components/
│   │   ├── ScannerUI.tsx
│   │   └── SecretVault.tsx
│   ├── services/
│   │   ├── faceApi.ts
│   │   └── voiceApi.ts
│   ├── App.tsx
│   └── main.tsx
│
├── server.ts
├── package.json
├── vite.config.ts
└── README.md
```

## Authentication Flow

1. The user starts the BioGate Sentinel scanner.
2. The system scans and verifies the user's face.
3. If the face is recognized, the user continues to voice authentication.
4. The user speaks the assigned passphrase.
5. The browser records the voice input.
6. The backend converts the audio and verifies the voice biometric.
7. If face, passphrase, and voice match, access is granted.
8. The user is redirected to the secure vault.

## Registered Users

| ID | Name | Role | Passphrase |
|---|---|---|---|
| 1 | Ichya Ulumiddiin | System Lead | IZIN MASUK |
| 2 | Abid Fadhilah Mustofa | Security Architect | AKSES KEAMANAN |
| 3 | Iklil Bahy Sabaiki | Network Specialist | JARINGAN NETWORK |
| 4 | Nathan Domuli Pasaribu | DB Specialist | DATA DATABASE |
| 5 | Nashir Khoirul Huda | Protocol Analyst | PROTOKOL ANALISIS |
| 6 | Arif Kurniawan | UI/UX Specialist | TAMPILAN SISTEM |

## Installation

Clone the repository:

```bash
git clone https://github.com/Ichya20/BioGate-Senitnel-V2.git
cd BioGate-Senitnel-V2
```

Install frontend dependencies:

```bash
npm install
```

Install backend dependencies:

```bash
cd backend-face
pip install -r requirements.txt
```

## Run the Backend

From the `backend-face` directory:

```bash
python -m uvicorn main:api --host 127.0.0.1 --port 8000 --reload
```

Health check:

```text
http://127.0.0.1:8000/api/health
```

## Run the Frontend

Open a new terminal in the project root:

```bash
npm run dev
```

Open the app:

```text
http://localhost:3000
```

## Voice Enrollment

Place user voice samples in:

```text
backend-face/voice_samples_wav/
```

Example:

```text
voice_samples_wav/
├── ichya/
├── abid/
├── iklil/
├── nathan/
├── nashir/
└── arif/
```

Generate voice embeddings:

```bash
cd backend-face
python enroll_voice.py
```

The generated embeddings will be stored in:

```text
backend-face/voice_embeddings/
```

## Security Notes

The following files and folders are ignored from Git because they contain sensitive biometric data:

```text
backend-face/voice_samples_wav/
backend-face/voice_embeddings/
backend-face/face_db.json
```

Do not upload raw biometric samples or embedding files to a public repository.

## Common Commands

```bash
# Run frontend
npm run dev

# Build project
npm run build

# Check TypeScript
npm run lint

# Run backend
cd backend-face
python -m uvicorn main:api --host 127.0.0.1 --port 8000 --reload

# Generate voice embeddings
cd backend-face
python enroll_voice.py
```

## Project Status

This project is currently a prototype and can be improved with database-based user management, encrypted biometric storage, an admin dashboard, persistent audit logs, cloud deployment, and hardware access gate integration.

## Author

**Ichya Ulumiddiin**  
Informatics Engineering  
Telkom University Purwokerto
