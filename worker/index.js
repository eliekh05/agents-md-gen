/**
 * agents-md-gen — Cloudflare Worker
 *
 * Clones (via API) any GitHub repository, deeply analyzes its structure,
 * and produces a highly detailed AGENTS.md file for AI coding tools
 * (Claude, ChatGPT, Cursor, GitHub Copilot, Gemini, etc.)
 *
 * POST /generate { owner, repo, token? } → SSE stream → { type: "done", agents_md }
 */

const GH_API = "https://api.github.com";

// ── Framework / library signal maps ─────────────────────────────────────────
const FRAMEWORK_SIGNALS = {
  // JS/TS Frameworks
  "React":           ['"react"', '"react-dom"'],
  "Next.js":         ['"next"'],
  "Vue":             ['"vue"'],
  "Nuxt":            ['"nuxt"'],
  "Svelte":          ['"svelte"', "@sveltejs"],
  "SvelteKit":       ['"@sveltejs/kit"'],
  "Angular":         ["@angular/core"],
  "Astro":           ['"astro"'],
  "Remix":           ['"@remix-run/react"'],
  "Electron":        ['"electron"'],
  "Vite":            ['"vite"'],
  "Hono":            ['"hono"'],
  "Elysia":          ['"elysia"'],
  "tRPC":            ['"@trpc/server"'],
  "Drizzle ORM":     ['"drizzle-orm"'],
  "Prisma":          ['"prisma"', '"@prisma/client"'],
  "Tailwind CSS":    ["tailwindcss"],
  "shadcn/ui":       ['"@radix-ui"'],
  "GraphQL":         ["graphql", "apollo-server"],
  // Node backends
  "Express":         ['"express"'],
  "Fastify":         ['"fastify"'],
  "NestJS":          ["@nestjs/core"],
  "Koa":             ['"koa"'],
  // Python
  "Django":          ["django"],
  "Flask":           ["flask"],
  "FastAPI":         ["fastapi"],
  "SQLAlchemy":      ["sqlalchemy"],
  "Pydantic":        ["pydantic"],
  "Celery":          ["celery"],
  "Alembic":         ["alembic"],
  "PyTest":          ["pytest"],
  "Pandas":          ["pandas"],
  "NumPy":           ["numpy"],
  "scikit-learn":    ["scikit-learn"],
  "TensorFlow":      ["tensorflow"],
  "PyTorch":         ["torch"],
  "LangChain":       ["langchain"],
  "OpenAI":          ["openai"],
  "Anthropic":       ["anthropic"],
  // Go
  "Gin":             ["gin-gonic/gin"],
  "Fiber":           ["gofiber/fiber"],
  "Echo":            ["labstack/echo"],
  "GORM":            ["gorm.io"],
  "Chi":             ["go-chi/chi"],
  // Rust
  "Actix":           ["actix-web"],
  "Axum":            ["axum"],
  "Tokio":           ["tokio"],
  "Serde":           ["serde"],
  "SQLx":            ["sqlx"],
  // Java/Kotlin
  "Spring Boot":     ["spring-boot"],
  "Quarkus":         ["quarkus"],
  "Micronaut":       ["micronaut"],
  // Ruby
  "Rails":           ["railties"],
  "Sinatra":         ["sinatra"],
  // PHP
  "Laravel":         ["laravel/framework"],
  "Symfony":         ["symfony/framework"],
  // Databases
  "PostgreSQL":      ["psycopg2", '"pg"', "asyncpg", "postgres"],
  "MySQL":           ["mysqlclient", "mysql2", "pymysql"],
  "SQLite":          ["sqlite3", "better-sqlite3"],
  "MongoDB":         ["pymongo", "mongoose"],
  "Redis":           ["redis", "ioredis"],
  "Supabase":        ["supabase"],
  "PlanetScale":     ["@planetscale"],
  // Infrastructure
  "Docker":          ["dockerfile"],
  "Kubernetes":      ["kubernetes"],
  "Terraform":       ["terraform"],
  "GitHub Actions":  [".github/workflows"],
  "Pulumi":          ["pulumi"],
  // Testing
  "Jest":            ['"jest"'],
  "Vitest":          ['"vitest"'],
  "Playwright":      ['"playwright"', '"@playwright'],
  "Cypress":         ['"cypress"'],
  "Testing Library": ['"@testing-library'],
  // Misc
  "Stripe":          ['"stripe"'],
  "Zod":             ['"zod"'],
  "React Query":     ['"@tanstack/react-query"'],
  "Zustand":         ['"zustand"'],
  "Redux":           ['"redux"', '"@reduxjs'],
};

// ── Coding convention / style signals ───────────────────────────────────────
const STYLE_SIGNALS = {
  "ESLint":      [".eslintrc", ".eslintrc.js", ".eslintrc.json", ".eslintrc.cjs", ".eslintrc.mjs", "eslint.config"],
  "Prettier":    [".prettierrc", ".prettier.config", "prettier.config.js"],
  "Biome":       ["biome.json"],
  "Stylelint":   [".stylelintrc"],
  "EditorConfig":[".editorconfig"],
  "Husky":       [".husky"],
  "lint-staged": ["lint-staged"],
  "Commitlint":  ["commitlint.config"],
  "Black":       ["black"],
  "Ruff":        ["ruff"],
  "isort":       ["isort"],
  "mypy":        ["mypy.ini", ".mypy.ini"],
  "flake8":      [".flake8"],
  "pylint":      [".pylintrc"],
  "gofmt":       ["gofmt"],
  "golangci":    [".golangci"],
  "rustfmt":     ["rustfmt.toml", ".rustfmt.toml"],
  "clippy":      ["clippy"],
};

// ── GitHub API helpers ───────────────────────────────────────────────────────
function ghHeaders(token) {
  const h = {
    Accept: "application/vnd.github+json",
    "User-Agent": "agents-md-gen/1.0",
  };
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

async function ghGet(url, token) {
  const resp = await fetch(url, { headers: ghHeaders(token) });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`GitHub ${resp.status} @ ${url}: ${text.slice(0, 300)}`);
  }
  return resp.json();
}

async function ghGetSafe(url, token) {
  try { return await ghGet(url, token); }
  catch { return null; }
}

async function fetchFile(owner, repo, path, token) {
  try {
    const data = await ghGet(`${GH_API}/repos/${owner}/${repo}/contents/${path}`, token);
    if (data.encoding === "base64" && data.content)
      return atob(data.content.replace(/\n/g, ""));
    return null;
  } catch { return null; }
}

async function fetchTree(owner, repo, token) {
  try {
    const data = await ghGet(`${GH_API}/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`, token);
    return (data.tree || []).map(f => ({ path: f.path, type: f.type, size: f.size || 0 }));
  } catch { return []; }
}

async function fetchLanguages(owner, repo, token) {
  return await ghGetSafe(`${GH_API}/repos/${owner}/${repo}/languages`, token) || {};
}

async function fetchContributors(owner, repo, token) {
  try {
    const data = await ghGet(`${GH_API}/repos/${owner}/${repo}/contributors?per_page=30&anon=1`, token);
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

async function fetchWorkflows(owner, repo, token) {
  try {
    const data = await ghGet(`${GH_API}/repos/${owner}/${repo}/actions/workflows`, token);
    return data.workflows || [];
  } catch { return []; }
}

async function fetchBranches(owner, repo, token) {
  try {
    const data = await ghGet(`${GH_API}/repos/${owner}/${repo}/branches?per_page=30`, token);
    return Array.isArray(data) ? data.map(b => b.name) : [];
  } catch { return []; }
}

async function fetchCommits(owner, repo, token) {
  try {
    const data = await ghGet(`${GH_API}/repos/${owner}/${repo}/commits?per_page=20`, token);
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

async function fetchIssues(owner, repo, token) {
  try {
    const data = await ghGet(`${GH_API}/repos/${owner}/${repo}/issues?state=open&per_page=10`, token);
    return Array.isArray(data) ? data.filter(i => !i.pull_request) : [];
  } catch { return []; }
}

async function fetchPRs(owner, repo, token) {
  try {
    const data = await ghGet(`${GH_API}/repos/${owner}/${repo}/pulls?state=open&per_page=5`, token);
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

async function fetchTopics(owner, repo, token) {
  try {
    const data = await ghGet(`${GH_API}/repos/${owner}/${repo}/topics`, token);
    return data.names || [];
  } catch { return []; }
}

// ── Framework detection ──────────────────────────────────────────────────────
function detectFromContent(content, found) {
  if (!content) return;
  const lower = content.toLowerCase();
  for (const [fw, sigs] of Object.entries(FRAMEWORK_SIGNALS))
    for (const s of sigs)
      if (lower.includes(s.toLowerCase())) { found.add(fw); break; }
}

function detectFromPackageJson(content, found) {
  if (!content) return {};
  let pkg;
  try { pkg = JSON.parse(content); } catch { return {}; }
  const allDeps = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
    ...pkg.peerDependencies,
  };
  const depStr = JSON.stringify(allDeps).toLowerCase();
  for (const [fw, sigs] of Object.entries(FRAMEWORK_SIGNALS))
    for (const s of sigs)
      if (depStr.includes(s.toLowerCase())) { found.add(fw); break; }
  return {
    name: pkg.name,
    version: pkg.version,
    description: pkg.description,
    scripts: pkg.scripts || {},
    engines: pkg.engines || {},
    main: pkg.main,
    type: pkg.type,
    license: pkg.license,
    deps: Object.keys(pkg.dependencies || {}),
    devDeps: Object.keys(pkg.devDependencies || {}),
  };
}

// ── Deep tree analysis ───────────────────────────────────────────────────────
function analyzeTree(tree) {
  const paths = tree.map(f => f.path.toLowerCase());
  const allPaths = tree.map(f => f.path);

  const has = pattern => paths.some(p =>
    typeof pattern === "string" ? p.includes(pattern) : pattern.test(p)
  );
  const hasExact = name => paths.includes(name.toLowerCase());
  const getMatching = pattern => allPaths.filter(p =>
    typeof pattern === "string"
      ? p.toLowerCase().includes(pattern)
      : pattern.test(p.toLowerCase())
  );

  // Source structure
  const srcDirs = [...new Set(
    allPaths
      .filter(p => p.includes("/"))
      .map(p => p.split("/")[0])
  )].filter(d => !d.startsWith(".") && d !== "node_modules");

  const hasMonorepo = has("packages/") || has("apps/") || hasExact("pnpm-workspace.yaml") || hasExact("lerna.json") || hasExact("nx.json") || hasExact("turbo.json");

  // Config / tooling files
  const configFiles = allPaths.filter(p => {
    const name = p.split("/").pop().toLowerCase();
    return name.startsWith(".") || name.includes("config") || name.includes("rc") || name.endsWith(".toml") || name.endsWith(".ini");
  });

  // Style / lint
  const lintTools = [];
  for (const [tool, signals] of Object.entries(STYLE_SIGNALS)) {
    if (signals.some(s => paths.some(p => p.includes(s.toLowerCase())))) {
      lintTools.push(tool);
    }
  }

  // Test files
  const testFiles = getMatching(/\.(test|spec)\.(js|ts|jsx|tsx|py|go|rs|rb|java|kt)$/)
    .concat(getMatching(/^tests?\/|__tests__\//))
    .slice(0, 10);
  const hasTests = testFiles.length > 0 || has("/test") || has("/tests") || has("__tests__") || has("spec/");

  // Docs
  const docFiles = getMatching(/\.(md|rst|txt|adoc)$/i).filter(p => {
    const name = p.split("/").pop().toLowerCase();
    return name !== "readme.md" && name !== "license" && name !== "license.md";
  }).slice(0, 8);
  const hasApiDocs = has("openapi") || has("swagger") || has("api-docs") || has("docs/api");
  const hasDocs = has("/docs") || has("/documentation") || hasApiDocs || has("mkdocs") || has("docusaurus");

  // Infrastructure
  const hasDocker = hasExact("dockerfile") || has("docker-compose") || has(".dockerfile");
  const hasKubernetes = has(".yaml") && (has("kind: deployment") || has("kind: service") || has("k8s/") || has("kubernetes/"));
  const hasTerraform = has(".tf") && (has("main.tf") || has("variables.tf"));
  const hasHelm = has("chart.yaml") || has("helm/");
  const hasCi = has(".github/workflows") || hasExact(".travis.yml") || hasExact("circle.yml") || hasExact(".circleci/config.yml") || hasExact("Jenkinsfile") || hasExact(".gitlab-ci.yml") || has("bitbucket-pipelines");

  // Package / dep files
  const hasEnvExample = hasExact(".env.example") || hasExact(".env.sample") || hasExact(".env.template");
  const hasMakefile = hasExact("makefile") || hasExact("Makefile");
  const hasContributing = hasExact("contributing.md") || hasExact("CONTRIBUTING.md");
  const hasChangelog = hasExact("changelog.md") || hasExact("CHANGELOG.md");
  const hasCodeOfConduct = hasExact("code_of_conduct.md") || hasExact("CODE_OF_CONDUCT.md");
  const hasSecurity = hasExact("security.md") || hasExact("SECURITY.md") || hasExact(".github/security.md");
  const hasLicense = hasExact("license") || hasExact("LICENSE") || hasExact("license.md") || hasExact("LICENSE.md");

  // Special dirs
  const hasMigrations = has("migrations/") || has("migration/") || has("alembic/");
  const hasSeeds = has("seeds/") || has("seed/") || has("fixtures/");
  const hasScripts = has("scripts/") || has("bin/");
  const hasExamples = has("examples/") || has("example/") || has("demos/") || has("demo/");
  const hasStorybook = has(".storybook") || has("stories/") || has(".stories.");
  const hasI18n = has("i18n/") || has("locales/") || has("translations/") || has("l10n/");

  // PR templates / issue templates
  const hasPRTemplate = has(".github/pull_request_template") || has("pull_request_template.md");
  const hasIssueTemplates = has(".github/issue_template") || has(".github/ISSUE_TEMPLATE");
  const hasCopilotInstructions = has(".github/copilot-instructions");
  const hasClaudemd = hasExact("claude.md") || hasExact("CLAUDE.md");
  const hasAgentsmd = hasExact("agents.md") || hasExact("AGENTS.md");
  const hasCursorRules = hasExact(".cursorrules") || has(".cursor/rules");
  const hasWindsurfRules = hasExact(".windsurfrules");

  // Detect package manager
  let packageManager = null;
  if (hasExact("pnpm-lock.yaml")) packageManager = "pnpm";
  else if (hasExact("yarn.lock")) packageManager = "yarn";
  else if (hasExact("bun.lockb") || hasExact("bun.lock")) packageManager = "bun";
  else if (hasExact("package-lock.json")) packageManager = "npm";

  // Language-specific entry points
  const entryPoints = allPaths.filter(p => {
    const lp = p.toLowerCase();
    return lp === "main.go" || lp === "main.py" || lp === "src/main.py" ||
      lp === "app.py" || lp === "index.js" || lp === "src/index.js" ||
      lp === "src/main.ts" || lp === "src/index.ts" || lp === "lib/index.js" ||
      lp === "src/lib/index.ts" || lp === "src/main.rs" || lp === "main.rs" ||
      lp === "index.ts" || lp === "server.js" || lp === "server.ts" ||
      lp === "app.js" || lp === "app.ts" || lp === "cmd/main.go" ||
      lp.endsWith("main.go") || lp.endsWith("main.py") || lp.endsWith("app.py");
  }).slice(0, 5);

  // Workflow files
  const workflowFiles = getMatching(/\.github\/workflows\/.+\.ya?ml$/i);

  // Source file counts by extension
  const extCounts = {};
  for (const f of tree) {
    if (f.type !== "blob") continue;
    const ext = f.path.split(".").pop().toLowerCase();
    if (ext && ext.length <= 6 && !["lock", "sum", "mod"].includes(ext)) {
      extCounts[ext] = (extCounts[ext] || 0) + 1;
    }
  }

  const totalFiles = tree.filter(f => f.type === "blob").length;
  const totalDirs = tree.filter(f => f.type === "tree").length;

  return {
    srcDirs, configFiles, lintTools, testFiles, docFiles, entryPoints,
    workflowFiles, packageManager, extCounts, totalFiles, totalDirs,
    hasMonorepo, hasTests, hasDocs, hasApiDocs, hasDocker, hasKubernetes,
    hasTerraform, hasHelm, hasCi, hasEnvExample, hasMakefile, hasMigrations,
    hasSeeds, hasScripts, hasExamples, hasStorybook, hasI18n, hasContributing,
    hasChangelog, hasCodeOfConduct, hasSecurity, hasLicense, hasPRTemplate,
    hasIssueTemplates, hasCopilotInstructions, hasClaudemd, hasAgentsmd,
    hasCursorRules, hasWindsurfRules,
  };
}

// ── Detect install method ────────────────────────────────────────────────────
function detectInstallMethod(tree, pkg, req, gomod, cargo, gemfile, composerJson) {
  const paths = tree.map(f => f.path.toLowerCase());
  const hasFile = name => paths.includes(name);

  if (hasFile("bun.lockb") || hasFile("bun.lock")) {
    const scripts = pkg ? JSON.parse(pkg || "{}").scripts || {} : {};
    return {
      type: "bun",
      install: "bun install",
      dev: scripts.dev ? "bun run dev" : null,
      start: scripts.start ? "bun run start" : null,
      build: scripts.build ? "bun run build" : null,
      test: scripts.test ? "bun test" : null,
    };
  }
  if (hasFile("pnpm-lock.yaml")) {
    const scripts = pkg ? JSON.parse(pkg || "{}").scripts || {} : {};
    return {
      type: "pnpm",
      install: "pnpm install",
      dev: scripts.dev ? "pnpm dev" : null,
      start: scripts.start ? "pnpm start" : null,
      build: scripts.build ? "pnpm build" : null,
      test: scripts.test ? "pnpm test" : null,
    };
  }
  if (hasFile("yarn.lock")) {
    const scripts = pkg ? JSON.parse(pkg || "{}").scripts || {} : {};
    return {
      type: "yarn",
      install: "yarn",
      dev: scripts.dev ? "yarn dev" : null,
      start: scripts.start ? "yarn start" : null,
      build: scripts.build ? "yarn build" : null,
      test: scripts.test ? "yarn test" : null,
    };
  }
  if (pkg) {
    let scripts = {};
    try { scripts = JSON.parse(pkg).scripts || {}; } catch {}
    return {
      type: "npm",
      install: "npm install",
      dev: scripts.dev ? "npm run dev" : null,
      start: scripts.start ? "npm start" : null,
      build: scripts.build ? "npm run build" : null,
      test: scripts.test ? "npm test" : null,
    };
  }
  if (hasFile("poetry.lock") || (req && req.includes("[tool.poetry]"))) {
    return {
      type: "poetry",
      install: "poetry install",
      start: "poetry run python main.py",
      test: "poetry run pytest",
    };
  }
  if (hasFile("pipfile") || hasFile("pipfile.lock")) {
    return {
      type: "pipenv",
      install: "pipenv install",
      start: "pipenv run python main.py",
      test: "pipenv run pytest",
    };
  }
  if (req) {
    return {
      type: "pip",
      install: "pip install -r requirements.txt",
      start: "python main.py",
      test: "pytest",
    };
  }
  if (gomod) {
    return {
      type: "go",
      install: "go mod download",
      start: "go run .",
      build: "go build -o app .",
      test: "go test ./...",
    };
  }
  if (cargo) {
    return {
      type: "cargo",
      install: null,
      start: "cargo run",
      build: "cargo build --release",
      test: "cargo test",
    };
  }
  if (gemfile) {
    return {
      type: "bundler",
      install: "bundle install",
      start: "bundle exec ruby app.rb",
      test: "bundle exec rspec",
    };
  }
  if (composerJson) {
    return {
      type: "composer",
      install: "composer install",
      start: "php artisan serve",
      test: "php artisan test",
    };
  }
  return null;
}

// ── Infer project type ───────────────────────────────────────────────────────
function inferProjectType(repo, tree, frameworks, languages, pkgMeta) {
  const fw = frameworks.map(f => f.toLowerCase());
  const hasLang = l => Object.keys(languages).some(k => k.toLowerCase().includes(l.toLowerCase()));
  const topLang = Object.keys(languages)[0] || repo.language || "";

  // AI/ML
  if (fw.some(f => ["tensorflow", "pytorch", "langchain", "openai", "anthropic", "scikit-learn"].includes(f)))
    return "AI / Machine Learning";
  // Mobile
  if (hasLang("dart") || fw.some(f => ["flutter", "react native", "expo"].includes(f)))
    return "Mobile App";
  // CLI
  if (fw.includes("cobra") || fw.includes("click") || tree.some(t => t.path.includes("cli/")))
    return "CLI Tool";
  // Desktop
  if (fw.includes("electron") || fw.includes("tauri"))
    return "Desktop App";
  // Fullstack
  if (fw.some(f => ["next.js", "remix", "nuxt", "sveltekit", "astro"].includes(f)))
    return "Full-Stack Web App";
  // API / backend
  if (fw.some(f => ["fastapi", "django", "flask", "express", "fastify", "nestjs", "gin", "fiber", "actix", "axum", "spring boot", "rails", "laravel", "koa", "echo"].includes(f)))
    return "API / Backend Service";
  // Frontend SPA
  if (fw.some(f => ["react", "vue", "angular", "svelte"].includes(f)))
    return "Frontend Web App";
  // Library / package
  if (pkgMeta?.main || (repo.description || "").toLowerCase().includes("library") || (repo.description || "").toLowerCase().includes("sdk"))
    return "Library / SDK";
  // Scripts / automation
  if (["shell", "python"].includes(topLang.toLowerCase()) && tree.filter(t => t.type === "blob").length < 20)
    return "Script / Automation";
  // DevOps
  if (fw.some(f => ["terraform", "kubernetes", "helm", "pulumi"].includes(f)))
    return "Infrastructure / DevOps";
  return "General Project";
}

// ── Detect commit style ──────────────────────────────────────────────────────
function detectCommitStyle(commits) {
  if (!commits.length) return null;
  const messages = commits.map(c => c.commit?.message?.split("\n")[0] || "");
  const conventionalRx = /^(feat|fix|docs|style|refactor|test|chore|perf|ci|build|revert)(\(.+\))?:/i;
  const conventionalCount = messages.filter(m => conventionalRx.test(m)).length;
  if (conventionalCount / messages.length > 0.5) return "Conventional Commits";
  return null;
}

// ── Extract env vars from .env.example ──────────────────────────────────────
function parseEnvExample(content) {
  if (!content) return [];
  return content
    .split("\n")
    .filter(line => line.match(/^[A-Z_]+=/) || line.match(/^#\s*[A-Z_]+=/) || (line.startsWith("#") && line.includes("=")))
    .slice(0, 30)
    .map(line => {
      const clean = line.replace(/^#+\s*/, "").trim();
      const [key, ...rest] = clean.split("=");
      const val = rest.join("=").trim();
      return { key: key.trim(), example: val, isComment: line.startsWith("#") };
    })
    .filter(e => e.key && e.key.match(/^[A-Z0-9_]+$/));
}

// ── Parse scripts from pkg/Makefile ─────────────────────────────────────────
function extractKeyScripts(pkgMeta, hasMakefile) {
  const scripts = pkgMeta?.scripts || {};
  const important = ["dev", "start", "build", "test", "lint", "format", "preview", "db:push", "db:generate", "db:migrate", "typecheck", "check"];
  return important
    .filter(k => scripts[k])
    .map(k => ({ name: k, cmd: scripts[k] }));
}

// ── Build AGENTS.md ──────────────────────────────────────────────────────────
function buildAgentsMd(data) {
  const {
    repo, owner, languages, frameworks, contributors,
    topics, workflows, treeAnalysis, pkgMeta, installMethod,
    projectType, fullTree, commits, branches, openIssues, openPRs,
    envExample, gitignoreContent, gomod, cargo, composerContent,
    commitStyle,
  } = data;

  const repoFullName = `${owner}/${repo.name}`;
  const repoName = repo.name;
  const defaultBranch = repo.default_branch || "main";
  const description = repo.description || "";
  const homepage = repo.homepage || "";
  const isPrivate = repo.private;

  // Language breakdown
  const totalBytes = Object.values(languages).reduce((a, b) => a + b, 0);
  const langBreakdown = Object.entries(languages)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([l, b]) => ({ lang: l, pct: totalBytes ? Math.round((b / totalBytes) * 100) : 0 }));

  const topLang = langBreakdown[0]?.lang || repo.language || "Unknown";

  // Build command reference
  const pm = installMethod?.type || treeAnalysis.packageManager || "npm";
  const pmCmd = pm === "yarn" ? "yarn" : pm === "pnpm" ? "pnpm" : pm === "bun" ? "bun" : pm === "poetry" ? "poetry run" : pm;

  // Key scripts
  const keyScripts = extractKeyScripts(pkgMeta, treeAnalysis.hasMakefile);

  // Environment variables
  const envVars = parseEnvExample(envExample);

  // Workflow list
  const workflowList = workflows.slice(0, 8).map(w => ({
    name: w.name,
    file: w.path?.split("/").pop() || w.path,
    state: w.state,
  }));

  // Top-level directory structure
  const topLevel = [...new Set(
    fullTree
      .filter(f => !f.path.startsWith(".") && f.type === "tree" && !f.path.includes("/"))
      .map(f => f.path)
  )].slice(0, 20);

  const importantDirs = fullTree
    .filter(f => f.type === "tree" && f.path.split("/").length <= 2 && !f.path.startsWith("node_modules") && !f.path.startsWith("."))
    .map(f => f.path)
    .slice(0, 30);

  // Important config files
  const configFileList = fullTree
    .filter(f => {
      const name = f.path.split("/").pop().toLowerCase();
      return f.type === "blob" && !f.path.includes("/node_modules/") && (
        name.startsWith(".") || name.endsWith(".toml") || name.endsWith(".ini") ||
        name.endsWith(".yaml") || name.endsWith(".yml") || name.includes("config")
      ) && !f.path.includes("node_modules") && f.path.split("/").length <= 3;
    })
    .map(f => f.path)
    .slice(0, 20);

  // Helper to build a section with heading
  const section = (title, content) => content ? `## ${title}\n\n${content.trim()}\n` : "";

  // ── OVERVIEW ──────────────────────────────────────────────────────────────
  const overviewContent = [
    `**Repository:** [${repoFullName}](https://github.com/${repoFullName})`,
    description ? `**Description:** ${description}` : null,
    homepage ? `**Homepage:** ${homepage}` : null,
    `**Type:** ${projectType}`,
    `**Primary Language:** ${topLang}`,
    `**Default Branch:** \`${defaultBranch}\``,
    `**Visibility:** ${isPrivate ? "Private" : "Public"}`,
    `**Stars:** ${repo.stargazers_count || 0} | **Forks:** ${repo.forks_count || 0} | **Open Issues:** ${repo.open_issues_count || 0}`,
    `**Total Files:** ${treeAnalysis.totalFiles} | **Directories:** ${treeAnalysis.totalDirs}`,
    repo.created_at ? `**Created:** ${new Date(repo.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}` : null,
    repo.pushed_at ? `**Last Pushed:** ${new Date(repo.pushed_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}` : null,
    topics.length > 0 ? `**Topics:** ${topics.map(t => `\`${t}\``).join(" ")}` : null,
  ].filter(Boolean).join("\n");

  // ── TECH STACK ────────────────────────────────────────────────────────────
  let techStack = "";
  if (langBreakdown.length > 0) {
    techStack += `### Languages\n\n`;
    techStack += langBreakdown.map(l => `- **${l.lang}** — ${l.pct}%`).join("\n") + "\n\n";
  }
  if (frameworks.length > 0) {
    // Group by category
    const infra = frameworks.filter(f => ["Docker", "Kubernetes", "Terraform", "Helm", "Pulumi", "GitHub Actions"].includes(f));
    const testFw = frameworks.filter(f => ["Jest", "Vitest", "Playwright", "Cypress", "Testing Library", "PyTest"].includes(f));
    const dbFw = frameworks.filter(f => ["PostgreSQL", "MySQL", "SQLite", "MongoDB", "Redis", "Supabase", "PlanetScale", "Prisma", "Drizzle ORM", "SQLAlchemy", "GORM", "SQLx"].includes(f));
    const otherFw = frameworks.filter(f => !infra.includes(f) && !testFw.includes(f) && !dbFw.includes(f));

    if (otherFw.length > 0) techStack += `### Frameworks & Libraries\n\n${otherFw.map(f => `- ${f}`).join("\n")}\n\n`;
    if (dbFw.length > 0) techStack += `### Databases & ORMs\n\n${dbFw.map(f => `- ${f}`).join("\n")}\n\n`;
    if (infra.length > 0) techStack += `### Infrastructure & DevOps\n\n${infra.map(f => `- ${f}`).join("\n")}\n\n`;
    if (testFw.length > 0) techStack += `### Testing\n\n${testFw.map(f => `- ${f}`).join("\n")}\n\n`;
  }
  if (treeAnalysis.packageManager) {
    techStack += `### Package Manager\n\n- **${treeAnalysis.packageManager}**\n\n`;
  }

  // ── ARCHITECTURE ──────────────────────────────────────────────────────────
  let architecture = "";
  if (treeAnalysis.hasMonorepo) {
    architecture += "This is a **monorepo**. It may contain multiple packages or apps under `packages/`, `apps/`, or similar directories.\n\n";
  }
  if (topLevel.length > 0) {
    architecture += `### Top-level structure\n\n\`\`\`\n${repoName}/\n`;
    architecture += topLevel.map(d => `├── ${d}/`).join("\n");
    const rootFiles = fullTree
      .filter(f => f.type === "blob" && !f.path.includes("/") && !f.path.startsWith("."))
      .map(f => f.path)
      .slice(0, 10);
    if (rootFiles.length > 0) {
      architecture += "\n" + rootFiles.map(f => `├── ${f}`).join("\n");
    }
    architecture += "\n```\n\n";
  }
  if (treeAnalysis.entryPoints.length > 0) {
    architecture += `### Entry Points\n\n${treeAnalysis.entryPoints.map(e => `- \`${e}\``).join("\n")}\n\n`;
  }
  if (configFileList.length > 0) {
    architecture += `### Key Configuration Files\n\n${configFileList.map(f => `- \`${f}\``).join("\n")}\n\n`;
  }

  // ── SETUP & COMMANDS ──────────────────────────────────────────────────────
  let setup = "";
  setup += `### Clone\n\n\`\`\`bash\ngit clone https://github.com/${repoFullName}.git\ncd ${repoName}\n\`\`\`\n\n`;

  if (installMethod) {
    setup += `### Install Dependencies\n\n\`\`\`bash\n${installMethod.install}\n\`\`\`\n\n`;

    if (treeAnalysis.hasEnvExample) {
      setup += `### Environment Setup\n\n\`\`\`bash\ncp .env.example .env\n# Edit .env with your values\n\`\`\`\n\n`;
    }

    if (treeAnalysis.hasMigrations && installMethod) {
      const migrateCmd = installMethod.type === "npm" ? "npm run db:migrate" :
        installMethod.type === "poetry" ? "poetry run alembic upgrade head" :
        installMethod.type === "go" ? "# run migration tool" :
        installMethod.type === "pip" ? "alembic upgrade head" : null;
      if (migrateCmd) setup += `### Database Migrations\n\n\`\`\`bash\n${migrateCmd}\n\`\`\`\n\n`;
    }
  }

  if (treeAnalysis.hasMakefile) {
    setup += `> **Note:** A \`Makefile\` is present. Run \`make help\` (if available) or inspect \`Makefile\` for available targets.\n\n`;
  }

  // ── SCRIPTS REFERENCE ─────────────────────────────────────────────────────
  let commandsRef = "";
  if (keyScripts.length > 0) {
    commandsRef += `### NPM / Package Manager Scripts\n\n| Script | Command | Purpose |\n|--------|---------|--------|\n`;
    for (const s of keyScripts) {
      const runCmd = pm === "npm" && !["start", "test"].includes(s.name)
        ? `npm run ${s.name}`
        : pm === "pnpm" ? `pnpm ${s.name}`
        : pm === "yarn" ? `yarn ${s.name}`
        : pm === "bun" ? `bun run ${s.name}`
        : `npm run ${s.name}`;
      commandsRef += `| \`${s.name}\` | \`${runCmd}\` | \`${s.cmd.slice(0, 60)}${s.cmd.length > 60 ? "…" : ""}\` |\n`;
    }
    commandsRef += "\n";
  }

  if (installMethod?.dev || installMethod?.start || installMethod?.build || installMethod?.test) {
    commandsRef += `### Quick Reference\n\n\`\`\`bash\n`;
    if (installMethod.dev) commandsRef += `# Start dev server\n${installMethod.dev}\n\n`;
    if (installMethod.start && !installMethod.dev) commandsRef += `# Start\n${installMethod.start}\n\n`;
    if (installMethod.build) commandsRef += `# Build for production\n${installMethod.build}\n\n`;
    if (installMethod.test) commandsRef += `# Run tests\n${installMethod.test}\n`;
    commandsRef += `\`\`\`\n\n`;
  }

  if (installMethod?.type === "go") {
    commandsRef += `\`\`\`bash\ngo mod download  # Install dependencies\ngo run .         # Run\ngo build -o app . # Build\ngo test ./...    # Test\n\`\`\`\n\n`;
  }
  if (installMethod?.type === "cargo") {
    commandsRef += `\`\`\`bash\ncargo run        # Run\ncargo build --release # Build\ncargo test       # Test\ncargo clippy     # Lint\ncargo fmt        # Format\n\`\`\`\n\n`;
  }

  // ── ENV VARS ──────────────────────────────────────────────────────────────
  let envSection = "";
  if (envVars.length > 0) {
    envSection += `Environment variables are defined in \`.env.example\`. Copy it to \`.env\` before running:\n\n`;
    envSection += `\`\`\`bash\ncp .env.example .env\n\`\`\`\n\n`;
    envSection += `| Variable | Example Value | Notes |\n|----------|---------------|-------|\n`;
    for (const v of envVars) {
      envSection += `| \`${v.key}\` | \`${v.example || "…"}\` | ${v.isComment ? "_(commented out)_" : ""} |\n`;
    }
    envSection += "\n";
  } else if (treeAnalysis.hasEnvExample) {
    envSection += `A \`.env.example\` file exists. Copy it to \`.env\` and fill in the required values.\n\n`;
  }

  // ── TESTING ───────────────────────────────────────────────────────────────
  let testingSection = "";
  if (treeAnalysis.hasTests) {
    testingSection += `This project **has tests**.\n\n`;
    if (installMethod?.test) {
      testingSection += `\`\`\`bash\n${installMethod.test}\n\`\`\`\n\n`;
    }
    if (treeAnalysis.testFiles.length > 0) {
      testingSection += `### Test locations\n\n${treeAnalysis.testFiles.map(f => `- \`${f}\``).join("\n")}\n\n`;
    }
    const testFw = frameworks.filter(f => ["Jest", "Vitest", "Playwright", "Cypress", "Testing Library", "PyTest"].join(",").includes(f));
    if (testFw.length > 0) {
      testingSection += `### Testing frameworks\n\n${testFw.map(f => `- ${f}`).join("\n")}\n\n`;
    }
    testingSection += `> **For AI agents:** Always run tests before and after significant changes. Do not break existing tests.\n\n`;
  } else {
    testingSection += `> **Note:** No test files detected. If adding tests, check the existing tech stack to use the right testing framework.\n\n`;
  }

  // ── CODE STYLE ────────────────────────────────────────────────────────────
  let codeStyleSection = "";
  if (treeAnalysis.lintTools.length > 0) {
    codeStyleSection += `### Linting & Formatting Tools\n\n${treeAnalysis.lintTools.map(t => `- **${t}**`).join("\n")}\n\n`;
    if (treeAnalysis.lintTools.includes("ESLint")) {
      codeStyleSection += `Run ESLint:\n\`\`\`bash\n${pm === "npm" ? "npx eslint ." : `${pm} eslint .`}\n\`\`\`\n\n`;
    }
    if (treeAnalysis.lintTools.includes("Prettier")) {
      codeStyleSection += `Run Prettier:\n\`\`\`bash\n${pm === "npm" ? "npx prettier --write ." : `${pm} prettier --write .`}\n\`\`\`\n\n`;
    }
    if (treeAnalysis.lintTools.includes("Black")) {
      codeStyleSection += `Format Python:\n\`\`\`bash\nblack .\n\`\`\`\n\n`;
    }
    if (treeAnalysis.lintTools.includes("Ruff")) {
      codeStyleSection += `Run Ruff:\n\`\`\`bash\nruff check . --fix\nruff format .\n\`\`\`\n\n`;
    }
  }
  if (commitStyle) {
    codeStyleSection += `### Commit Convention\n\nThis project uses **${commitStyle}**.\n\nFormat: \`type(scope): description\`\n\nCommon types: \`feat\`, \`fix\`, \`docs\`, \`style\`, \`refactor\`, \`test\`, \`chore\`\n\n`;
  }

  // ── CI/CD ─────────────────────────────────────────────────────────────────
  let ciSection = "";
  if (treeAnalysis.hasCi) {
    ciSection += `CI/CD is configured for this repository.\n\n`;
    if (workflowList.length > 0) {
      ciSection += `### GitHub Actions Workflows\n\n| Workflow | File |\n|----------|------|\n`;
      for (const w of workflowList) {
        ciSection += `| ${w.name} | \`.github/workflows/${w.file}\` |\n`;
      }
      ciSection += "\n";
    }
    ciSection += `> **For AI agents:** Do not modify workflow files unless the task specifically requires it. Check that CI passes before considering a task complete.\n\n`;
  }

  // ── BRANCHES & GIT WORKFLOW ───────────────────────────────────────────────
  let gitSection = "";
  gitSection += `**Default branch:** \`${defaultBranch}\`\n\n`;
  if (branches.length > 1) {
    const otherBranches = branches.filter(b => b !== defaultBranch).slice(0, 10);
    gitSection += `**Other active branches:** ${otherBranches.map(b => `\`${b}\``).join(", ")}\n\n`;
  }
  if (commitStyle) {
    gitSection += `**Commit style:** ${commitStyle}\n\n`;
  }
  if (treeAnalysis.hasPRTemplate) {
    gitSection += `A **pull request template** is configured (see \`.github/pull_request_template.md\`).\n\n`;
  }
  if (treeAnalysis.hasIssueTemplates) {
    gitSection += `**Issue templates** are available in \`.github/ISSUE_TEMPLATE/\`.\n\n`;
  }
  gitSection += `> **For AI agents:** Always create feature branches from \`${defaultBranch}\`. Never commit directly to the default branch unless specifically instructed.\n\n`;

  // ── CONTRIBUTORS ─────────────────────────────────────────────────────────
  let contribSection = "";
  if (contributors.length > 0) {
    contribSection += `${contributors.length} contributor${contributors.length !== 1 ? "s" : ""} have contributed to this repository.\n\n`;
    const topContribs = contributors.slice(0, 8);
    contribSection += `| Contributor | Contributions |\n|-------------|---------------|\n`;
    for (const c of topContribs) {
      const login = c.login || "anonymous";
      const url = c.html_url || `https://github.com/${login}`;
      contribSection += `| [@${login}](${url}) | ${c.contributions} |\n`;
    }
    contribSection += "\n";
  }
  if (treeAnalysis.hasContributing) {
    contribSection += `A **CONTRIBUTING.md** file is present. Please read it before submitting contributions.\n\n`;
  }

  // ── OPEN ISSUES ───────────────────────────────────────────────────────────
  let issuesSection = "";
  if (openIssues.length > 0) {
    issuesSection += `| # | Title | Labels |\n|---|-------|--------|\n`;
    for (const i of openIssues.slice(0, 8)) {
      const labels = (i.labels || []).map(l => `\`${l.name}\``).join(" ") || "—";
      issuesSection += `| [#${i.number}](${i.html_url}) | ${i.title.slice(0, 70)} | ${labels} |\n`;
    }
    issuesSection += "\n";
    if (openPRs.length > 0) {
      issuesSection += `### Open Pull Requests\n\n`;
      for (const pr of openPRs.slice(0, 5)) {
        issuesSection += `- [#${pr.number}](${pr.html_url}) — ${pr.title.slice(0, 70)}\n`;
      }
      issuesSection += "\n";
    }
  }

  // ── EXISTING AI CONFIG ────────────────────────────────────────────────────
  let aiConfigSection = "";
  const existing = [];
  if (treeAnalysis.hasClaudemd) existing.push("- `CLAUDE.md` — Claude-specific instructions are present in this repo");
  if (treeAnalysis.hasAgentsmd) existing.push("- `AGENTS.md` — An AGENTS.md file already exists (this file is replacing/updating it)");
  if (treeAnalysis.hasCursorRules) existing.push("- `.cursorrules` or `.cursor/rules` — Cursor AI rules are configured");
  if (treeAnalysis.hasWindsurfRules) existing.push("- `.windsurfrules` — Windsurf AI rules are configured");
  if (treeAnalysis.hasCopilotInstructions) existing.push("- `.github/copilot-instructions.md` — GitHub Copilot instructions are present");
  if (existing.length > 0) {
    aiConfigSection += `The following AI configuration files already exist in this repository:\n\n${existing.join("\n")}\n\n`;
    aiConfigSection += `> **Note:** This AGENTS.md is the canonical source for AI agent instructions. Cross-reference the above files for tool-specific overrides.\n\n`;
  } else {
    aiConfigSection += `No existing AI configuration files were found in this repository. This \`AGENTS.md\` is the primary AI context file.\n\n`;
  }

  // ── DOCS / ARCHITECTURE NOTES ─────────────────────────────────────────────
  let docsSection = "";
  if (treeAnalysis.hasDocs || treeAnalysis.docFiles.length > 0) {
    if (treeAnalysis.docFiles.length > 0) {
      docsSection += `Documentation files found:\n\n${treeAnalysis.docFiles.map(f => `- [\`${f}\`](${f})`).join("\n")}\n\n`;
    }
    if (treeAnalysis.hasApiDocs) {
      docsSection += `API documentation (OpenAPI/Swagger) is present. Check \`docs/\`, \`openapi.yaml\`, or \`swagger.json\`.\n\n`;
    }
  }
  if (treeAnalysis.hasStorybook) {
    docsSection += `**Storybook** is configured. Run \`${pm} storybook\` to view component documentation.\n\n`;
  }

  // ── SPECIAL FEATURES ─────────────────────────────────────────────────────
  const specialNotes = [];
  if (treeAnalysis.hasMonorepo) specialNotes.push("This is a **monorepo** — coordinate changes across packages carefully.");
  if (treeAnalysis.hasI18n) specialNotes.push("**Internationalization (i18n)** is set up. Maintain translation files when adding user-facing text.");
  if (treeAnalysis.hasSeeds) specialNotes.push("**Database seed files** exist in `seeds/` or `fixtures/`. Use them to populate development data.");
  if (treeAnalysis.hasExamples) specialNotes.push("**Example code** lives in `examples/` or `demo/`. Keep examples up to date when APIs change.");
  if (treeAnalysis.hasScripts) specialNotes.push("**Utility scripts** are in `scripts/` or `bin/`. Review before running — they may modify state.");
  if (treeAnalysis.hasHelm) specialNotes.push("**Helm charts** are present. Kubernetes deployment is managed via Helm.");
  if (treeAnalysis.hasTerraform) specialNotes.push("**Terraform** infrastructure code is present. Never apply changes without review.");
  if (treeAnalysis.hasDocker) specialNotes.push("**Docker** configuration is present. Use `docker-compose up` (or check `docker-compose.yml`) for local services.");
  if (installMethod?.type === "bun") specialNotes.push("**Bun** is the package manager. Do not use npm/yarn/pnpm commands.");
  if (installMethod?.type === "pnpm") specialNotes.push("**pnpm** is the package manager. Do not use npm/yarn commands.");

  // ── INSTRUCTIONS FOR AI AGENTS ────────────────────────────────────────────
  const agentInstructions = `This section provides explicit instructions for AI coding agents (Claude Code, ChatGPT, Cursor, Copilot, Gemini, etc.) working on this repository.

### General Rules

1. **Read this file in full** before starting any task in this repository.
2. **Understand the tech stack** (see [Tech Stack](#tech-stack)) before generating code. Use only the frameworks and libraries already in the project unless explicitly asked to add new ones.
3. **Follow the existing code style.** Look at existing files before writing new code. Match naming conventions, indentation, import style, and module patterns.
4. **Never break tests.** Run the test suite before and after changes (if CI/test setup exists). See [Testing](#testing).
5. **Respect the environment.** Use \`.env\` for secrets. Never hardcode credentials, API keys, or sensitive values.
6. **Commit hygiene.** ${commitStyle ? `Use **${commitStyle}** format for commit messages.` : "Write clear, descriptive commit messages."}
7. **Branch strategy.** Work on feature branches. Default branch is \`${defaultBranch}\`.
${treeAnalysis.hasMonorepo ? "8. **Monorepo awareness.** Understand which package/app you're modifying. Changes in one package may affect others." : ""}

### Before Starting a Task

- [ ] Understand what the task is asking
- [ ] Identify which files/directories are relevant (see [Architecture](#architecture--project-structure))
- [ ] Check if relevant tests exist
- [ ] Check if environment variables are needed (see [Environment Variables](#environment-variables))
- [ ] Understand the install/run workflow (see [Setup & Commands](#setup--commands))

### When Writing Code

- Match the **import style** of existing files (named vs default exports, relative vs absolute paths)
- Use the **same formatting** as surrounding code — check for Prettier, ESLint, Black, Ruff, gofmt, etc.
- ${topLang === "TypeScript" ? "**TypeScript:** Do not use `any` unless absolutely necessary. Use proper types and interfaces." : ""}
- ${topLang === "Python" ? "**Python:** Follow PEP 8. Use type hints where the codebase uses them." : ""}
- ${topLang === "Go" ? "**Go:** Run `go fmt` and `go vet` on your changes. Follow standard Go patterns." : ""}
- ${topLang === "Rust" ? "**Rust:** Run `cargo fmt` and `cargo clippy` before committing. Avoid `unwrap()` in library code." : ""}
- If adding a new dependency, justify why it's needed and check for existing alternatives already in the project

### When Making Changes

- **Small, focused changes** — one concern per commit
- **Update tests** if your change affects behavior
- **Update documentation** if your change affects public APIs or user-facing behavior
- Do **not** refactor unrelated code as part of a feature or bug fix
- Do **not** change config files (.eslintrc, tsconfig.json, etc.) unless the task requires it

### Forbidden Actions (unless explicitly instructed)

- ❌ Do not delete or rename core config files
- ❌ Do not change the package manager (${pm})
- ❌ Do not upgrade major versions of dependencies
- ❌ Do not modify CI/CD workflow files
- ❌ Do not add new linting rules or formatter configs
- ❌ Do not commit directly to \`${defaultBranch}\`
- ❌ Do not expose secrets, tokens, or passwords in code or commits
${treeAnalysis.hasDocker ? "- ❌ Do not modify `Dockerfile` or `docker-compose.yml` without explicit request" : ""}
${treeAnalysis.hasTerraform ? "- ❌ Do not modify Terraform files without explicit request" : ""}`;

  // ── TOOL-SPECIFIC GUIDANCE ────────────────────────────────────────────────
  const toolGuidance = `Different AI coding tools use this file differently. Here's what's relevant for each:

### Claude (Anthropic)
Claude reads \`AGENTS.md\` and \`CLAUDE.md\` at the start of each session. This file is authoritative.
- Use \`/project:…\` slash commands if configured
- Claude Code automatically runs build/test commands if instructed

### GitHub Copilot
Copilot reads \`.github/copilot-instructions.md\` for custom instructions. This \`AGENTS.md\` provides broader context.
- Copilot will suggest completions based on surrounding code — consistent style matters

### Cursor
Cursor reads \`.cursorrules\` and \`.cursor/rules\`. ${treeAnalysis.hasCursorRules ? "Rules are configured in this repo." : "No Cursor rules file found — Cursor will use this AGENTS.md for context if explicitly referenced."}
- Use \`@AGENTS.md\` in Cursor chat to reference this file

### ChatGPT / OpenAI
When using ChatGPT for this codebase, paste relevant sections of this file into the conversation or reference it.
- Include the Tech Stack and Architecture sections for context

### Aider
Aider reads \`AGENTS.md\` automatically. All instructions in this file apply.
- Run: \`aider --model <model> --read AGENTS.md\`

### Other tools (Windsurf, Continue, etc.)
Reference this file explicitly in your tool's system prompt or context window.`;

  // ── ASSEMBLE THE DOCUMENT ──────────────────────────────────────────────────
  const timestamp = new Date().toISOString().split("T")[0];

  const parts = [
    // Header
    `# AGENTS.md — ${repoName}`,
    `> AI agent instructions for [\`${repoFullName}\`](https://github.com/${repoFullName})\n>\n> Generated by [agents-md-gen](https://github.com/eliekh05/agents-md-gen) · ${timestamp}`,

    // Table of contents
    `## Table of Contents

1. [Overview](#overview)
2. [Tech Stack](#tech-stack)
3. [Architecture & Project Structure](#architecture--project-structure)
4. [Setup & Commands](#setup--commands)
5. [Scripts Reference](#scripts-reference)
6. [Environment Variables](#environment-variables)
7. [Testing](#testing)
8. [Code Style & Conventions](#code-style--conventions)
9. [CI/CD](#cicd)
10. [Git Workflow](#git-workflow)
11. [Documentation](#documentation)
12. [Open Issues](#open-issues)
13. [Contributors](#contributors)
14. [Existing AI Configuration](#existing-ai-configuration)
15. [Special Notes](#special-notes)
16. [Instructions for AI Agents](#instructions-for-ai-agents)
17. [Tool-Specific Guidance](#tool-specific-guidance)`,

    section("Overview", overviewContent),
    section("Tech Stack", techStack),
    section("Architecture & Project Structure", architecture),
    section("Setup & Commands", setup),
    section("Scripts Reference", commandsRef),
    section("Environment Variables", envSection || "> No environment variable configuration detected.\n"),
    section("Testing", testingSection),
    section("Code Style & Conventions", codeStyleSection || "> No linting or formatting configuration detected.\n"),
    section("CI/CD", ciSection || "> No CI/CD configuration detected.\n"),
    section("Git Workflow", gitSection),
    section("Documentation", docsSection || "> No documentation directory detected. Check inline code comments.\n"),
    section("Open Issues", issuesSection || "> No open issues.\n"),
    section("Contributors", contribSection || "> No contributors found.\n"),
    section("Existing AI Configuration", aiConfigSection),
    specialNotes.length > 0 ? section("Special Notes", specialNotes.map(n => `- ${n}`).join("\n")) : "",
    section("Instructions for AI Agents", agentInstructions),
    section("Tool-Specific Guidance", toolGuidance),

    // Footer
    `---\n\n_This file was automatically generated by [agents-md-gen](https://github.com/eliekh05/agents-md-gen) on ${timestamp}. Review and customize it for your project's needs._`,
  ];

  return parts.filter(Boolean).join("\n\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

// ── SSE helpers ──────────────────────────────────────────────────────────────
const sse = data => `data: ${JSON.stringify(data)}\n\n`;
const corsHeaders = () => ({
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "X-Content-Type-Options": "nosniff",
});

// ── Worker ───────────────────────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers: corsHeaders() });

    if (url.pathname === "/health")
      return new Response(JSON.stringify({ ok: true, service: "agents-md-gen" }), {
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      });

    if (url.pathname !== "/generate" || request.method !== "POST")
      return new Response("Not found", { status: 404, headers: corsHeaders() });

    let body;
    try { body = await request.json(); }
    catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400, headers: { ...corsHeaders(), "Content-Type": "application/json" },
      });
    }

    const rawOwner = (body.owner || "").trim();
    const rawRepo  = (body.repo  || "").trim();

    if (!rawOwner || !rawRepo)
      return new Response(JSON.stringify({ error: "owner and repo are required" }), {
        status: 400, headers: { ...corsHeaders(), "Content-Type": "application/json" },
      });

    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,98}$/.test(rawOwner) ||
        !/^[a-zA-Z0-9._-]{1,100}$/.test(rawRepo))
      return new Response(JSON.stringify({ error: "Invalid owner or repo name" }), {
        status: 400, headers: { ...corsHeaders(), "Content-Type": "application/json" },
      });

    const token = body.token || env.GITHUB_TOKEN || "";

    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const enc    = new TextEncoder();
    const send   = async d => writer.write(enc.encode(sse(d)));

    (async () => {
      try {
        // Step 1: Repo metadata
        await send({ type: "progress", step: "repo", message: `Fetching ${rawOwner}/${rawRepo}…` });
        const repoData = await ghGet(`${GH_API}/repos/${rawOwner}/${rawRepo}`, token);

        // Step 2: File tree
        await send({ type: "progress", step: "tree", message: "Reading full file tree…" });
        const fullTree = await fetchTree(rawOwner, rawRepo, token);

        // Step 3: Parallel data fetch
        await send({ type: "progress", step: "data", message: "Fetching languages, contributors, branches…" });
        const [languages, contributors, workflows, branches, commits, openIssues, openPRs, topics] =
          await Promise.all([
            fetchLanguages(rawOwner, rawRepo, token),
            fetchContributors(rawOwner, rawRepo, token),
            fetchWorkflows(rawOwner, rawRepo, token),
            fetchBranches(rawOwner, rawRepo, token),
            fetchCommits(rawOwner, rawRepo, token),
            fetchIssues(rawOwner, rawRepo, token),
            fetchPRs(rawOwner, rawRepo, token),
            fetchTopics(rawOwner, rawRepo, token),
          ]);

        // Step 4: Read manifest files
        await send({ type: "progress", step: "manifests", message: "Reading manifest & config files…" });
        const [
          pkg, req, gomod, cargo, pyproject,
          gemfile, composerJson, envExample,
        ] = await Promise.all([
          fetchFile(rawOwner, rawRepo, "package.json", token),
          fetchFile(rawOwner, rawRepo, "requirements.txt", token),
          fetchFile(rawOwner, rawRepo, "go.mod", token),
          fetchFile(rawOwner, rawRepo, "Cargo.toml", token),
          fetchFile(rawOwner, rawRepo, "pyproject.toml", token),
          fetchFile(rawOwner, rawRepo, "Gemfile", token),
          fetchFile(rawOwner, rawRepo, "composer.json", token),
          fetchFile(rawOwner, rawRepo, ".env.example", token)
            .then(r => r || fetchFile(rawOwner, rawRepo, ".env.sample", token))
            .then(r => r || fetchFile(rawOwner, rawRepo, ".env.template", token)),
        ]);

        // Step 5: Detect stack
        await send({ type: "progress", step: "stack", message: "Detecting frameworks and tools…" });
        const found = new Set();
        const pkgMeta = detectFromPackageJson(pkg, found) || {};
        detectFromContent(req, found);
        detectFromContent(gomod, found);
        detectFromContent(cargo, found);
        detectFromContent(pyproject, found);
        detectFromContent(gemfile, found);
        detectFromContent(composerJson, found);

        const treeAnalysis = analyzeTree(fullTree);
        if (treeAnalysis.hasDocker) found.add("Docker");
        if (treeAnalysis.hasKubernetes) found.add("Kubernetes");
        if (treeAnalysis.hasTerraform) found.add("Terraform");
        if (treeAnalysis.hasHelm) found.add("Helm");
        if (treeAnalysis.hasCi) found.add("GitHub Actions");

        const frameworks = [...found].sort();
        const installMethod = detectInstallMethod(fullTree, pkg, req, gomod, cargo, gemfile, composerJson);
        const projectType = inferProjectType(repoData, fullTree, frameworks, languages, pkgMeta);
        const commitStyle = detectCommitStyle(commits);

        // Step 6: Build
        await send({ type: "progress", step: "building", message: "Building AGENTS.md…" });
        const agentsMd = buildAgentsMd({
          repo: repoData,
          owner: rawOwner,
          languages,
          frameworks,
          contributors,
          topics,
          workflows,
          treeAnalysis,
          pkgMeta,
          installMethod,
          projectType,
          fullTree,
          commits,
          branches,
          openIssues,
          openPRs,
          envExample,
          gomod,
          cargo,
          composerContent: composerJson,
          commitStyle,
        });

        await send({
          type: "done",
          agents_md: agentsMd,
          meta: {
            projectType,
            language: repoData.language,
            frameworks,
            languages: Object.keys(languages),
            contributors: contributors.length,
            stars: repoData.stargazers_count,
            hasTests: treeAnalysis.hasTests,
            hasCi: treeAnalysis.hasCi,
            hasDocker: treeAnalysis.hasDocker,
            totalFiles: treeAnalysis.totalFiles,
            packageManager: treeAnalysis.packageManager || installMethod?.type,
            lintTools: treeAnalysis.lintTools,
            commitStyle,
          },
        });

      } catch (err) {
        await send({ type: "error", message: err.message || "Unknown error" });
      } finally {
        await writer.close();
      }
    })();

    return new Response(readable, {
      headers: {
        ...corsHeaders(),
        "Content-Type":      "text/event-stream",
        "Cache-Control":     "no-cache",
        "X-Accel-Buffering": "no",
      },
    });
  },
};
