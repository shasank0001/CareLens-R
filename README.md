# CareLens - AI Medical Assistant Bot

A simple React + FastAPI medical assistant for educational/preliminary support. It uses Groq's OpenAI-compatible API with `openai/gpt-oss-120b` by default.

## Features

- Safe symptom chat with emergency red-flag detection
- Report explainer for PDF, TXT, CSV, and Markdown uploads
- Medical image upload awareness with clear limitations for the text-only model
- Medicine information and patient FAQ modes
- Privacy notice for uploaded medical data
- Local browser chat sessions with New Chat, session switching, clear, delete, and transcript export
- Copy answers and press Enter to send messages
- No login required

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
