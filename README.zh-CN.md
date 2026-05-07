# who-is-boss

[![CI](https://github.com/Zerkariya/who-is-boss/actions/workflows/ci.yml/badge.svg)](https://github.com/Zerkariya/who-is-boss/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)

[English](./README.md) · **简体中文**

多 agent 命令行编排工具。**一个 agent 负责写代码。其他几个负责回答那些会打断写代码的问题。**

让一个 coding agent（Claude、Cursor 等）什么都干 —— 调研、code review、读别人的代码、回答"这个库还在维护吗" —— 它的 context window 会被一堆和当前要写的 diff 无关的杂事填满。`who-is-boss` 是一个很小的 CLI，给 boss 一条把非写代码的活外包出去的路，同时给**你**一条不打扰 boss 也能问问题的旁路。

## 四个角色

| 角色         | 服务对象              | 职责                                                                                       | 文件权限 |
|--------------|-----------------------|--------------------------------------------------------------------------------------------|----------|
| `boss`       | 用户                  | 唯一写代码的 agent。规划工作。在做方案阶段把查证类的活儿委派给其他角色。                  | 全部     |
| `reviewer`   | boss                  | 审查方案，读本地代码/文档/数据，查官方文档，找漏洞。                                       | **只读**（跑在临时 git worktree 里） |
| `researcher` | boss                  | 出网搜索 —— 社区项目、别人的代码、可比较的库、官方文档以外的资料。                          | **只读**（跑在临时 git worktree 里） |
| `consultant` | **用户**，直连        | 回答你（人）的问题，让你不必打断 boss。                                                    | 无       |

## 工作流是怎么跑的

```
   ┌──────────────────────────────────────────────────────────────────┐
   │                                                                  │
   │  用户                                                            │
   │   │                                                              │
   │   │ "实现功能 X"                                                  │
   │   ▼                                                              │
   │  boss ──────► 读项目，起若干方案                                   │
   │   │                                                              │
   │   │ wib ask reviewer "审一下方案 A"                               │
   │   │ wib ask researcher "社区在 Y 这块用什么"                       │
   │   ▼                                                              │
   │  reviewer / researcher（worktree，只读）                          │
   │   │                                                              │
   │   │ findings                                                     │
   │   ▼                                                              │
   │  boss ──────► 综合方案，标注每个方案的审核者                       │
   │   │                                                              │
   │   │ "方案 A（reviewer 审过 + researcher 调研过）：…"               │
   │   ▼                                                              │
   │  用户挑选 ──► boss 写代码                                          │
   │                                                                  │
   └──────────────────────────────────────────────────────────────────┘

   与此同时，旁路通道：

   用户 ──── "X 是什么意思？" ────► consultant
                                    │
            （consultant 持续在收 boss/reviewer/researcher
             每次跑动的 transcript，所以它有上下文）
```

中间那段 boss 主动委派的环节是 context 节省的核心：boss 只看到 reviewer 和 researcher 返回的**结论**，不看它们的搜索/阅读过程。

## 安装

```bash
npm install -g who-is-boss
# 不安装也能用：
npx who-is-boss --help
```

包里带两个二进制：`who-is-boss` 和短别名 `wib`。

## 快速上手

1. 在你的项目根目录（必须是 git repo 且至少有一个 commit，reviewer/researcher 才能在 worktree 里隔离）：

   ```bash
   wib init
   ```

   会在当前目录写一份初始 `.who-is-boss.yaml`。

2. 编辑它，把每个角色指向你机器上真实存在的 CLI：

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

3. 验证配置：

   ```bash
   wib list
   ```

4. 用起来。两条流：

   **boss 在做方案时主动委派。** 在 boss 的 session 里，boss 应该这样调：

   ```bash
   wib ask reviewer "方案 A 每次请求都同步读 users.json，在我们的量级上有问题吗？"
   wib ask researcher "moment.js 在 2026 年推荐用什么替代？"
   ```

   reviewer/researcher 各自跑在临时一次性的 git worktree 里，他们改的任何东西都被丢弃。boss 拿到 stdout，把它带署名地折进方案。

   **你直接问 consultant。** 你（人）开发到一半疑惑某个概念时：

   ```bash
   wib ask consultant "SSE 和 WebSocket 区别再说一遍？"
   ```

   consultant 不会去打扰 boss。它会自动收到 boss/reviewer/researcher 最近 10 条 transcript，所以它知道你项目里在发生什么。

   长上下文可以用管道喂进去：

   ```bash
   git diff main | wib ask reviewer "审下这个 diff" --stdin
   ```

## 让 boss 真的去委派

`who-is-boss` 只是管道。boss 得**愿意**用它。把类似下面这段塞到 boss 的 system prompt 或项目规则里（`CLAUDE.md`、`.cursorrules` 等）：

> 当你在做方案、或者对一个已有项目做二次开发时，你有一个团队：
>
> - `wib ask reviewer "<问题>"` —— 用来读本地代码、查官方文档、审你自己起的草案。
> - `wib ask researcher "<问题>"` —— 用来查社区项目、别人的代码、第三方库，所有需要走出本仓库和官方文档之外的事情。
>
> 在做方案阶段使用它们。把它们的回复综合进你给用户的方案里，并**给每个方案标注是谁审过、谁调研过**（例如 "方案 A —— reviewer 审过，researcher 调研过"）。日常写代码不要委派 —— 那是你的本职。
>
> **不要**调 `wib ask consultant`。那条通道是给用户的。

## 配置文档

配置从当前工作目录向上查找，按顺序尝试这些文件名：

- `.who-is-boss.yaml`
- `.who-is-boss.yml`
- `who-is-boss.yaml`
- `who-is-boss.yml`

`roles:` 下每个角色支持的字段：

| 字段          | 类型                  | 默认值     | 说明                                                              |
|---------------|-----------------------|------------|-------------------------------------------------------------------|
| `command`     | string（**必填**）    | —          | 要调用的可执行文件。                                              |
| `name`        | string                | command    | 日志和 transcript 里显示的名字。                                  |
| `args`        | string[]              | `[]`       | 在 prompt 之前附加的参数。                                        |
| `promptMode`  | `"argv"` \| `"stdin"` | `"argv"`   | prompt 怎么传给 CLI。                                             |
| `env`         | map<string,string>    | `{}`       | 子进程的额外环境变量。                                            |
| `cwd`         | string                | 继承       | 工作目录。reviewer/researcher 会被 worktree 覆盖，此字段对它们无效。 |
| `timeoutSec`  | number                | `300`      | 硬超时，先 `SIGTERM` 再 `SIGKILL`。                                |

没配的角色调用时会清晰报错。

## 同一个 CLI 跑多个角色

可以。你可以让 4 个角色全用 `claude`（或 `codex` 等），它们的会话不会串 —— `who-is-boss` 帮你处理好。

原理：大多数 agentic CLI 用**当前工作目录**作为 session 状态的 key（Claude Code 把 session 存在 `~/.claude/projects/<encoded-cwd>/...` 下，codex 类似）。`who-is-boss` 让每个角色跑在不同的 cwd，CLI 自动把它们当成不同的"项目"，会话记忆各管各的：

| 角色         | 运行时 cwd                                                | 会话生命周期                       |
|--------------|-----------------------------------------------------------|------------------------------------|
| `boss`       | 项目根目录                                                | 持久（boss 的主会话）              |
| `reviewer`   | 一次性的临时 git worktree，**每次调用都新建**             | 无 —— 每次都是全新 thread          |
| `researcher` | 一次性的临时 git worktree，**每次调用都新建**             | 无 —— 每次都是全新 thread          |
| `consultant` | `<project>/.wib/sessions/consultant/`                     | 持久，但与 boss 隔离               |

reviewer 和 researcher 设计上就是短命的（读、报告、退出）。consultant 保留持久会话 —— 它是你的私人助手 —— 但和 boss 干净地隔开。

如果你的 CLI 不按 cwd 索引会话，可以在角色级别上叠加显式隔离。每个角色都会自动收到这些环境变量：

- `WIB_ROLE` —— 角色名，wrapper 脚本里好用
- `WIB_PROJECT_ROOT` —— boss 项目的路径
- `WIB_CONFIG_PATH` —— `.who-is-boss.yaml` 的位置
- `WIB_WORKTREE` —— 仅 reviewer/researcher 有

利用 `WIB_ROLE` 给会话命名空间的 wrapper 示例：

```yaml
reviewer:
  command: bash
  args: ["-c", 'some-cli --session-id "wib-$WIB_ROLE" --prompt "$(cat)"']
  promptMode: stdin
```

参考 `examples/all-claude.yaml`（4 个角色都用同一个 agent）和 `examples/mixed.yaml`（多家混搭）。

## 隔离机制：reviewer/researcher 怎么保证只读

调 `wib ask reviewer …` 或 `wib ask researcher …` 时，`who-is-boss` 会：

1. 确认项目是 git repo 且至少有一个 commit。
2. 在系统 tmpdir 下创建一个临时 detached worktree，指向 `HEAD`。
3. 在那里跑 agent，注入 `WIB_PROJECT_ROOT` / `WIB_WORKTREE` / `WIB_ROLE` 环境变量。
4. 给 prompt 包一段 banner，提醒 agent 它处于只读模式，任何修改都会被丢弃。
5. 跑完（成功/失败/超时都算），销毁 worktree。

双保险：就算 agent 不听 prompt 真去改文件，改的也到不了 boss 的 repo。如果你确实想关掉隔离（信任的 CLI），加 `--no-isolate`。

## Transcript

每次 `boss` / `reviewer` / `researcher` 跑完，都会在项目根的 `.wib/transcripts/<时间戳>-<角色>.md` 追加一份记录。`wib ask consultant …` 时，最近 10 条 transcript 会自动作为上下文注入。

不想把 transcript 提交到版本控制的话，把 `.wib/` 加到 `.gitignore`。

## CLI 参考

```
wib ask <role> <prompt...>     把 prompt 派发给映射到 <role> 的 agent
wib list                       列出已配置的角色
wib roles                      打印内建角色定义
wib init                       在当前目录写一份初始 .who-is-boss.yaml

可选项：
  --config <path>              指定配置文件路径
  --stream                     边跑边流式输出
  --stdin                      把 stdin 内容附加到 prompt
  --no-isolate                 关闭 reviewer/researcher 的 worktree 隔离
```

退出码透传 agent 的退出码。

## 作为库使用

`who-is-boss` 也是一个小的 TypeScript 库，可以嵌到你自己的工具里：

```ts
import { loadConfig, runAgent, createWorktree, wrapPrompt } from 'who-is-boss';

const cfg = loadConfig();
const wt = createWorktree(process.cwd());
try {
  const prompt = wrapPrompt('reviewer', '审下这个方案…', { worktreePath: wt.path });
  const r = await runAgent({ ...cfg.roles.reviewer!, cwd: wt.path }, prompt);
  console.log(r.stdout);
} finally {
  wt.cleanup();
}
```

## 状态

早期。v0.x，接口可能改。欢迎 PR，特别是：

- 主流 CLI 的实战配置示例（Cursor、Aider、llm、gh-copilot）
- 查看 transcript 历史的 `wib log` 命令
- 每个角色的 token / 费用统计
- 一个更顺手的"boss 并行收集 N 个 reviewer 意见"聚合器

## 许可证

[Apache License 2.0](./LICENSE).
