# Repository Guidelines

## Project Structure & Module Organization
- `src/index.js` holds the single Cloudflare Worker entrypoint and helper functions.
- `wrangler.toml` defines the Worker name, compatibility date, and default vars.
- `.github/` contains automation (deployment workflows).

## Build, Test, and Development Commands
- `wrangler dev` runs the Worker locally with hot reload for manual testing.
- `wrangler publish` (or `wrangler deploy` if configured) publishes the Worker to Cloudflare.
- `npm install -g wrangler` installs the Wrangler CLI when it is not already available.

## Coding Style & Naming Conventions
- JavaScript (ES modules) with 2-space indentation and semicolons.
- Use `camelCase` for variables/functions and `SCREAMING_SNAKE_CASE` for env vars.
- Keep request validation near the top of `fetch` and add small helpers below.
- No lint/format tooling is configured; format changes should stay minimal and consistent.

## Testing Guidelines
- No automated test framework is configured in this repo.
- Validate changes with `wrangler dev` and a representative webhook payload.
- Keep payload samples in README-style curl snippets; prefer small, realistic JSON bodies.

## Commit & Pull Request Guidelines
- Commit history uses short, direct summaries (English or Chinese), not strict conventional commits.
- Keep subjects concise (e.g., `Update README`, `添加可观察性配置到 wrangler.toml`).
- PRs should include: a brief purpose, affected endpoints/config, and any new env vars.
- Attach example requests or screenshots of test results when behavior changes.

## Security & Configuration Tips
- Required env var: `BARK_ENDPOINT` (no trailing slash).
- Optional env vars: `WEBHOOK_TOKEN`, `EXPECTED_EVENT`, `DEDUP_TTL_SECONDS`,
  `BARK_GROUP`, `TIME_ZONE`, `PREVIEW_CHARS`, `MAX_BARK_BODY_CHARS`.
- Never log or commit device keys or tokens; use `wrangler secret put` when needed.
