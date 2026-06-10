import {
  AlertTriangle,
  Bot,
  Check,
  Clipboard,
  Download,
  FileText,
  HeartPulse,
  Loader2,
  Lock,
  MessageCircle,
  Pill,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import React from "react";
import { useEffect, useMemo, useRef, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
const STORAGE_KEY = "carelens.chat.sessions.v1";

const modes = [
  {
    id: "symptoms",
    label: "Symptoms",
    icon: Stethoscope,
    hint: "Safe triage-style conversation with follow-up questions.",
  },
  {
    id: "report",
    label: "Report",
    icon: FileText,
    hint: "Plain-language explanation of uploaded or pasted results.",
  },
  {
    id: "medicine",
    label: "Medicine",
    icon: Pill,
    hint: "General medicine info, precautions, and questions to ask.",
  },
  {
    id: "faq",
    label: "FAQ",
    icon: MessageCircle,
    hint: "Patient-friendly answers for everyday health questions.",
  },
];

const starters = {
  symptoms: [
    "I have fever and throat pain for two days. What should I watch for?",
    "What symptoms mean I should seek urgent care today?",
    "Help me prepare questions for my doctor visit.",
  ],
  report: [
    "Explain these CBC report values in simple words.",
    "Summarize this report and list what I should ask my doctor.",
    "Which values look high, low, or unclear?",
  ],
  medicine: [
    "What should I ask my doctor before taking ibuprofen?",
    "Explain common side effects of amoxicillin in simple language.",
    "What medication details should I confirm with a pharmacist?",
  ],
  faq: [
    "How can I describe my symptoms clearly to a doctor?",
    "What does follow-up care usually mean?",
    "How should I prepare for a lab test appointment?",
  ],
};

const welcomeMessage = {
  role: "assistant",
  content:
    "I can help explain symptoms, reports, and medicine information in simple language. I am for educational and preliminary support only, not a substitute for a qualified doctor.",
};

const clientRedFlags = [
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
];

function createSession(mode = "symptoms") {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: "New medical chat",
    mode,
    messages: [welcomeMessage],
    attachment: null,
    createdAt: now,
    updatedAt: now,
  };
}

function loadSessions() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
  return [createSession()];
}

function titleFromMessage(message) {
  const compact = message.replace(/\s+/g, " ").trim();
  if (!compact) return "New medical chat";
  return compact.length > 38 ? `${compact.slice(0, 38)}...` : compact;
}

function formatTime(value) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function detectClientRedFlags(text) {
  const lowered = text.toLowerCase();
  return clientRedFlags.filter((phrase) => lowered.includes(phrase));
}

function renderInline(text) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={`${part}-${index}`}>{part.slice(1, -1)}</code>;
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>;
    }
    return <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>;
  });
}

function MessageContent({ content, role }) {
  if (role !== "assistant") return <div>{content}</div>;

  const blocks = [];
  const lines = content.split(/\r?\n/);
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (trimmed.startsWith("```")) {
      const codeLines = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        codeLines.push(lines[index]);
        index += 1;
      }
      blocks.push({ type: "code", content: codeLines.join("\n") });
      index += 1;
      continue;
    }

    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, content: heading[2] });
      index += 1;
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^[-*]\s+/, ""));
        index += 1;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    if (/^\d+[.)]\s+/.test(trimmed)) {
      const items = [];
      while (index < lines.length && /^\d+[.)]\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+[.)]\s+/, ""));
        index += 1;
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    const paragraph = [trimmed];
    index += 1;
    while (
      index < lines.length &&
      lines[index].trim() &&
      !lines[index].trim().startsWith("```") &&
      !/^(#{1,3})\s+/.test(lines[index].trim()) &&
      !/^[-*]\s+/.test(lines[index].trim()) &&
      !/^\d+[.)]\s+/.test(lines[index].trim())
    ) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push({ type: "p", content: paragraph.join(" ") });
  }

  return (
    <div className="message-content">
      {blocks.map((block, blockIndex) => {
        if (block.type === "heading") {
          const HeadingTag = `h${Math.min(block.level + 2, 5)}`;
          return <HeadingTag key={blockIndex}>{renderInline(block.content)}</HeadingTag>;
        }
        if (block.type === "ul") {
          return (
            <ul key={blockIndex}>
              {block.items.map((item, itemIndex) => (
                <li key={`${blockIndex}-${itemIndex}`}>{renderInline(item)}</li>
              ))}
            </ul>
          );
        }
        if (block.type === "ol") {
          return (
            <ol key={blockIndex}>
              {block.items.map((item, itemIndex) => (
                <li key={`${blockIndex}-${itemIndex}`}>{renderInline(item)}</li>
              ))}
            </ol>
          );
        }
        if (block.type === "code") {
          return (
            <pre key={blockIndex}>
              <code>{block.content}</code>
            </pre>
          );
        }
        return <p key={blockIndex}>{renderInline(block.content)}</p>;
      })}
    </div>
  );
}

function App() {
  const [sessions, setSessions] = useState(loadSessions);
  const [activeId, setActiveId] = useState(() => sessions[0]?.id);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [copiedIndex, setCopiedIndex] = useState(null);
  const fileRef = useRef(null);
  const messagesRef = useRef(null);

  const activeSession = sessions.find((session) => session.id === activeId) || sessions[0];
  const mode = activeSession?.mode || "symptoms";
  const messages = activeSession?.messages || [welcomeMessage];
  const attachment = activeSession?.attachment || null;
  const currentMode = modes.find((item) => item.id === mode) || modes[0];

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    messagesRef.current?.scrollTo({
      top: messagesRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length, isSending, activeId]);

  const redFlagCount = useMemo(
    () => messages.reduce((sum, msg) => sum + (msg.redFlags?.length || 0), 0),
    [messages]
  );

  const transcriptCount = Math.max(0, messages.filter((msg) => msg.role === "user").length);

  function updateActiveSession(updater) {
    setSessions((current) =>
      current.map((session) =>
        session.id === activeSession.id
          ? { ...updater(session), updatedAt: new Date().toISOString() }
          : session
      )
    );
  }

  function setMode(nextMode) {
    updateActiveSession((session) => ({ ...session, mode: nextMode }));
  }

  function newChat(nextMode = mode) {
    const session = createSession(nextMode);
    setSessions((current) => [session, ...current]);
    setActiveId(session.id);
    setInput("");
    setError("");
  }

  function deleteSession(sessionId) {
    setSessions((current) => {
      if (current.length === 1) {
        const replacement = createSession();
        setActiveId(replacement.id);
        return [replacement];
      }
      const next = current.filter((session) => session.id !== sessionId);
      if (sessionId === activeId) setActiveId(next[0].id);
      return next;
    });
  }

  function clearChat() {
    updateActiveSession((session) => ({
      ...session,
      title: "New medical chat",
      messages: [welcomeMessage],
      attachment: null,
    }));
    setInput("");
    setError("");
  }

  function exportTranscript() {
    const lines = [
      "CareLens transcript",
      `Mode: ${currentMode.label}`,
      `Exported: ${new Date().toLocaleString()}`,
      "",
      ...messages.map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`),
    ];
    const blob = new Blob([lines.join("\n\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${activeSession.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-transcript.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function copyMessage(content, index) {
    await navigator.clipboard.writeText(content);
    setCopiedIndex(index);
    window.setTimeout(() => setCopiedIndex(null), 1200);
  }

  async function uploadFile(file) {
    if (!file) return;
    setError("");
    setUploading(true);
    const form = new FormData();
    form.append("file", file);

    try {
      const response = await fetch(`${API_URL}/upload`, { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Upload failed");
      updateActiveSession((session) => ({ ...session, attachment: data, mode: "report" }));
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function sendMessage(text = input) {
    const clean = text.trim();
    if (!clean || isSending) return;

    setError("");
    const userMessage = { role: "user", content: clean, redFlags: detectClientRedFlags(clean) };
    const nextMessages = [...messages, userMessage];
    const nextTitle = transcriptCount === 0 ? titleFromMessage(clean) : activeSession.title;

    updateActiveSession((session) => ({
      ...session,
      title: nextTitle,
      messages: nextMessages,
    }));
    setInput("");
    setIsSending(true);

    try {
      const history = nextMessages
        .slice(-9, -1)
        .filter((msg) => msg.role === "user" || msg.role === "assistant")
        .map(({ role, content }) => ({ role, content }));

      const response = await fetch(`${API_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: clean, mode, history, attachment }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Chat request failed");
      updateActiveSession((session) => ({
        ...session,
        messages: [
          ...session.messages,
          { role: "assistant", content: data.reply, redFlags: data.red_flags },
        ],
      }));
    } catch (err) {
      setError(err.message);
      updateActiveSession((session) => ({
        ...session,
        messages: [
          ...session.messages,
          {
            role: "assistant",
            content:
              "I could not reach the medical assistant service. Please check the backend and Groq API key, then try again.",
          },
        ],
      }));
    } finally {
      setIsSending(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="left-rail">
        <div className="brand">
          <div className="brand-mark">
            <HeartPulse size={28} />
          </div>
          <div>
            <h1>CareLens</h1>
            <p>AI medical assistant</p>
          </div>
        </div>

        <button className="new-chat-button" type="button" onClick={() => newChat()}>
          <Plus size={18} />
          <span>New chat</span>
        </button>

        <div className="safety-panel">
          <ShieldCheck size={22} />
          <div>
            <h2>Safety boundary</h2>
            <p>
              Educational support only. For emergencies, call local emergency services or go to the nearest emergency department.
            </p>
          </div>
        </div>

        <div className="mode-list" aria-label="Assistant modes">
          {modes.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={mode === item.id ? "mode-button active" : "mode-button"}
                key={item.id}
                onClick={() => setMode(item.id)}
                type="button"
                title={item.hint}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        <div className="session-stack">
          <div className="section-label">
            <span>Chats</span>
            <small>{sessions.length}</small>
          </div>
          <div className="session-list">
            {sessions.map((session) => (
              <button
                className={session.id === activeId ? "session-item active" : "session-item"}
                key={session.id}
                type="button"
                onClick={() => setActiveId(session.id)}
              >
                <span>{session.title}</span>
                <small>{formatTime(session.updatedAt)}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="metric-grid">
          <div>
            <span>{redFlagCount}</span>
            <p>red flags detected</p>
          </div>
          <div>
            <span>{attachment ? "1" : "0"}</span>
            <p>uploads attached</p>
          </div>
        </div>

        <div className="privacy-note">
          <Lock size={17} />
          <p>Do not upload names, phone numbers, addresses, IDs, or other personal identifiers.</p>
        </div>
      </section>

      <section className="chat-zone">
        <header className="chat-header">
          <div>
            <p className="eyebrow">Healthcare + Vision + Safety</p>
            <h2>{activeSession.title}</h2>
            <p className="mode-hint">{currentMode.hint}</p>
          </div>
          <div className="header-actions">
            <button className="icon-action" type="button" onClick={exportTranscript} title="Export transcript">
              <Download size={18} />
            </button>
            <button className="icon-action" type="button" onClick={clearChat} title="Clear current chat">
              <RefreshCw size={18} />
            </button>
            <button
              className="icon-action danger"
              type="button"
              onClick={() => deleteSession(activeSession.id)}
              title="Delete chat"
            >
              <Trash2 size={18} />
            </button>
            <button className="upload-button" type="button" onClick={() => fileRef.current?.click()}>
              {uploading ? <Loader2 className="spin" size={18} /> : <Upload size={18} />}
              <span>{uploading ? "Reading" : "Upload"}</span>
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.txt,.csv,.md,image/*"
            hidden
            onChange={(event) => uploadFile(event.target.files?.[0])}
          />
        </header>

        <div className="status-strip">
          <div>
            <Sparkles size={16} />
            <span>{currentMode.label} mode</span>
          </div>
          <div>
            <MessageCircle size={16} />
            <span>{transcriptCount} user messages</span>
          </div>
          <div>
            <AlertTriangle size={16} />
            <span>{redFlagCount} red flags</span>
          </div>
        </div>

        {attachment && (
          <div className="attachment-strip">
            <FileText size={18} />
            <span>{attachment.name}</span>
            <small>{attachment.notice || "Report text extracted and ready to explain."}</small>
            <button
              type="button"
              onClick={() => updateActiveSession((session) => ({ ...session, attachment: null }))}
              title="Remove upload"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {error && (
          <div className="error-banner">
            <AlertTriangle size={18} />
            <span>{error}</span>
          </div>
        )}

        <div className="messages" aria-live="polite" ref={messagesRef}>
          {messages.map((msg, index) => (
            <article className={`message ${msg.role}`} key={`${activeId}-${msg.role}-${index}`}>
              <div className="avatar">{msg.role === "assistant" ? <Bot size={18} /> : "You"}</div>
              <div className="bubble">
                {msg.redFlags?.length > 0 && (
                  <div className="red-flag">
                    <AlertTriangle size={16} />
                    Emergency warning terms detected: {msg.redFlags.join(", ")}
                  </div>
                )}
                <MessageContent content={msg.content} role={msg.role} />
                {msg.role === "assistant" && (
                  <button
                    className="copy-button"
                    type="button"
                    onClick={() => copyMessage(msg.content, index)}
                    title="Copy answer"
                  >
                    {copiedIndex === index ? <Check size={14} /> : <Clipboard size={14} />}
                    <span>{copiedIndex === index ? "Copied" : "Copy"}</span>
                  </button>
                )}
              </div>
            </article>
          ))}
          {isSending && (
            <article className="message assistant">
              <div className="avatar">
                <Bot size={18} />
              </div>
              <div className="bubble thinking">
                <Loader2 className="spin" size={18} />
                Thinking carefully...
              </div>
            </article>
          )}
        </div>

        <div className="starter-row">
          {starters[mode].map((starter) => (
            <button key={starter} type="button" onClick={() => sendMessage(starter)}>
              {starter}
            </button>
          ))}
        </div>

        <form
          className="composer"
          onSubmit={(event) => {
            event.preventDefault();
            sendMessage();
          }}
        >
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onInput={(event) => setInput(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Ask about symptoms, upload a report, or ask a medicine question..."
            rows={2}
          />
          <button type="submit" disabled={isSending || !input.trim()} title="Send message">
            {isSending ? <Loader2 className="spin" size={20} /> : <Send size={20} />}
          </button>
        </form>
      </section>
    </main>
  );
}

export default App;
