# agents-md-gen

> Generate a highly detailed `AGENTS.md` for any GitHub repository. Real analysis, no templates.

[![Live](https://img.shields.io/badge/Live-agents--md--gen--frontend.pages.dev-7c6af7?style=flat-square)](https://agents-md-gen-frontend.pages.dev)

## What it does

Most AI agent context files are written by hand or use generic templates. **agents-md-gen** clones any GitHub repository via the GitHub API, deeply analyzes it, and generates an accurate `AGENTS.md` tailored to that specific repo.

The output is designed to be useful for:
- **Claude** (Anthropic) — via `AGENTS.md` / `CLAUDE.md`
- **ChatGPT** — paste into system prompt or Projects
- **Cursor** — reference in chat with `@AGENTS.md`
- **GitHub Copilot** — supplement `.github/copilot-instructions.md`
- **Aider** — reads `AGENTS.md` automatically
- **Gemini, Windsurf, Continue, and others**

## What it analyzes

| Signal | What's extracted |
|--------|-----------------|
| File tree | Full recursive tree → structure, entry points, config files |
| `package.json` | Dependencies, scripts, engines, package manager |
| `requirements.txt` / `pyproject.toml` | Python packages, build system |
| `go.mod` | Go modules and dependencies |
| `Cargo.toml` | Rust crates |
| `Gemfile` / `composer.json` | Ruby / PHP dependencies |
| `.env.example` | Environment variable names and examples |
| `.github/workflows/` | CI/CD workflow names and files |
| Lint/format configs | ESLint, Prettier, Biome, Black, Ruff, gofmt, rustfmt, etc. |
| Test files | Test framework detection, test file locations |
| Commit history | Conventional Commits detection |
| Contributors | Top contributors with commit counts |
| Branches | Active branches |
| Open issues & PRs | Current work-in-progress context |
| Existing AI config | CLAUDE.md, .cursorrules, copilot-instructions.md, etc. |

## What's in the generated AGENTS.md

1. **Overview** — repo metadata, stats, topics
2. **Tech Stack** — languages, frameworks, databases, infra, testing tools
3. **Architecture** — directory structure, entry points, key config files
4. **Setup & Commands** — clone, install, migrations, env setup
5. **Scripts Reference** — all npm/pnpm/bun scripts with purpose
6. **Environment Variables** — table from `.env.example`
7. **Testing** — how to run tests, test file locations, frameworks
8. **Code Style** — lint/format tools with exact run commands
9. **CI/CD** — workflow files and names
10. **Git Workflow** — branch strategy, commit style, PR template info
11. **Documentation** — doc files, API docs, Storybook
12. **Open Issues & PRs** — current state of the repo
13. **Contributors** — who works on this
14. **Existing AI Config** — cross-references CLAUDE.md, .cursorrules, etc.
15. **Special Notes** — monorepo, i18n, Docker, Terraform, etc.
16. **Instructions for AI Agents** — explicit do/don't rules tailored to the stack
17. **Tool-Specific Guidance** — per-tool notes for Claude, Copilot, Cursor, ChatGPT, Aider

## Architecture

```
agents-md-gen/
├── worker/        Cloudflare Worker — GitHub API proxy + analysis engine
│   ├── index.js   Main worker (vanilla JS, zero dependencies)
│   └── wrangler.toml
└── frontend/      React + Vite — Cloudflare Pages
    ├── src/
    │   ├── App.jsx
    │   ├── main.jsx
    │   └── index.css
    └── wrangler.toml
```

## Tech stack

- **Worker:** Cloudflare Workers (vanilla JS, zero dependencies)
- **Frontend:** React 18, Vite, react-markdown
- **Hosting:** Cloudflare Workers + Pages

## Comparison with gh-repo-gen

| Feature | gh-repo-gen | agents-md-gen |
|---------|------------|---------------|
| Output | README.md | AGENTS.md |
| Purpose | Human readers | AI coding agents |
| Commit style detection | ✗ | ✓ |
| Lint/format tool detection | ✗ | ✓ |
| Per-tool AI guidance | ✗ | ✓ |
| Env var table | ✗ | ✓ |
| Explicit agent rules | ✗ | ✓ |
| Branch & PR context | ✗ | ✓ |
| Existing AI config detection | ✗ | ✓ |

## FAQ

**Q: Does it work with private repositories?**
Yes. Paste a GitHub personal access token (PAT) into the token field. The token needs `repo` scope for private repos. It is never stored — it's sent directly to the worker for that one request and discarded.

**Q: Will it hit GitHub API rate limits?**
Without a token, the GitHub API allows 60 requests/hour per IP. Each generation uses roughly 10–15 API calls, so you can generate 4–6 times per hour unauthenticated. With a token the limit rises to 5,000 requests/hour — effectively unlimited for normal use.

**Q: Is my token safe?**
The token travels over HTTPS to the Cloudflare Worker, is used only to make GitHub API calls for that request, and is never logged, stored, or persisted anywhere. The worker is open source — you can audit exactly what it does with it.

**Q: Does it read my actual source code?**
No. The worker reads the file tree structure and a small set of well-known manifest files (`package.json`, `requirements.txt`, `go.mod`, `Cargo.toml`, `.env.example`, etc.). It does not download or read arbitrary source files, so large repos are fast and your code stays private.

**Q: How accurate is the framework detection?**
It detects 80+ frameworks and tools by scanning dependency files and config file names. It will correctly identify anything declared in your manifests. It won't detect something that's only referenced in source code with no manifest entry.

**Q: Can I use this for a monorepo?**
Yes. The tool detects monorepo signals (`pnpm-workspace.yaml`, `turbo.json`, `nx.json`, `lerna.json`, `packages/`, `apps/`) and adds a monorepo section to the output with relevant guidance for AI agents.

**Q: What languages and ecosystems are supported?**
JavaScript/TypeScript (npm, pnpm, yarn, bun), Python (pip, pipenv, poetry), Go, Rust, Ruby, PHP, Java/Kotlin (Maven, Gradle), and any repo with a recognizable file tree. The output quality is highest for JS/TS and Python repos since those have the richest manifest formats.

**Q: The generated AGENTS.md isn't perfect for my repo. What should I do?**
Treat it as a strong first draft. Download it, drop it into your repo root, and edit the sections that need tweaking. The hard part — extracting the real structure, stack, scripts, and env vars — is already done accurately. You're just refining the prose.

**Q: Does it work with GitLab or Bitbucket repos?**
Not currently. The tool is built on the GitHub REST API. GitLab and Bitbucket support may be added in a future version.

**Q: How is this different from just asking ChatGPT or Claude to write an AGENTS.md?**
An AI writing from a description guesses. This tool reads the actual repository — the real file tree, the real dependencies, the real scripts, the real CI config. The output reflects what's actually in the code, not what you remember to mention.

## License

MIT
