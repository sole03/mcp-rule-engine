# MCP Rule Engine — Cognition Engine & Trust Governance Layer

![build](https://img.shields.io/badge/build-passing-brightgreen)
![coverage](https://img.shields.io/badge/coverage-95%25-brightgreen)
![npm](https://img.shields.io/badge/npm-v1.0.0--alpha.2-orange)
![MCP](https://img.shields.io/badge/MCP_v1.29.0-compliant-blue)
[![License](https://img.shields.io/badge/license-Apache_2.0-blue)](LICENSE)
[![Trademark Policy](https://img.shields.io/badge/trademark-policy-orange)](TRADEMARK.md)

> A production-grade MCP server that combines a cognition graph engine with a trusted governance layer. Provides intelligent code pattern matching, AST-level constraint validation, and auditable injection approval for AI agents.

<!-- TEMP_BANNER_REMOVE_AFTER_2W -->
> **📢 Protocol Update:** We have adopted Apache 2.0 licensing with a formal trademark policy. [Read the announcement →](DISCUSSION_ANNOUNCEMENT.md)
<!-- /TEMP_BANNER -->

---



## The Problem It Solves

AI Agents are powerful but chaotic. They generate code confidently, yet they lack a persistent *cognition layer* to remember project-specific patterns across sessions, and they lack a *governance layer* to enforce security boundaries on their own output. Without these, every agent session starts from zero — repeating the same mistakes, ignoring your team's conventions, and producing code that looks plausible but violates project invariants.

This engine fixes that. It gives agents a **long-term graph memory** of project patterns (what works, what's forbidden, what's idiomatic in *this* codebase) and a **trusted approval workflow** so every injection is reviewed, audited, and accountable.

---

## Core Features

- **Cognition Graph Engine** — Intent recognition, weighted graph traversal, and AST constraint solving for intelligent code analysis
- **Trust Governance** — Three-tier knowledge base with injection approval workflow, TTL-based proposals, and audit logging
- **Universal Connectivity** — Stdio (local) and Streamable HTTP (remote) transports with full MCP lifecycle support
- **Agent Hard Constraints** — Output schema enforcement with \`validationRequired\` auto-validation; non-compliant agent responses intercepted
- **Hot Config Updates** — Dynamic threshold tuning with expert mode authorization and version chain tracking

---

## Architecture

\`\`\`mermaid
flowchart LR
    Agent["AI Agent (Cursor / Claude / Cline)"]
    MCP["MCP Server (stdio / HTTP)"]
    CV["Constraint Validator"]
    GT["Graph Traverser"]
    IA["Injection Approval"]
    FL["Feedback Loop"]
    DB[("SQLite / Prisma")]

    Agent -->|tools/list → tools/call| MCP
    MCP -->|cognition_validate| CV
    MCP -->|cognition_query| GT
    MCP -->|cognition_approve_injection| IA
    MCP -->|cognition_feedback| FL
    CV -->|parse + validate| GT
    GT -->|weighted BFS| DB
    IA -->|TTL proposal| DB
    FL -->|update weights| DB
    DB -->|graph data| GT
\`\`\`

---

## Quick Start

### Prerequisites

- Node.js >= 18
- npm >= 9

### Setup

\`\`\`bash
git clone <repo-url> && cd governflow
npm install
npx prisma db push
npm run build
\`\`\`

### Start Server

\`\`\`bash
# Stdio mode (default)
node dist/index.js

# HTTP mode
TRANSPORT=http PORT=3000 node dist/index.js
\`\`\`

---

## MCP Integration

### Cursor

Add to \`.cursor/mcp.json\`:

\`\`\`json
{
  "mcpServers": {
    "cognition-engine": {
      "command": "node",
      "args": ["dist/cli.js"],
      "env": { "DATABASE_URL": "file:./dev.db" }
    }
  }
}
\`\`\`

### Claude Desktop

Add to \`claude_desktop_config.json\`:

\`\`\`json
{
  "mcpServers": {
    "cognition-engine": {
      "command": "node",
      "args": ["path/to/governflow/dist/cli.js"],
      "env": { "DATABASE_URL": "file:./dev.db" }
    }
  }
}
\`\`\`

### VS Code (GitHub Copilot Chat / VS Code MCP Extension)

Add to your VS Code settings (User \`settings.json\` or workspace \`.vscode/mcp.json\`):

\`\`\`json
{
  "mcp": {
    "servers": {
      "cognition-engine": {
        "type": "stdio",
        "command": "node",
        "args": ["dist/cli.js"],
        "env": { "DATABASE_URL": "file:./dev.db" }
      }
    }
  }
}
\`\`\`

### Cline / Roo Code (HTTP)

\`\`\`json
{
  "mcpServers": {
    "cognition-engine": {
      "url": "http://localhost:3000",
      "transport": "streamable-http"
    }
  }
}
\`\`\`

---

## Trust Governance Protocol

### Three-Tier Knowledge

| Tier | Scope | Node Type | Validation |
|------|-------|-----------|------------|
| Global | Universal patterns | NegativeConstraint = REJECT | Hard block |
| Project | Project conventions | PositiveConstraint = WARN | Soft warning |
| Reuse | Cross-project patterns | Intent + Heuristic | Weight-based |

### Injection Proposal State Machine

\`\`\`mermaid
stateDiagram-v2
    [*] --> PENDING: cognition_query triggers implicit proposal
    PENDING --> APPROVED: cognition_approve_injection(proposalId, APPROVE)
    PENDING --> REJECTED: cognition_approve_injection(proposalId, REJECT)
    PENDING --> OVERRIDDEN: cognition_approve_injection(proposalId, OVERRIDE)
    PENDING --> EXPIRED: TTL = 5 min elapsed
    APPROVED --> [*]: Rules injected into graph
    REJECTED --> [*]: Proposal discarded
    OVERRIDDEN --> [*]: Force-injected (audit logged)
    EXPIRED --> [*]: -32602 Proposal Expired + retryable:true
\`\`\`

Proposals are in-memory with a 5-minute TTL. Concurrent proposals for the same context hash return the existing proposal to prevent conflicts. Expired proposals return \`-32602 Proposal Expired\` with \`retryable: true\`.

### Constraint Validation Dual-Mode

- **REJECT (Hard Block)** — Returned as \`-32602\` + \`ruleId\`. Agent must stop.
- **WARN (Soft Warning)** — Returned as violation. Agent may continue with user confirmation.

### Config Hot Update

Dynamic thresholds (similarity 0.7 / 0.9) are stored as \`CognitionNode(type=HEURISTIC)\`. Each update creates a new version node with the old node marked \`supersededBy\`. Requires \`expertMode: true\`.

### Audit & Compliance

All injection decisions, config changes, and validation events are recorded via \`MetricEvent\` with async non-blocking writes. On database write failure, events fall back to \`logs/fallback.log\`.

---

## MCP Resources

| URI | Type | Content |
|-----|------|---------|
| \`cognition://schema\` | application/json | Cognition graph data model |
| \`cognition://stats\` | application/json | Node/edge counts + approvalRate7d |
| \`cognition://docs\` | text/markdown | Full tool documentation |
| \`cognition://rules-changelog\` | application/json | Versioned rule change log |

---

## MCP Tools

| Tool | Description | readOnlyHint |
|------|-------------|:---:|
| \`cognition_query\` | Query graph by context hash | ✅ |
| \`cognition_validate\` | Validate code against AST templates | ✅ |
| \`cognition_feedback\` | Provide feedback to refine traversal | ❌ |
| \`cognition_approve_injection\` | Approve/reject proposals with TTL | ❌ |
| \`cognition_update_config\` | Hot-update thresholds (expert mode) | ❌ |

---

## Testing

\`\`\`bash
# Run all tests (118/118 passing)
npm test

# Run specific suite
npx vitest run tests/protocol/
\`\`\`

---

## Protocol Compliance

This server conforms to **MCP Specification v1.29.0** and supports:

- [x] initialize / initialized / ping / shutdown lifecycle
- [x] tools/list + tools/call with JSON Schema input/output
- [x] resources/list + resources/read with \`cognition://\` URI scheme
- [x] StdioServerTransport and StreamableHTTPServerTransport
- [x] Error codes: -32602 (invalid params), -32603 (internal), -32001 (timeout)
- [x] Annotations: readOnlyHint, destructiveHint, openWorldHint

---

## Contributing

We welcome contributions from the community! Here's how you can get involved:

- **Report a bug**: Open an [issue](../../issues/new?labels=bug) with reproduction steps.
- **Suggest a feature**: Start a [discussion](../../discussions) to gather feedback before implementation.
- **Submit a PR**: Follow the guidelines in [CONTRIBUTING.md](CONTRIBUTING.md).

For major changes, please open an issue first to discuss what you would like to change.

### 🟢 New to the project?

Looking for a place to start? Check out our [Good First Issues](../../issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) — they're specifically scoped for first-time contributors and include detailed context, acceptance criteria, and file references.

---

## License

Copyright (c) 2026 熊高锐

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

Full license text: [LICENSE](LICENSE).

