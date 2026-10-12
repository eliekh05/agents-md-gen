import { useState, useCallback, useRef } from "react";
import ReactMarkdown from "react-markdown";

const API_BASE = import.meta.env.VITE_API_BASE || "https://agents-md-gen.workers.dev";

const STEPS = [
  { id: "repo",      label: "Fetching repository metadata" },
  { id: "tree",      label: "Reading full file tree" },
  { id: "data",      label: "Fetching languages, contributors, branches" },
  { id: "manifests", label: "Reading manifest & config files" },
  { id: "stack",     label: "Detecting frameworks and tools" },
  { id: "building",  label: "Building AGENTS.md" },
];

function parseGhInput(raw) {
  const s = raw.trim();
  // Handle https://github.com/owner/repo or github.com/owner/repo
  const urlMatch = s.match(/(?:https?:\/\/)?github\.com\/([^/\s]+)\/([^/\s]+)/);
  if (urlMatch) return { owner: urlMatch[1], repo: urlMatch[2].replace(/\.git$/, "") };
  // Handle owner/repo
  const slashMatch = s.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (slashMatch) return { owner: slashMatch[1], repo: slashMatch[2] };
  return null;
}

export default function App() {
  const [input, setInput]       = useState("");
  const [token, setToken]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [steps, setSteps]       = useState([]);
  const [currentStep, setCurrentStep] = useState(null);
  const [result, setResult]     = useState(null);
  const [meta, setMeta]         = useState(null);
  const [error, setError]       = useState(null);
  const [tab, setTab]           = useState("preview");
  const [copied, setCopied]     = useState(false);
  const abortRef = useRef(null);

  const handleGenerate = useCallback(async () => {
    const parsed = parseGhInput(input);
    if (!parsed) {
      setError("Please enter a valid GitHub repo (e.g. facebook/react or https://github.com/facebook/react)");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setMeta(null);
    setSteps([]);
    setCurrentStep(null);
    setCopied(false);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const resp = await fetch(`${API_BASE}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner: parsed.owner, repo: parsed.repo, token: token.trim() || undefined }),
        signal: ctrl.signal,
      });

      if (!resp.ok) {
        const j = await resp.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${resp.status}`);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          let ev;
          try { ev = JSON.parse(line.slice(5).trim()); } catch { continue; }

          if (ev.type === "progress") {
            setCurrentStep(ev.step);
            setSteps(prev => {
              const existing = prev.find(s => s.id === ev.step);
              if (existing) return prev;
              return [...prev, { id: ev.step, message: ev.message }];
            });
          } else if (ev.type === "done") {
            setSteps(STEPS.map(s => s));
            setCurrentStep(null);
            setResult(ev.agents_md);
            setMeta(ev.meta);
          } else if (ev.type === "error") {
            throw new Error(ev.message);
          }
        }
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        setError(err.message || "Something went wrong. Check the repo name and try again.");
      }
    } finally {
      setLoading(false);
    }
  }, [input, token]);

  const handleCopy = useCallback(() => {
    if (!result) return;
    navigator.clipboard.writeText(result).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [result]);

  const handleDownload = useCallback(() => {
    if (!result) return;
    const blob = new Blob([result], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "AGENTS.md";
    a.click();
    URL.revokeObjectURL(url);
  }, [result]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !loading) handleGenerate();
  };

  const completedStepIds = new Set(
    result
      ? STEPS.map(s => s.id)
      : steps.map(s => s.id).filter(id => id !== currentStep)
  );

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-inner">
          <a href="/" className="logo">
            <span className="logo-icon">🤖</span>
            agents-md-gen
            <span className="logo-badge">beta</span>
          </a>
          <a
            href="https://github.com/eliekh05/agents-md-gen"
            target="_blank"
            rel="noopener noreferrer"
            className="gh-link"
          >
            <GhIcon /> GitHub
          </a>
        </div>
      </header>

      {/* Main */}
      <main className="main">
        {/* Hero */}
        <div className="hero">
          <span className="hero-icon">🤖</span>
          <h1>Generate AGENTS.md<br />for any GitHub repo</h1>
          <p>
            Clones your repository via the GitHub API, deeply analyzes its structure,
            and produces a highly detailed <code>AGENTS.md</code> for Claude, ChatGPT,
            Cursor, Copilot, Gemini, and other AI tools.
          </p>
          <div className="feature-pills">
            {["Detects tech stack", "Reads file tree", "Parses manifests", "Finds lint/test tools",
              "Checks CI/CD", "Analyzes commit style", "Extracts env vars"].map(f => (
              <span key={f} className="pill">{f}</span>
            ))}
          </div>
        </div>

        {/* Form */}
        <div className="form-card">
          <div className="form-row">
            <div className="field">
              <label>GitHub Repository</label>
              <input
                className="input"
                type="text"
                placeholder="owner/repo or full URL"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={loading}
                autoFocus
              />
            </div>
            <div className="field">
              <label>GitHub Token <span style={{ color: "var(--text-dim)", fontWeight: 400 }}>(optional)</span></label>
              <input
                className="input"
                type="password"
                placeholder="ghp_… or github_pat_…"
                value={token}
                onChange={e => setToken(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={loading}
                autoComplete="off"
              />
            </div>
          </div>
          <div className="token-hint">
            A token gives higher rate limits and access to private repos.{" "}
            <a href="https://github.com/settings/tokens/new?scopes=repo&description=agents-md-gen" target="_blank" rel="noopener noreferrer">
              Create a fine-grained PAT →
            </a>
          </div>
          <div style={{ marginTop: 20 }}>
            <button
              className="btn btn-primary"
              onClick={handleGenerate}
              disabled={loading || !input.trim()}
            >
              {loading ? (
                <><span className="spinner" style={{ borderColor: "rgba(255,255,255,0.2)", borderTopColor: "#fff" }} /> Analyzing…</>
              ) : (
                <><span>⚡</span> Generate AGENTS.md</>
              )}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="error-card">
            <span className="error-icon">⚠️</span>
            <p>{error}</p>
          </div>
        )}

        {/* Progress */}
        {loading && (
          <div className="progress-card">
            <h3>
              <span className="spinner" />
              Analyzing repository…
            </h3>
            <div className="steps">
              {STEPS.map(step => {
                const isDone = completedStepIds.has(step.id);
                const isActive = currentStep === step.id;
                return (
                  <div key={step.id} className={`step ${isDone ? "done" : isActive ? "active" : ""}`}>
                    <span className="step-icon">
                      {isDone ? "✓" : isActive ? "›" : "·"}
                    </span>
                    {step.label}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Result */}
        {result && (
          <>
            {/* Meta badges */}
            {meta && (
              <div className="meta-row">
                {meta.projectType && <span className="meta-badge accent">📦 {meta.projectType}</span>}
                {meta.language && <span className="meta-badge">🔤 {meta.language}</span>}
                {meta.packageManager && <span className="meta-badge">📦 {meta.packageManager}</span>}
                {meta.stars > 0 && <span className="meta-badge">⭐ {meta.stars.toLocaleString()}</span>}
                {meta.totalFiles > 0 && <span className="meta-badge">📄 {meta.totalFiles} files</span>}
                {meta.contributors > 0 && <span className="meta-badge">👥 {meta.contributors} contributors</span>}
                {meta.hasTests && <span className="meta-badge green">✓ Tests</span>}
                {meta.hasCi && <span className="meta-badge green">✓ CI/CD</span>}
                {meta.hasDocker && <span className="meta-badge green">✓ Docker</span>}
                {(meta.frameworks || []).slice(0, 5).map(f => (
                  <span key={f} className="meta-badge">{f}</span>
                ))}
              </div>
            )}

            <div className="result-card">
              <div className="result-header">
                <div className="result-title">
                  <span>📄</span>
                  <span className="result-filename">AGENTS.md</span>
                  <span style={{ color: "var(--text-dim)", fontWeight: 400, fontSize: 13 }}>
                    · {(result.length / 1024).toFixed(1)} KB · {result.split("\n").length} lines
                  </span>
                </div>
                <div className="result-actions">
                  <button
                    className={`btn-sm ${copied ? "copied" : ""}`}
                    onClick={handleCopy}
                  >
                    {copied ? "✓ Copied!" : "📋 Copy"}
                  </button>
                  <button className="btn-sm" onClick={handleDownload}>
                    ⬇ Download
                  </button>
                  <button
                    className="btn-sm accent"
                    onClick={() => {
                      setResult(null);
                      setMeta(null);
                      setSteps([]);
                    }}
                  >
                    ↺ New
                  </button>
                </div>
              </div>

              {/* Tabs */}
              <div className="tab-bar">
                <button className={`tab ${tab === "preview" ? "active" : ""}`} onClick={() => setTab("preview")}>
                  Preview
                </button>
                <button className={`tab ${tab === "raw" ? "active" : ""}`} onClick={() => setTab("raw")}>
                  Raw Markdown
                </button>
              </div>

              {tab === "preview" ? (
                <div className="preview">
                  <ReactMarkdown>{result}</ReactMarkdown>
                </div>
              ) : (
                <pre className="raw">{result}</pre>
              )}
            </div>
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="footer">
        Built by{" "}
        <a href="https://github.com/eliekh05" target="_blank" rel="noopener noreferrer">@eliekh05</a>
        {" "}·{" "}
        <a href="https://github.com/eliekh05/agents-md-gen" target="_blank" rel="noopener noreferrer">View source</a>
        {" "}·{" "}
        Data via{" "}
        <a href="https://api.github.com" target="_blank" rel="noopener noreferrer">GitHub API</a>
      </footer>
    </div>
  );
}

function GhIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}
