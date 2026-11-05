# PlanMyStudy

A superadmin-only prompt-chain studio built with Next.js, TypeScript, and Supabase. The dashboard supports prompt-chain and step CRUD, ordered steps, Gemini study-plan generation, saved run history, and Light/Dark/System themes.

## Local setup

Keep these values in `.env.local` (never commit credentials):

```dotenv
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_publishable_key
GEMINI_API_KEY=your_server_side_gemini_key
# Optional; defaults to gemini-3.1-flash-lite:
GEMINI_MODEL=gemini-3.1-flash-lite
```

Start with `npm run dev`. Google OAuth and the existing callback must be configured for your local origin. Sign in with a user whose `profiles.is_superadmin` is true.

Gemini calls run exclusively on the server. Do not add a `NEXT_PUBLIC_` prefix to its key. The integration uses Gemini's REST GenerateContent API and structured JSON output without adding a provider SDK. See [Google's structured output documentation](https://ai.google.dev/gemini-api/docs/structured-output).

## Run a study-planning chain

1. Select a chain in Prompt Chains. If the workspace is empty, use **Create study-planner starters**.
2. Add at least one step, then choose **Run Chain**.
3. Enter courses, exam dates (including years), hardest subjects, available study windows, productive time, and optional constraints.
4. Submit and keep the modal open while generation runs. The server verifies the signed-in superadmin and the chain's `workspace = "plan-my-study"` membership.
5. Steps are loaded in `step_order`, with `id` as a tie-breaker. Every Gemini call receives the original inputs, its own prompt, and the immediately preceding step's result (none for step 1).
6. The final step requests JSON for three study plans and a recommendation. A runtime validator rejects missing plans, empty schedules, and incomplete results before any save.
7. Successful runs are inserted into `prompt_chain_runs` with the authenticated user's ID. `input_data` includes a chain-name snapshot; `output_data` stores the structured plans. The database supplies `created_at`.
8. The app switches to **Generated Runs** and opens the saved output immediately, with a success message. **Output / Run Details** show the plans and original inputs; **Back to all runs** returns to history. The selected chain links to its latest plan and lists its history in the Runs tab. Dashboard stays an overview with counts, quick actions, and recent runs; the full editor appears only in Prompt Chains.

Runs remain read-only. Provider failures and incomplete results do not insert a run. If saving fails after generation, the UI reports that failure; retrying makes fresh provider calls. If a connection is interrupted, check history before retrying.

Inputs are limited to 6,000 characters per field. Chains support up to 20 steps with a four-minute total provider timeout. The page requests a five-minute server duration; deployed hosting must permit that duration. No additional migration is required beyond the already provisioned workspace column, run table, grants, and superadmin RLS policies.

## Checks

```sh
node --test tests/*.test.mjs
npm run lint
./node_modules/.bin/tsc --noEmit
npm run build
```

The automated tests use explicit fixtures and mocks; application generation always calls Gemini. They cover workspace isolation, input/output validation, sequential context handoff, authorization, save ownership, and provider/persistence failures. When an execution sandbox blocks Turbopack's local worker port, `npm run build -- --webpack` provides a production-build alternative.
