---
name: Smart Study Guide architecture
description: Full-stack overview — React/Clerk frontend, Express API, Drizzle/Postgres, key build quirks and schema decisions
---

## Stack
- **Frontend**: `artifacts/smart-study-guide` — React 19, Vite, Clerk, Wouter, Tailwind + shadcn/ui
- **Backend**: `artifacts/api-server` — Express + Drizzle ORM + PostgreSQL, port 8080 (reads `$PORT`)
- **Shared lib**: `lib/api-zod` — Zod schemas exported from `./src/index.ts` (no compiled dist needed, exports directly from TS source)
- **Shared lib**: `lib/api-client-react` — React Query hooks auto-generated from OpenAPI spec
- **Monorepo**: pnpm workspaces, `@workspace/*` package names

## Key files
- `artifacts/api-server/src/lib/openai.ts` — AI schema + prompts
- `artifacts/api-server/src/lib/pdfService.ts` — PDF generation (PDFKit + Kalam font)
- `artifacts/api-server/src/lib/extractText.ts` — per-file OCR/text extraction
- `artifacts/api-server/src/routes/analyses.ts` — analysis lifecycle (POST, GET, retry, PDF download)
- `artifacts/smart-study-guide/src/pages/analysis-result.tsx` — results UI

## AI schema (current — flat topics)
Schema returned by `analyzeWithAI`:
- `subject`, `years_analyzed: string[]`, `overall_strategy_tip`, `related_topic_pairs: string[]`
- `topics[]`: `topic_name`, `priority`, `frequency`, `years_appeared`, `confidence_level`, `marks_weightage`, `question_type_breakdown{mcq,short,long,case_study}`, `study_note{kya_padhna_hai,kaise_poochha_jaata_hai,repeat_pattern}`, `key_terms[]`
- Prompt explicitly says 8-12 distinct, specific topics — NOT broad umbrella categories.

**Why:** Old nested `chapters → sub_topics` structure caused the model to under-segment (collapsing everything into 1-2 broad chapters). Flat list of specific topics forces the model to split topics properly.

## Backward compat pattern
`analysis-result.tsx` uses `getTopicName(t)` (falls back to `t.chapter_name`), `getPriority(t)` (falls back to `t.overall_priority`), `getFrequency(t)` (falls back to `t.total_frequency`). Question type fields: new schema uses `short/long/case_study`; UI checks both new and old (`short_answer/long_answer/numerical_or_case_study`) field names. `pdfService.ts` resolves `topics ?? (aiResult as any).chapters` and `related_topic_pairs ?? cross_chapter_patterns` for old stored analyses. Old stored PDFs already generated — no reprocessing needed.

## Zod schema for aiResponse
`lib/api-zod/src/generated/api.ts` — `aiResponse` field in both `CreateAnalysisResponse` and `GetAnalysisResponse` uses `zod.record(zod.unknown()).optional()` (intentionally loose). The AI response shape evolves; strict validation at the Zod layer causes breakage. TypeScript types live in `openai.ts` instead.

**Why:** Strict `aiResponse` Zod schema would break every time the prompt schema changes. Made it permissive.

## Text extraction for year labeling
`extractText.ts` exports `extractTextFromFilesWithLabels(filePaths)` → `{text, yearLabels}`. Each file is labeled `--- Year: Paper N ---` so the AI can track year-wise question patterns. `extractTextFromFiles` (old, unlabeled) kept for backward compat.

## PDF layout (PDFKit + Kalam font)
- Kalam/Kalam-Bold fonts at `artifacts/api-server/assets/fonts/` — embedded in binary
- Notebook ruled lines drawn on every page via `drawNotebookLines()`
- Chapter notes page order: summary table → detailed notes (sub-topics, confidence badges, year tags, question types, study note, key terms) → cross-chapter patterns → Apni Strategy Chuno tiers → Overall Strategy
- Sub-topic chip layout: name (line 1), freq + years (line 2), note (line 3+)

## Font/path anchor
`pdfService.ts` uses `import.meta.dirname` (Node 21+) to resolve font paths relative to the compiled output file. `API_SERVER_ROOT = path.resolve(import.meta.dirname, "..")` goes up one level to the api-server package root. Critical — `process.cwd()` points to workspace root, not the package.

## Build quirk
API server uses esbuild bundling (not tsc). Build output in `dist/`. Font files must be present in `assets/fonts/` at the package root — they are excluded from bundling but read at runtime.

## Tests
24 tests in `artifacts/api-server/src/__tests__/api-flow.test.ts`. All pass. Uses `vi.hoisted()` for shared state and `vi.mock()` for DB, Clerk, OpenAI, pdfService, and extractText. Mock AI response must match new deep-analysis schema.

## Token cost
- `max_tokens: 12000` (raised from 10000 for sub-topic depth)
- Typical output per analysis: ~6,000–9,000 tokens with sub-topics
- gpt-4o-mini: ~$0.002–0.005 per analysis (negligible at current scale)
