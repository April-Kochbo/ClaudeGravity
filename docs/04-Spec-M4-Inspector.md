# M4/M5 – Thread Inspector, Thread Chat & Capsules

## Verified data sources (no invented RPCs)
| Need | Source |
|---|---|
| Any thread's steps | `agentService.getCascadeTrajectory({cascadeId})`, found by a React Fiber walk (`findAgentService`) |
| Send to a thread | composer service (`sendMessage`, `resolveConfig`, `getCurrentModelConfig`, `getEditorState`) found by Fiber walk; same call chain as the app's own `w_()` |
| Per-thread model | `resolveConfig({modelConfigOverride:{label,value}})`; list from `userStatus.cascadeModelConfigData.clientModelConfigs` (`modelOrAlias.choice.case === "model"` only) |
| Edit stats | `codeAction.diffStats {additions, deletions}`, path in `actionResult.result.value.absoluteUri` |
| Durations | step `metadata.createdAt / completedAt / startedAt / finishedGeneratingAt` (protobuf Timestamp) |

## Thread inspector
- Click a thread card -> drawer shows that thread's chat (tabs: Chat, Activity, Files).
- Chat mirrors the main view: right-aligned user bubble, collapsible **Worked for Ns** (Thought / Ran commands / Explored files / Edited files groups), final answer rendered as Markdown (headings, lists, code, tables, quotes, links).
- Normal / Thinking / Verbose view mode controls default expansion.
- Running threads (or within 2 min after sending) refresh every 3 s; scroll position and typed text are preserved.
- Footer composer reuses the main composer's classes: auto-growing textarea, model pill + popup menu (Esc / outside click closes), round send button, Enter sends, Shift+Enter newline.

## Chat-stream capsules
- Only real tasks become capsules: a list line with a ○/● marker or PR badge, or whose title matches a thread in the current project.
- Content-sized, left-aligned, single line: title + one-sentence live status taken from that thread's latest step (running / reading / editing …) or its final answer sentence.

## Not implemented (intentionally)
- Main composer's `+` (add context), `Turbo` (permission preset) and voice button are not reproduced in the thread composer; threads inherit the main session's config.

## M5 checklist
- `node --check` passes; probes and debug logging removed.
- Sync: `scripts/install-or-sync.ps1 -SyncOnly` (plugin hot-reloads).
- Manual: open a thread, expand Worked/Thought/Ran commands, send a reply, switch model, switch project, resize, switch session.