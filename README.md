# AI Educational Content Pipeline

A full-stack web application implementing a multi-agent AI workflow that generates, reviews, and refines grade-appropriate educational content using OpenAI GPT-4o.

## What It Does

The app orchestrates two AI agents in sequence:

1. **Generator Agent** — Given a grade level (1–12) and a topic, generates a grade-appropriate explanation and 4 multiple-choice questions (MCQs) with structured JSON output.
2. **Reviewer Agent** — Evaluates the generated content for age appropriateness, conceptual correctness, and clarity. Returns a `pass` or `fail` status with specific feedback.
3. **Refinement Logic** — If the Reviewer returns `fail`, the Generator is automatically re-run once with the feedback embedded in its prompt context. This is limited to **one refinement pass**.

All intermediate outputs (initial generation, reviewer feedback, refined output) are stored in the database and displayed in the UI.

---

## Agent Pipeline Architecture

```
User Input (grade + topic)
        │
        ▼
┌───────────────────┐
│  Generator Agent  │  → GPT-4o (json_object mode)
│  (gpt-4o)         │  → Produces: explanation + 4 MCQs
└───────────────────┘
        │
        ▼
┌───────────────────┐
│  Reviewer Agent   │  → GPT-4o (json_object mode, temp=0.3)
│  (gpt-4o)         │  → Produces: status (pass/fail) + feedback[]
└───────────────────┘
        │
        ├─ [pass] → Store result, return to UI
        │
        └─ [fail] → Re-run Generator with feedback context (max 1 pass)
                          │
                          ▼
                 ┌───────────────────┐
                 │ Refined Generator │ → Improved content
                 └───────────────────┘
                          │
                          ▼
                   Store + return to UI
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Vite + TypeScript |
| UI Components | shadcn/ui + Tailwind CSS |
| State / Data Fetching | TanStack React Query (auto-generated hooks) |
| Backend API | Express 5 + TypeScript (Node.js) |
| AI Agents | OpenAI GPT-4o via `openai` SDK |
| Database | PostgreSQL + Drizzle ORM |
| API Contract | OpenAPI 3.1 → Orval codegen |
| Monorepo | pnpm workspaces |

---

## Project Structure

```
artifacts/
  api-server/          — Express API server
    src/
      lib/agents.ts    — Generator Agent, Reviewer Agent, Pipeline Orchestrator
      routes/
        pipeline.ts    — POST /api/pipeline/run, GET /api/pipeline/runs, GET /api/pipeline/runs/:id
  edu-pipeline/        — React + Vite frontend
    src/
      App.tsx          — App shell with routing
      pages/           — Main pipeline runner page

lib/
  api-spec/
    openapi.yaml       — OpenAPI 3.1 contract (source of truth)
  api-client-react/    — Auto-generated React Query hooks (do not edit)
  api-zod/             — Auto-generated Zod validation schemas (do not edit)
  db/
    src/schema/
      pipelineRuns.ts  — Drizzle schema for pipeline_runs table
```

---

## How to Run

### Prerequisites

- Node.js 20+
- pnpm (`npm install -g pnpm`)
- PostgreSQL database (or use Replit's built-in DB)
- OpenAI API key

### Environment Variables

Create a `.env` file (or set these in your environment):

```env
DATABASE_URL=postgresql://user:password@localhost:5432/mydb
OPENAI_API_KEY=sk-...
```

### Install Dependencies

```bash
pnpm install
```

### Push Database Schema

```bash
pnpm --filter @workspace/db run push
```

### Run Development Servers

**API Server (port 8080 by default):**
```bash
pnpm --filter @workspace/api-server run dev
```

**Frontend (port 5173 by default):**
```bash
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/edu-pipeline run dev
```

### Regenerate API Types (after spec changes)

```bash
pnpm --filter @workspace/api-spec run codegen
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/pipeline/run` | Run the full agent pipeline |
| `GET`  | `/api/pipeline/runs` | List recent pipeline runs |
| `GET`  | `/api/pipeline/runs/:id` | Get a specific run |
| `GET`  | `/api/healthz` | Health check |

### POST /api/pipeline/run

**Request:**
```json
{
  "grade": 4,
  "topic": "Types of angles"
}
```

**Response:**
```json
{
  "id": 1,
  "grade": 4,
  "topic": "Types of angles",
  "generatorOutput": {
    "explanation": "...",
    "mcqs": [
      {
        "question": "...",
        "options": [
          { "label": "A", "text": "..." },
          { "label": "B", "text": "..." },
          { "label": "C", "text": "..." },
          { "label": "D", "text": "..." }
        ],
        "answer": "B"
      }
    ]
  },
  "reviewerOutput": {
    "status": "pass",
    "feedback": []
  },
  "refinedOutput": null,
  "refinementApplied": false,
  "durationMs": 4230,
  "createdAt": "2024-01-15T10:30:00.000Z"
}
```

---

## Agent Implementation Details

### Generator Agent (`src/lib/agents.ts`)

- **Model:** `gpt-4o` with `response_format: { type: "json_object" }`
- **System prompt:** Instructs the model to produce exactly 4 MCQs, with language calibrated to the target grade
- **Refinement mode:** When reviewer feedback is provided, each feedback item is numbered and prepended to the prompt with explicit instruction to address every point

### Reviewer Agent (`src/lib/agents.ts`)

- **Model:** `gpt-4o` with `response_format: { type: "json_object" }`, `temperature: 0.3` (more deterministic)
- **Evaluation criteria:** Age appropriateness, conceptual correctness, clarity, question quality, answer correctness
- **Output:** Structured `{ status: "pass"|"fail", feedback: string[] }` with specific, actionable feedback

### Refinement Logic

```
if (reviewerOutput.status === "fail" && reviewerOutput.feedback.length > 0) {
  refinedOutput = await runGeneratorAgent(openai, grade, topic, reviewerOutput.feedback);
  refinementApplied = true;
}
// Max 1 refinement pass — no further looping
```

---

## UI Features

- **Grade selector** — Dropdown for Grade 1–12
- **Topic input** — Free-text entry with placeholder examples
- **Pipeline stages** — Three collapsible sections revealing each agent's output
- **Pass/Fail badge** — Color-coded reviewer status
- **MCQ display** — Clean card layout with highlighted correct answers
- **Refinement indicator** — Clearly flagged when a second pass was applied
- **Run history sidebar** — Recent runs with grade, topic, status, and duration; click to reload any result

---

## License

MIT
