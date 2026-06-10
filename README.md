# MedAssist AI - Medical Assistant App

A React + FastAPI medical assistant for educational/preliminary support. It uses Groq's OpenAI-compatible API with `openai/gpt-oss-120b` by default.

## Features

- Dashboard with totals for chats, medicine searches, reports, and emergency alerts
- Sidebar navigation for Dashboard, AI Chat, Medicines, Reports, History, and Settings
- Safe symptom chat with emergency red-flag detection
- Report analyzer for PDF, TXT, CSV, and Markdown uploads plus pasted lab values
- Medicine lookup with common-use, side-effect, precaution, and pharmacist-question guidance
- Local browser history for chats, reports, medicine searches, and user settings
- Dark mode, compact mode, copy answers, export results, and press Enter to send messages
- No login required

## API Routes

- `GET /health`
- `POST /chat`
- `POST /upload`
- `POST /reports/analyze`
- `POST /medicines/lookup`

## Run Locally

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env and set GROQ_API_KEY
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

## Safety Note

This app is for educational and preliminary support only. It does not provide diagnosis, emergency care, or prescriptions. For urgent symptoms, contact local emergency services or a qualified medical professional.
