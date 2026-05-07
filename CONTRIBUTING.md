# Contributing to who-is-boss

Thanks for your interest. This project is intentionally tiny — the surface area is a CLI multiplexer with role abstraction, nothing more.

## Setup

```bash
npm install
npm run build
node dist/cli.js --help
```

For development:

```bash
npm run dev -- --help
```

## Scope

Things that fit:

- New worked examples in `examples/` for popular CLIs.
- Bug fixes around process spawning, signal handling, timeouts.
- Better error messages.
- Optional features that stay opt-in (e.g. structured logging, cost tracking).

Things that do **not** fit (at least not yet):

- A built-in HTTP/IPC layer between agents.
- Bundled provider SDKs — `who-is-boss` shells out to whatever CLI you already have.
- Opinionated prompts. Prompting is the user's job.

## Pull requests

- Keep diffs small and focused.
- Include a one-line entry in the PR description explaining *why*.
- For new behavior, add a usage snippet to the README.
- By contributing, you agree to license your contribution under Apache-2.0.

## Code of conduct

Be kind. Disagree on substance, not on people.
