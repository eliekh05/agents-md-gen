# agents-md-gen

> Generate a highly detailed `AGENTS.md` for any GitHub repository. Real analysis, no templates.

[![Live](https://img.shields.io/badge/Live-agents--md--gen.pages.dev-7c6af7?style=flat-square)](https://agents-md-gen.pages.dev)

## What it does

Most AI agent context files are written by hand or use generic templates. **agents-md-gen** clones any GitHub repository via the API, deeply analyzes it, and generates an accurate `AGENTS.md` tailored to that specific repo.

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
├── worker/        Cloudflare Worker — GitHub API proxy + deep analysis + AGENTS.md builder
│   ├── index.js   Main worker (vanilla JS, no dependencies)
│   └── wrangler.toml
└── frontend/      React + Vite — Cloudflare Pages
    ├── src/
    │   ├── App.jsx
    │   ├── main.jsx
    │   └── index.css
    └── wrangler.toml
```

## Environment Variables

| Variable | Where | Description |
|----------|-------|-------------|
| `GITHUB_TOKEN` | Worker secret | GitHub PAT for higher rate limits (optional but recommended) |
| `VITE_API_BASE` | Frontend env | URL of the deployed worker |

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

## Tech stack

- **Worker:** Cloudflare Workers (vanilla JS, zero dependencies)
- **Frontend:** React 18, Vite, react-markdown
- **Hosting:** Cloudflare Workers + Pages

## License

MIT
