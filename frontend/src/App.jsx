import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Check,
  Clipboard,
  Download,
  FileText,
  Grid2X2,
  HeartPulse,
  History,
  Loader2,
  LogOut,
  MessageSquareText,
  Moon,
  Pill,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  ShieldAlert,
  Stethoscope,
  Sun,
  Trash2,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
const CHAT_KEY = "medassist.chat.sessions.v2";
const REPORT_KEY = "medassist.reports.v2";
const MEDICINE_KEY = "medassist.medicines.v2";
const SETTINGS_KEY = "medassist.settings.v2";

const welcomeMessage = {
  role: "assistant",
  content:
    "Hi, I am MedAssist AI. Ask about symptoms, medicines, or reports for educational guidance. I cannot diagnose or replace a qualified clinician.",
};

const starters = [
  "I have fever and throat pain for two days. What should I watch for?",
  "What symptoms mean I should seek urgent care today?",
  "Explain fasting glucose and LDL values in simple words.",
];

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

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: Grid2X2 },
  { id: "chat", label: "AI Chat", icon: MessageSquareText },
  { id: "medicines", label: "Medicines", icon: Pill },
  { id: "reports", label: "Reports", icon: FileText },
  { id: "history", label: "History", icon: History },
  { id: "settings", label: "Settings", icon: Settings },
];

function createSession() {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: "New medical chat",
    messages: [welcomeMessage],
    createdAt: now,
    updatedAt: now,
  };
}

function readStorage(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value ?? fallback;
  } catch {
    localStorage.removeItem(key);
    return fallback;
  }
}

function titleFromMessage(message) {
  const compact = message.replace(/\s+/g, " ").trim();
  if (!compact) return "New medical chat";
  return compact.length > 42 ? `${compact.slice(0, 42)}...` : compact;
}

function formatRelative(value) {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.round(diff / 60000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
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
  const lines = content.split(/\r?\n/);
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const trimmed = lines[index].trim();
    if (!trimmed) {
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
        return <p key={blockIndex}>{renderInline(block.content)}</p>;
      })}
    </div>
  );
}

function App() {
  const [page, setPage] = useState("dashboard");
  const [sessions, setSessions] = useState(() => readStorage(CHAT_KEY, [createSession()]));
  const [activeId, setActiveId] = useState(() => sessions[0]?.id);
  const [reports, setReports] = useState(() => readStorage(REPORT_KEY, []));
  const [medicineSearches, setMedicineSearches] = useState(() => readStorage(MEDICINE_KEY, []));
  const [settings, setSettings] = useState(() =>
    readStorage(SETTINGS_KEY, {
      name: "ROHIT MUNDURU",
      email: "mundururohit2@gmail.com",
      darkMode: false,
      compactMode: false,
    })
  );
  const [chatInput, setChatInput] = useState("");
  const [reportName, setReportName] = useState("Lab report");
  const [reportText, setReportText] = useState("");
  const [medicineQuery, setMedicineQuery] = useState("");
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [copiedIndex, setCopiedIndex] = useState(null);
  const fileRef = useRef(null);
  const messagesRef = useRef(null);

  const activeSession = sessions.find((session) => session.id === activeId) || sessions[0];
  const messages = activeSession?.messages || [welcomeMessage];
  const userMessages = messages.filter((msg) => msg.role === "user").length;
  const emergencyCount = sessions.reduce(
    (total, session) => total + session.messages.reduce((sum, msg) => sum + (msg.redFlags?.length || 0), 0),
    0
  );

  const historyItems = useMemo(() => {
    const chats = sessions.map((session) => ({
      id: `chat-${session.id}`,
      type: "Chat",
      title: session.title,
      date: session.updatedAt,
    }));
    const reportItems = reports.map((report) => ({
      id: `report-${report.id}`,
      type: "Report",
      title: report.name,
      date: report.createdAt,
    }));
    const medicineItems = medicineSearches.map((medicine) => ({
      id: `medicine-${medicine.id}`,
      type: "Medicine",
      title: medicine.query,
      date: medicine.createdAt,
    }));
    return [...chats, ...reportItems, ...medicineItems].sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [sessions, reports, medicineSearches]);

  useEffect(() => localStorage.setItem(CHAT_KEY, JSON.stringify(sessions)), [sessions]);
  useEffect(() => localStorage.setItem(REPORT_KEY, JSON.stringify(reports)), [reports]);
  useEffect(() => localStorage.setItem(MEDICINE_KEY, JSON.stringify(medicineSearches)), [medicineSearches]);
  useEffect(() => localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)), [settings]);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.darkMode ? "dark" : "light";
    document.documentElement.dataset.compact = settings.compactMode ? "true" : "false";
  }, [settings.darkMode, settings.compactMode]);

  useEffect(() => {
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, loading, activeId, page]);

  function updateActiveSession(updater) {
    setSessions((current) =>
      current.map((session) =>
        session.id === activeSession.id
          ? { ...updater(session), updatedAt: new Date().toISOString() }
          : session
      )
    );
  }

  function newChat() {
    const session = createSession();
    setSessions((current) => [session, ...current]);
    setActiveId(session.id);
    setChatInput("");
    setPage("chat");
    setError("");
  }

  async function sendMessage(text = chatInput) {
    const clean = text.trim();
    if (!clean || loading) return;
    setError("");
    const userMessage = { role: "user", content: clean, redFlags: detectClientRedFlags(clean) };
    const nextTitle = userMessages === 0 ? titleFromMessage(clean) : activeSession.title;

    updateActiveSession((session) => ({
      ...session,
      title: nextTitle,
      messages: [...session.messages, userMessage],
    }));
    setChatInput("");
    setLoading("chat");

    try {
      const history = messages
        .slice(-8)
        .filter((msg) => msg.role === "user" || msg.role === "assistant")
        .map(({ role, content }) => ({ role, content }));
      const response = await fetch(`${API_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: clean, mode: "symptoms", history }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Chat request failed");
      updateActiveSession((session) => ({
        ...session,
        messages: [...session.messages, { role: "assistant", content: data.reply, redFlags: data.red_flags }],
      }));
    } catch (err) {
      setError(err.message);
      updateActiveSession((session) => ({
        ...session,
        messages: [
          ...session.messages,
          {
            role: "assistant",
            content: "I could not reach the assistant service. Check the backend and API key, then try again.",
          },
        ],
      }));
    } finally {
      setLoading("");
    }
  }

  async function uploadFile(file) {
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    setLoading("upload");
    setError("");
    try {
      const response = await fetch(`${API_URL}/upload`, { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Upload failed");
      setReportName(data.name || "Uploaded report");
      setReportText(data.text || "");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading("");
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function analyzeReport() {
    const text = reportText.trim();
    if (!text || loading) return;
    setLoading("report");
    setError("");
    try {
      const response = await fetch(`${API_URL}/reports/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: reportName || "Lab report", text }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Report analysis failed");
      const item = {
        id: crypto.randomUUID(),
        name: reportName || "Lab report",
        text,
        result: data.reply,
        redFlags: data.red_flags || [],
        createdAt: new Date().toISOString(),
      };
      setReports((current) => [item, ...current]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading("");
    }
  }

  async function lookupMedicine(query = medicineQuery) {
    const clean = query.trim();
    if (!clean || loading) return;
    setLoading("medicine");
    setError("");
    try {
      const response = await fetch(`${API_URL}/medicines/lookup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: clean }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Medicine lookup failed");
      setMedicineSearches((current) => [
        { id: crypto.randomUUID(), query: clean, result: data.reply, createdAt: new Date().toISOString() },
        ...current,
      ]);
      setMedicineQuery("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading("");
    }
  }

  function exportItem(title, body) {
    const blob = new Blob([body], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function copyMessage(content, index) {
    await navigator.clipboard.writeText(content);
    setCopiedIndex(index);
    window.setTimeout(() => setCopiedIndex(null), 1200);
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <HeartPulse size={23} />
          </div>
          <div>
            <strong>MedAssist AI</strong>
            <span>Educational use</span>
          </div>
        </div>

        <nav className="nav-list" aria-label="Primary navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={page === item.id ? "nav-item active" : "nav-item"}
                key={item.id}
                type="button"
                onClick={() => setPage(item.id)}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="account-panel">
          <div className="email-chip">{settings.email}</div>
          <button className="sign-out" type="button">
            <LogOut size={17} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      <section className="main-panel">
        <header className="topbar">
          <h1>{navItems.find((item) => item.id === page)?.label || "Dashboard"}</h1>
          <button
            className="theme-button"
            type="button"
            onClick={() => setSettings((current) => ({ ...current, darkMode: !current.darkMode }))}
            title="Toggle theme"
          >
            {settings.darkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </header>

        <div className="content">
          {error && (
            <div className="error-banner">
              <AlertTriangle size={18} />
              <span>{error}</span>
              <button type="button" onClick={() => setError("")} title="Dismiss">
                <X size={16} />
              </button>
            </div>
          )}
          {page === "dashboard" && (
            <Dashboard
              settings={settings}
              sessions={sessions}
              reports={reports}
              medicineSearches={medicineSearches}
              emergencyCount={emergencyCount}
              onStartChat={newChat}
              onOpenReports={() => setPage("reports")}
              onOpenMedicines={() => setPage("medicines")}
            />
          )}
          {page === "chat" && (
            <ChatPage
              messages={messages}
              messagesRef={messagesRef}
              input={chatInput}
              setInput={setChatInput}
              loading={loading}
              sendMessage={sendMessage}
              starters={starters}
              copiedIndex={copiedIndex}
              copyMessage={copyMessage}
              newChat={newChat}
              clearChat={() =>
                updateActiveSession((session) => ({
                  ...session,
                  title: "New medical chat",
                  messages: [welcomeMessage],
                }))
              }
            />
          )}
          {page === "medicines" && (
            <MedicinesPage
              query={medicineQuery}
              setQuery={setMedicineQuery}
              searches={medicineSearches}
              loading={loading}
              lookup={lookupMedicine}
              exportItem={exportItem}
            />
          )}
          {page === "reports" && (
            <ReportsPage
              reportName={reportName}
              setReportName={setReportName}
              reportText={reportText}
              setReportText={setReportText}
              fileRef={fileRef}
              uploadFile={uploadFile}
              reports={reports}
              loading={loading}
              analyzeReport={analyzeReport}
              exportItem={exportItem}
            />
          )}
          {page === "history" && <HistoryPage items={historyItems} />}
          {page === "settings" && <SettingsPage settings={settings} setSettings={setSettings} />}
        </div>
      </section>
    </main>
  );
}

function Dashboard({ settings, sessions, reports, medicineSearches, emergencyCount, onStartChat, onOpenReports, onOpenMedicines }) {
  return (
    <div className="dashboard page-stack">
      <section className="welcome">
        <p>Welcome back</p>
        <h2>Hi, {settings.name || "ROHIT MUNDURU"} <span aria-hidden="true">👋</span></h2>
      </section>

      <section className="disclaimer">
        <strong>Disclaimer:</strong>
        <span>
          This application is for educational purposes only and is not a substitute for professional medical advice,
          diagnosis, or treatment. Always consult a qualified healthcare provider for medical concerns.
        </span>
      </section>

      <section className="stats-grid">
        <StatCard icon={MessageSquareText} label="Total chats" value={Math.max(0, sessions.reduce((sum, item) => sum + item.messages.filter((msg) => msg.role === "user").length, 0))} tone="blue" />
        <StatCard icon={Pill} label="Medicine searches" value={medicineSearches.length} tone="green" />
        <StatCard icon={FileText} label="Reports analyzed" value={reports.length} tone="cyan" />
        <StatCard icon={ShieldAlert} label="Emergency alerts" value={emergencyCount} tone="rose" />
      </section>

      <section className="two-column">
        <div className="panel action-panel">
          <div className="feature-icon blue">
            <Stethoscope size={23} />
          </div>
          <h3>Have a question?</h3>
          <p>Start a conversation with the medical assistant for general educational guidance.</p>
          <button className="primary-button" type="button" onClick={onStartChat}>
            <span>Start chat</span>
            <ArrowRight size={17} />
          </button>
        </div>

        <div className="panel list-panel">
          <div className="panel-heading">
            <h3>Recent medicine searches</h3>
            <button type="button" onClick={onOpenMedicines}>View all</button>
          </div>
          {medicineSearches.length === 0 ? (
            <p className="empty">No medicine searches yet.</p>
          ) : (
            medicineSearches.slice(0, 3).map((item) => (
              <button className="list-row" key={item.id} type="button" onClick={onOpenMedicines}>
                <span>{item.query}</span>
                <small>{formatRelative(item.createdAt)}</small>
              </button>
            ))
          )}
        </div>
      </section>

      <section className="panel list-panel">
        <div className="panel-heading">
          <h3>Recent reports</h3>
          <button type="button" onClick={onOpenReports}>Open reports</button>
        </div>
        {reports.length === 0 ? (
          <p className="empty">No reports analyzed yet.</p>
        ) : (
          reports.slice(0, 4).map((item) => (
            <button className="list-row" key={item.id} type="button" onClick={onOpenReports}>
              <span>{item.name}</span>
              <small>{formatRelative(item.createdAt)}</small>
            </button>
          ))
        )}
      </section>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, tone }) {
  return (
    <div className="stat-card">
      <div className={`feature-icon ${tone}`}>
        <Icon size={21} />
      </div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ChatPage({ messages, messagesRef, input, setInput, loading, sendMessage, starters, copiedIndex, copyMessage, newChat, clearChat }) {
  return (
    <div className="chat-layout">
      <div className="chat-toolbar">
        <div>
          <h2>AI medical chat</h2>
          <p>Ask focused questions and get plain-language, safety-aware guidance.</p>
        </div>
        <div>
          <button className="ghost-button" type="button" onClick={clearChat}><RefreshCw size={17} /> Clear</button>
          <button className="primary-button" type="button" onClick={newChat}><Plus size={17} /> New chat</button>
        </div>
      </div>

      <div className="messages" ref={messagesRef} aria-live="polite">
        {messages.map((msg, index) => (
          <article className={`message ${msg.role}`} key={`${msg.role}-${index}`}>
            <div className="avatar">{msg.role === "assistant" ? <Bot size={18} /> : <UserRound size={18} />}</div>
            <div className="bubble">
              {msg.redFlags?.length > 0 && (
                <div className="red-flag">
                  <AlertTriangle size={15} />
                  Emergency warning terms detected: {msg.redFlags.join(", ")}
                </div>
              )}
              <MessageContent content={msg.content} role={msg.role} />
              {msg.role === "assistant" && (
                <button className="copy-button" type="button" onClick={() => copyMessage(msg.content, index)}>
                  {copiedIndex === index ? <Check size={14} /> : <Clipboard size={14} />}
                  <span>{copiedIndex === index ? "Copied" : "Copy"}</span>
                </button>
              )}
            </div>
          </article>
        ))}
        {loading === "chat" && (
          <article className="message assistant">
            <div className="avatar"><Bot size={18} /></div>
            <div className="bubble thinking"><Loader2 className="spin" size={18} /> Thinking carefully...</div>
          </article>
        )}
      </div>

      <div className="starter-row">
        {starters.map((starter) => (
          <button key={starter} type="button" onClick={() => sendMessage(starter)}>{starter}</button>
        ))}
      </div>

      <form className="composer" onSubmit={(event) => { event.preventDefault(); sendMessage(); }}>
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              sendMessage();
            }
          }}
          placeholder="Ask a medical question..."
          rows={2}
        />
        <button type="submit" disabled={loading === "chat" || !input.trim()} title="Send">
          {loading === "chat" ? <Loader2 className="spin" size={19} /> : <Send size={19} />}
        </button>
      </form>
    </div>
  );
}

function ReportsPage({ reportName, setReportName, reportText, setReportText, fileRef, uploadFile, reports, loading, analyzeReport, exportItem }) {
  const latest = reports[0];
  return (
    <div className="page-stack narrow">
      <section className="panel analyzer-panel">
        <div className="section-title">
          <div className="feature-icon cyan"><FileText size={24} /></div>
          <div>
            <h2>Medical report analyzer</h2>
            <p>Upload a text/PDF report or paste lab values. The AI explains findings in plain language and flags abnormal values.</p>
          </div>
        </div>

        <label className="field">
          <span>Report name</span>
          <div className="inline-field">
            <input value={reportName} onChange={(event) => setReportName(event.target.value)} placeholder="Lab report" />
            <button className="ghost-button upload-control" type="button" onClick={() => fileRef.current?.click()}>
              {loading === "upload" ? <Loader2 className="spin" size={17} /> : <Upload size={17} />}
              <span>Upload file</span>
            </button>
          </div>
        </label>
        <input ref={fileRef} hidden type="file" accept=".pdf,.txt,.csv,.md,image/*" onChange={(event) => uploadFile(event.target.files?.[0])} />

        <label className="field">
          <span>Report text</span>
          <textarea
            className="report-textarea"
            value={reportText}
            onChange={(event) => setReportText(event.target.value)}
            placeholder={"Paste lab values or report text here, e.g.\nHemoglobin: 10.2 g/dL (12-16)\nFasting glucose: 142 mg/dL\nLDL cholesterol: 165 mg/dL"}
          />
        </label>

        <button className="full-button" type="button" onClick={analyzeReport} disabled={loading === "report" || !reportText.trim()}>
          {loading === "report" ? <Loader2 className="spin" size={17} /> : null}
          <span>{loading === "report" ? "Analyzing..." : "Analyze report"}</span>
        </button>
      </section>

      <section className="panel list-panel">
        <div className="panel-heading">
          <h3>Recent reports</h3>
          {latest && <button type="button" onClick={() => exportItem(latest.name, latest.result)}>Export latest</button>}
        </div>
        {reports.length === 0 ? (
          <p className="empty">No reports analyzed yet.</p>
        ) : (
          reports.map((report) => (
            <details className="result-card" key={report.id} open={report.id === latest.id}>
              <summary>
                <span>{report.name}</span>
                <small>{formatRelative(report.createdAt)}</small>
              </summary>
              <MessageContent content={report.result} role="assistant" />
            </details>
          ))
        )}
      </section>
    </div>
  );
}

function MedicinesPage({ query, setQuery, searches, loading, lookup, exportItem }) {
  return (
    <div className="page-stack narrow">
      <section className="panel analyzer-panel">
        <div className="section-title">
          <div className="feature-icon green"><Pill size={24} /></div>
          <div>
            <h2>Medicine information</h2>
            <p>Search a medicine name or ask a safety question. Results are educational and should be confirmed with a clinician.</p>
          </div>
        </div>
        <form className="search-form" onSubmit={(event) => { event.preventDefault(); lookup(); }}>
          <div className="search-box">
            <Search size={18} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="e.g. Montek LC, ibuprofen, amoxicillin side effects" />
          </div>
          <button className="primary-button" type="submit" disabled={loading === "medicine" || !query.trim()}>
            {loading === "medicine" ? <Loader2 className="spin" size={17} /> : <Search size={17} />}
            <span>Search</span>
          </button>
        </form>
      </section>

      <section className="panel list-panel">
        <div className="panel-heading"><h3>Recent medicine searches</h3></div>
        {searches.length === 0 ? (
          <p className="empty">No medicine searches yet.</p>
        ) : (
          searches.map((item, index) => (
            <details className="result-card" key={item.id} open={index === 0}>
              <summary>
                <span>{item.query}</span>
                <small>{formatRelative(item.createdAt)}</small>
              </summary>
              <MessageContent content={item.result} role="assistant" />
              <button className="ghost-button export-inline" type="button" onClick={() => exportItem(item.query, item.result)}>
                <Download size={16} />
                Export
              </button>
            </details>
          ))
        )}
      </section>
    </div>
  );
}

function HistoryPage({ items }) {
  return (
    <div className="page-stack narrow">
      <section className="panel list-panel">
        <div className="panel-heading"><h3>Activity history</h3></div>
        {items.length === 0 ? (
          <p className="empty">No activity yet.</p>
        ) : (
          items.map((item) => (
            <div className="history-row" key={item.id}>
              <span>{item.type}</span>
              <strong>{item.title}</strong>
              <small>{formatRelative(item.date)}</small>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

function SettingsPage({ settings, setSettings }) {
  return (
    <div className="page-stack narrow">
      <section className="panel analyzer-panel">
        <div className="section-title">
          <div className="feature-icon blue"><Settings size={24} /></div>
          <div>
            <h2>Settings</h2>
            <p>Personalize the app shell and dashboard identity.</p>
          </div>
        </div>
        <label className="field">
          <span>Display name</span>
          <input value={settings.name} onChange={(event) => setSettings((current) => ({ ...current, name: event.target.value }))} />
        </label>
        <label className="field">
          <span>Email</span>
          <input value={settings.email} onChange={(event) => setSettings((current) => ({ ...current, email: event.target.value }))} />
        </label>
        <label className="toggle-row">
          <span>Dark mode</span>
          <input type="checkbox" checked={settings.darkMode} onChange={(event) => setSettings((current) => ({ ...current, darkMode: event.target.checked }))} />
        </label>
        <label className="toggle-row">
          <span>Compact mode</span>
          <input type="checkbox" checked={settings.compactMode} onChange={(event) => setSettings((current) => ({ ...current, compactMode: event.target.checked }))} />
        </label>
      </section>
    </div>
  );
}

export default App;
