# who-is-boss

[![CI](https://github.com/Zerkariya/who-is-boss/actions/workflows/ci.yml/badge.svg)](https://github.com/Zerkariya/who-is-boss/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)

**English** · [简体中文](./README.zh-CN.md)

Multi-agent CLI orchestration. **One agent writes code. The others answer the dumb questions.**

When a single coding agent (Claude, Cursor, etc.) does everything — research, code review, reading other people's code, answering "is this lib still maintained?" — its context window fills up with junk that has nothing to do with the diff it's about to write. `who-is-boss` is a tiny CLI that gives the boss a way to delegate non-coding work, and gives **you** a separate channel to ask questions without interrupting the boss.

## The four roles

| Role         | Who it serves          | Job                                                                                  | File access |
|--------------|------------------------|--------------------------------------------------------------------------------------|-------------|
| `boss`       | The user               | Writes code. Plans the work. Delegates fact-finding to the others when planning.     | Full        |
| `reviewer`   | The boss               | Audits plans, reads local files, checks official docs, finds gaps.                   | **Read-only** (runs in a temp git worktree) |
| `researcher` | The boss               | Web search beyond official docs — community projects, prior art, comparable libs.    | **Read-only** (runs in a temp git worktree) |
| `consultant` | **The user**, directly | Answers questions you have so you don't have to interrupt the boss.                  | None        |

## How the workflow runs

```
   ┌──────────────────────────────────────────────────────────────────┐
   │                                                                  │
   │  user                                                            │
   │   │                                                              │
   │   │ "implement feature X"                                        │
   │   ▼                                                              │
   │  boss ──────► reads project, drafts plan(s)                      │
   │   │                                                              │
   │   │ wib ask reviewer "audit option A"                            │
   │   │ wib ask researcher "what does the community use for Y"       │
   │   ▼                                                              │
   │  reviewer / researcher (worktree, read-only)                     │
   │   │                                                              │
   │   │ findings                                                     │
   │   ▼                                                              │
   │  boss ──────► synthesizes options, ANNOTATES with reviewers      │
   │   │                                                              │
   │   │ "Option A (reviewed by codex, researched by deepseek): …"    │
   │   ▼                                                              │
   │  user picks ──► boss writes code                                 │
   │                                                                  │
   └──────────────────────────────────────────────────────────────────┘

   meanwhile, in a separate channel:

   user ──── "does X mean Y or Z?" ────► consultant
                                          │
            (consultant has been receiving transcripts of every
             boss/reviewer/researcher run, so it has context)
```

The boss-driven delegation in the middle is where most of the context savings come from: the boss only sees the *summaries* reviewer and researcher return, not the searching and reading that produced them.

## Install

```bash
npm install -g who-is-boss
# or run without installing:
npx who-is-boss --help
```

The package ships two binaries: `who-is-boss` and the shorter alias `wib`.

## Quickstart

1. From your project root (must be a git repo with at least one commit, so reviewer/researcher can be isolated in worktrees):

   ```bash
   wib init
   ```

   This drops a starter `.who-is-boss.yaml` in the current directory.

2. Edit it to point each role at the CLI you actually have installed:

   ```yaml
   roles:
     boss:
       command: claude
     reviewer:
       command: codex
     researcher:
       command: deepseek
     consultant:
       command: gemini
   ```

3. Verify the wiring:

   ```bash
   wib list
   ```

4. Use it. Two flows:

   **Boss delegates while planning.** From inside the boss's session, the boss should call:

   ```bash
   wib ask reviewer "Plan A reads users.json synchronously on every request. Is that a problem at our scale?"
   wib ask researcher "What's the recommended replacement for moment.js in 2026?"
   ```

   Reviewer/researcher each run in a fresh disposable git worktree, so anything they touch is thrown away. The boss gets back stdout and folds it into the proposal, with attribution.

   **You ask the consultant directly.** When *you* (the human) are confused mid-development:

   ```bash
   wib ask consultant "What's the difference between SSE and WebSockets again?"
   ```

   The consultant answers without ever talking to the boss. It also auto-receives the last 10 transcripts from boss/reviewer/researcher, so it knows what's going on in your project.

   You can pipe long context in via stdin:

   ```bash
   git diff main | wib ask reviewer "Review this diff" --stdin
   ```

## Telling the boss to actually delegate

`who-is-boss` is just plumbing. The boss needs to *want* to use it. Drop something like this into your boss's system prompt or project rules (`CLAUDE.md`, `.cursorrules`, etc.):

> When you're forming a plan or doing second-development on an existing project, you have a team:
>
> - `wib ask reviewer "<question>"` — for reading the local codebase, checking official docs, auditing your draft plan.
> - `wib ask researcher "<question>"` — for community projects, prior art, third-party libraries, anything that requires going *outside* this repo and its official docs.
>
> Use them during the planning phase. Synthesize their replies into the proposal you give the user, and **annotate each option with which roles reviewed it** (e.g., "Option A — reviewed by reviewer, researched by researcher"). Do not delegate routine code-writing — that's your job.
>
> Do **not** call `wib ask consultant`. That channel is for the user.

## Configuration reference

Config is searched upward from the current working directory. Filenames tried, in order:

- `.who-is-boss.yaml`
- `.who-is-boss.yml`
- `who-is-boss.yaml`
- `who-is-boss.yml`

Each role under `roles:` accepts:

| Field        | Type                  | Default | Notes                                                          |
|--------------|-----------------------|---------|----------------------------------------------------------------|
| `command`    | string (**required**) | —       | Executable to invoke.                                          |
| `name`       | string                | command | Display name shown in logs / transcripts.                      |
| `args`       | string[]              | `[]`    | Args prepended before the prompt.                              |
| `promptMode` | `"argv"` \| `"stdin"` | `"argv"`| How the prompt is delivered to the CLI.                        |
| `env`        | map<string,string>    | `{}`    | Extra env vars for the child process.                          |
| `cwd`        | string                | inherit | Working directory. Ignored for reviewer/researcher (overridden by worktree). |
| `timeoutSec` | number                | `300`   | Hard timeout. Child is `SIGTERM`ed, then `SIGKILL`ed.          |

Roles you don't configure are simply unavailable; calling them returns a clear error.

## Using the same CLI for multiple roles

Yes, you can point all four roles at `claude` (or `codex`, etc.). They won't share memory — `who-is-boss` arranges that for you.

The trick: most agentic CLIs key their session state by **current working directory** (Claude Code stores sessions under `~/.claude/projects/<encoded-cwd>/...`; codex behaves similarly). `who-is-boss` runs each role in a different cwd, so the CLI naturally treats them as separate "projects" with separate conversation memories:

| Role         | cwd at runtime                                           | Session lifetime                |
|--------------|----------------------------------------------------------|----------------------------------|
| `boss`       | the project root                                         | persistent (the boss's main session) |
| `reviewer`   | a fresh ephemeral git worktree, **new on every call**    | none — fresh thread every time   |
| `researcher` | a fresh ephemeral git worktree, **new on every call**    | none — fresh thread every time   |
| `consultant` | `<project>/.wib/sessions/consultant/`                    | persistent, but separate from boss |

Reviewer and researcher are short-lived by design (they're meant to read, report, and exit). Consultant keeps a persistent session — it's *your* personal helper across questions — but cleanly isolated from the boss.

If your CLI doesn't key session state by cwd, you can layer on explicit isolation per role via env vars or args. Every role automatically receives:

- `WIB_ROLE` — the role name, useful in wrapper scripts
- `WIB_PROJECT_ROOT` — the boss's repo path
- `WIB_CONFIG_PATH` — where `.who-is-boss.yaml` lives
- `WIB_WORKTREE` — present only for reviewer/researcher

Example wrapper using `WIB_ROLE` to namespace sessions:

```yaml
reviewer:
  command: bash
  args: ["-c", 'some-cli --session-id "wib-$WIB_ROLE" --prompt "$(cat)"']
  promptMode: stdin
```

See `examples/all-claude.yaml` for a config that uses one agent for everything, and `examples/mixed.yaml` for a multi-vendor setup.

## Isolation: how reviewer/researcher are kept read-only

When you call `wib ask reviewer …` or `wib ask researcher …`, `who-is-boss`:

1. Verifies the project is a git repo with at least one commit.
2. Creates a temporary detached worktree at `HEAD` under your OS tmpdir.
3. Runs the agent there, with `WIB_PROJECT_ROOT` / `WIB_WORKTREE` / `WIB_ROLE` env vars set.
4. Wraps the prompt with a banner reminding the agent it's read-only and that any edits will be discarded.
5. After the run (success, failure, or timeout), tears down the worktree.

This is belt-and-suspenders: even if the agent ignores the prompt and edits files, the edits never reach the boss's repo. If you really want to disable isolation (e.g., for trusted CLIs), pass `--no-isolate`.

## Transcripts

Every `boss` / `reviewer` / `researcher` run is appended to `.wib/transcripts/<timestamp>-<role>.md` in the project root. When you call `wib ask consultant …`, the most recent 10 transcripts are auto-injected as context.

Add `.wib/` to your `.gitignore` if you don't want transcripts in version control.

## CLI reference

```
wib ask <role> <prompt...>     Delegate a prompt to the agent assigned to <role>
wib list                       List configured roles
wib roles                      Print built-in role definitions
wib init                       Write a starter .who-is-boss.yaml in the cwd

Options:
  --config <path>              Use a specific config file
  --stream                     Stream agent output as it arrives
  --stdin                      Append stdin content to the prompt
  --no-isolate                 Skip worktree isolation for reviewer/researcher
```

Exit code is forwarded from the underlying agent.

## Library usage

`who-is-boss` is also a small TypeScript library if you want to embed the orchestration in your own tool:

```ts
import { loadConfig, runAgent, createWorktree, wrapPrompt } from 'who-is-boss';

const cfg = loadConfig();
const wt = createWorktree(process.cwd());
try {
  const prompt = wrapPrompt('reviewer', 'Audit this plan…', { worktreePath: wt.path });
  const r = await runAgent({ ...cfg.roles.reviewer!, cwd: wt.path }, prompt);
  console.log(r.stdout);
} finally {
  wt.cleanup();
}
```

## Status

Early. v0.x — interface may change. PRs welcome, especially:

- Worked examples for popular CLIs (Cursor, Aider, llm, gh-copilot).
- A `wib log` viewer for transcripts.
- Cost / token accounting per role.
- A nicer aggregator for "boss collects N reviewer opinions in parallel".

## License

[Apache License 2.0](./LICENSE).
