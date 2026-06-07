**Terminal 1**

Masuk ke folder backend:
cd backend-face

Aktifkan venv:
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1

Run Backend:
uvicorn main:api --reload --host 127.0.0.1 --port 8000

**Terminal 2**
Tetap di root project (biogate-updated)

Run Frontend:
npm run dev