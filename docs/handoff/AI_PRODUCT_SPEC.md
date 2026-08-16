# AI_PRODUCT_SPEC.md — AI / Gemini product boundary

**Status: design reference. NOT implemented. Phase E (after Phases C/D).** The user owns a Gemini Pro subscription and prefers Gemini as the AI provider. Do not switch providers or add SDKs without Phase E approval.

## Where AI fits

1. **Search intent understanding** — turn natural-language requests into structured search/filter params (Phase E; feeds the search builder).
2. **Lead reasoning** — given collected, evidence-backed data about a business, explain in Arabic WHY it is a good lead (missing capability, weak presence, market position, digital gaps).
3. **Opportunity detection** — what is missing / what problems exist / what Digital Wave could sell (Phase F).
4. **Lead qualification support** — ranking/scoring rationale (advisory; final decision is human).

## Hard constraints

- **AI never invents facts.** Every claim must cite evidence from persisted platform data (RawImport payloads, SearchResult rows, enrichment data). If evidence is absent, the output must say "no evidence" rather than speculate. "AI provides only knowledge, analysis, and advice" (freeze doc).
- **AI never mutates trusted data.** It must not collect, verify, merge, or score records itself; it only *produces analyses/advice* that a human reviews and approves.
- **Provider abstraction is mandatory.** Define a provider port (interface) in `application`/`domain`; swap concrete SDKs in `infrastructure/adapters`. Gemini is the initial/first-class provider; do not hard-code OpenAI or any vendor into domain code.
- **Arabic-first output.** The product UI is Arabic; AI explanations must be Arabic, with structured English tags for internal handling if needed.
- **Deterministic guardrails.** Enforced temperature, strict output schema, PII caution (never send passwords/refresh tokens; treat business PII carefully per `docs/SECURITY.md`).
- **Advisory, human-approved.** AI suggestions never auto-save leads or auto-execute actions (that is Phase I automation, and only after Phase H).

## Suggested module shape (when Phase E starts)

- New `ai` module (currently a 0-byte scaffold) following the module conventions:
  - `domain/ports/ai-provider.port.ts` — `generateInsights(input): Promise<AiInsight>`.
  - `infrastructure/adapters/gemini-ai.adapter.ts` (+ mock adapter for tests).
  - `application/use-cases/*.usecase.ts` — orchestrates prompt assembly from persisted evidence + schema validation of the response.
- No `@nestjs/*`/`@prisma/client` in `domain`/`application`.

## Design references

- `docs/sales-intelligence/07-ai-insights.md` (AI scope, consumption rules).
- `docs/sales-intelligence/06-opportunity-engine.md` (opportunity/AI interplay, Phase F).
- `docs/MASTER_ARCHITECTURE.md` (platform-level AI framing; superseded in detail by this file + 07).
- `docs/SECURITY.md` (data handling).

## Acceptance for Phase E (when approved)

- A search intent is translated to structured params using Gemini.
- A lead analysis explains WHY the business is a lead, with each claim tied to a persisted evidence record; missing evidence is flagged as such.
- Provider-swap test: swapping `GeminiAiAdapter` for a stub changes nothing in domain logic.
- No AI data has been persisted as ground truth; everything is advisory and human-approved.
