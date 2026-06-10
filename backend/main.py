import base64
import os
from typing import Any

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

try:
    from pypdf import PdfReader
except Exception:  # pragma: no cover - optional import guard for local envs
    PdfReader = None


load_dotenv()

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
MAX_UPLOAD_CHARS = 18_000

SYSTEM_PROMPT = """
You are CareLens, a responsible medical assistant for educational and preliminary support only.
You are not a substitute for a qualified doctor, diagnosis, emergency service, or prescription.

Safety rules:
- Use simple, patient-friendly language.
- Start with a short safety note when answering health questions.
- Detect emergency red flags and clearly advise urgent care/emergency services when present.
- Be honest about uncertainty and do not overclaim.
- Do not provide a definitive diagnosis. Offer possibilities and next steps to discuss with a clinician.
- Do not invent report values or image findings. If data is unclear, say so.
- For medication questions, explain general information, common precautions, and tell the user to follow their clinician/pharmacist.
- Preserve privacy: remind users not to upload names, phone numbers, IDs, addresses, or other identifiers.
""".strip()

RED_FLAG_KEYWORDS = [
    "chest pain",
    "shortness of breath",
    "difficulty breathing",
    "stroke",
    "face drooping",
    "slurred speech",
    "severe bleeding",
    "unconscious",
    "seizure",
    "suicide",
    "self harm",
    "overdose",
    "anaphylaxis",
    "severe allergic",
    "blue lips",
    "worst headache",
    "stiff neck",
    "pregnant bleeding",
]


class Message(BaseModel):
    role: str = Field(pattern="^(user|assistant)$")
    content: str


class ChatRequest(BaseModel):
    message: str
    mode: str = "symptoms"
    history: list[Message] = []
    attachment: dict[str, Any] | None = None


class ChatResponse(BaseModel):
    reply: str
    red_flags: list[str]
    model: str


app = FastAPI(title="CareLens Medical Assistant API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def detect_red_flags(text: str) -> list[str]:
    lowered = text.lower()
    return [phrase for phrase in RED_FLAG_KEYWORDS if phrase in lowered]


def build_context(request: ChatRequest, red_flags: list[str]) -> str:
    mode_hint = {
        "symptoms": "Have a safe symptom conversation. Ask focused follow-up questions only when needed.",
        "report": "Explain medical report data in plain language. Highlight what is high, low, or unclear without diagnosing.",
        "medicine": "Give general medicine information, precautions, interactions to ask about, and safe next steps.",
        "faq": "Answer patient FAQs in simple language with practical next steps.",
    }.get(request.mode, "Answer safely and clearly.")

    parts = [
        f"Mode: {request.mode}",
        f"Task guidance: {mode_hint}",
    ]

    if red_flags:
        parts.append(
            "Potential red-flag terms were detected in the user's message: "
            + ", ".join(red_flags)
            + ". If clinically relevant, prioritize urgent-care guidance."
        )

    if request.attachment:
        attachment = request.attachment
        parts.append(
            "Uploaded file context:\n"
            f"Name: {attachment.get('name', 'unknown')}\n"
            f"Type: {attachment.get('type', 'unknown')}\n"
            f"Extracted text or notes:\n{attachment.get('text', '')[:MAX_UPLOAD_CHARS]}"
        )

    parts.append(f"User message:\n{request.message}")
    return "\n\n".join(parts)


async def call_groq(messages: list[dict[str, str]]) -> str:
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="GROQ_API_KEY is not set. Add it to the backend environment before chatting.",
        )

    payload = {
        "model": GROQ_MODEL,
        "messages": messages,
        "temperature": 0.25,
        "max_tokens": 900,
    }
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}

    async with httpx.AsyncClient(timeout=45) as client:
        response = await client.post(GROQ_API_URL, headers=headers, json=payload)

    if response.status_code >= 400:
        raise HTTPException(status_code=response.status_code, detail=response.text)

    data = response.json()
    return data["choices"][0]["message"]["content"]


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "model": GROQ_MODEL}


@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    combined = request.message
    if request.attachment:
        combined += "\n" + str(request.attachment.get("text", ""))
    red_flags = detect_red_flags(combined)

    history = [
        {"role": msg.role, "content": msg.content}
        for msg in request.history[-8:]
        if msg.content.strip()
    ]
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        *history,
        {"role": "user", "content": build_context(request, red_flags)},
    ]

    reply = await call_groq(messages)
    return ChatResponse(reply=reply, red_flags=red_flags, model=GROQ_MODEL)


@app.post("/upload")
async def upload(file: UploadFile = File(...)) -> dict[str, Any]:
    raw = await file.read()
    if len(raw) > 8 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Please upload a file under 8 MB.")

    content_type = file.content_type or "application/octet-stream"
    text = ""
    notice = ""

    if content_type == "application/pdf" or file.filename.lower().endswith(".pdf"):
        if PdfReader is None:
            raise HTTPException(status_code=500, detail="PDF support is not installed.")
        import io

        reader = PdfReader(io.BytesIO(raw))
        text = "\n".join(page.extract_text() or "" for page in reader.pages)
    elif content_type.startswith("text/") or file.filename.lower().endswith((".txt", ".csv", ".md")):
        text = raw.decode("utf-8", errors="ignore")
    elif content_type.startswith("image/"):
        encoded = base64.b64encode(raw[:120]).decode("ascii")
        text = (
            "An image was uploaded. This model is configured for text reasoning, so it cannot make reliable "
            "medical-image findings from pixels. The user should describe visible text/findings or upload a "
            "written radiology/pathology report for explanation."
        )
        notice = f"Image received ({content_type}). Preview signature: {encoded[:32]}..."
    else:
        text = raw.decode("utf-8", errors="ignore")
        if not text.strip():
            raise HTTPException(status_code=415, detail="Unsupported file type. Use PDF, text, CSV, or an image.")

    return {
        "name": file.filename,
        "type": content_type,
        "text": text[:MAX_UPLOAD_CHARS],
        "notice": notice,
    }
