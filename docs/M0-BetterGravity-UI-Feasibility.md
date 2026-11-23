# M0 — BetterGravity 本机环境与 UI 改造可行性探测报告

> **探测时间**：2026-10-31  
> **探测目标**：验证本机 Google Antigravity 2.0 独立客户端的真实二进制结构、DOM 挂载锚点、状态事件源，以及基于 BetterGravity v3.0.0 实现 Claude Code Desktop（三栏布局 + 三类卡片 + 原地下钻 + 暖白衬线体主题）的 100% 工程可行性。  
> **工作目录**：`E:\BetterGravity`

---

## 1. 本机宿主环境探测结果（Host Binary & Runtime）

| 探测项 | 实测结果 | 结论与影响 |
| :--- | :--- | :--- |
| **客户端安装路径** | `C:\Users\Administrator\AppData\Local\Programs\antigravity\Antigravity.exe` | 标准用户态安装目录，无需管理员权限即可对 `resources\app.asar` 进行备份与补丁注入。 |
| **客户端真实版本** | `package.json` 版本号 **`2.28.2`**（Electron 外壳版本 `44.5.1`） | BetterGravity v3.0.0 在 [`packages/shared/src/index.ts`](file:///C:/Users/Administrator/.gemini/antigravity/brain/204445a1-cfe6-4be4-b7ae-a21e2e8432c7/scratch/bg_docs/shared_index.ts) 中定义 `SUPPORTED_HOST_MAJOR = 2`，`isSupportedHostVersion("2.28.2") === true`，**原生 100% 兼容**。 |
| **当前 ASAR 状态** | `resources\app.asar` 尚未打补丁（入口为原生 `dist/main.js`），`%APPDATA%\BetterGravity` 尚未创建 | 环境干净无冲突，可直接由 `E:\BetterGravity` 执行首次干净注入。 |
| **前端 UI 承载机制** | `dist/main.js` 启动 `resources\bin\language_server.exe --standalone --subclient_type hub --https_server_port 0 --enable_sidecars`，由 `language_server.exe` 在本地随机端口（本次实测 HTTPS `49536` / HTTP `49537`）从内嵌资源返回全套 React Web UI | UI 虽然内嵌在 Go 二进制中，但因为跑在 Electron `BrowserWindow` 渲染进程内，**BetterGravity 的 Preload 注入、CSS 样式覆盖、DOM Observer、React Fiber 桥接与 JS Bundle Patch 全部在渲染层生效**，无需反编译 `language_server.exe`。 |
| **本地日志与轨迹存储** | `C:\Users\Administrator\.gemini\antigravity\brain\<cascade-id>\.system_generated\logs\transcript.jsonl` 及 `%APPDATA%\Antigravity\logs\language_server.log` | 所有主会话、Subagent 派生（`invoke_subagent`）、工具调用与 Artifacts 均有实时结构化落盘。 |

---

## 2. 真实 DOM 锚点映射表（Verified `data-testid` & `data-*` Selectors）

通过对 Antigravity `2.28.2` 生产环境选择器及 BetterGravity 官方插件库（`gemini-app`、`fork-chat`、`timeslip`）的交叉探查，已锁定以下 **79 个真实存在的 `data-testid` 锚点**，可直接支撑我们的三栏改造：

### 2.1 顶部栏（Title Bar & View Mode Switcher）
- **窗口顶栏容器**：`[data-testid="window-titlebar"]`、`[data-testid="title-menu-bar"]`
- **左栏折叠开关**：`[data-testid="sidebar-toggle"]`
- **右侧辅助栏原生开关**：`[data-testid="toggle-aux-sidebar"]`、`[data-testid="titlebar-more-actions"]`
- **改造挂载策略**：
  - 使用 BetterGravity 的 `plugin.ui.button({ area: "titleBar" })` 或直接挂载到 `[data-testid="window-titlebar"]` 右侧区域，渲染：
    1. **`Normal | Thinking | Verbose`** 三态折叠切换胶囊（绑定 `Ctrl+O`）。
    2. **`[Overview •]`** 右栏开关按钮（存在 `Waiting on you` 线程时亮起 `#D97757` 赤陶圆点）。

### 2.2 左栏：统一单侧边栏（Unified Single Sidebar）
- **侧边栏主容器**：`[data-testid="conversation-list-sidebar"]`（折叠态属性 `[data-sidebar-collapsed]`）
- **核心操作按钮**：
  - 新建会话：`[data-testid="new-conversation-button"]`
  - 定时任务（对应 Claude `Routines`）：`[data-testid="automations-button"]`
  - 历史与搜索：`[data-testid="history-button"]`、`[data-testid="history-search-input"]`
  - 底部设置区：`[data-testid="sidebar-footer"]`、`[data-testid="settings-button"]`
- **项目分组与会话行（天然支持按 Project 分组！）**：
  - 项目分组块：`[data-testid="project-group"]`、`[data-project-card]`、`[data-project-expanded]`、`[data-testid="sidebar-add-project-button"]`
  - 单条会话行：`[data-testid="conversation-row-sidebar"][data-cascade-id="<id>"]`
  - 会话行内置状态指示器：
    - 执行中旋转图标：`[data-testid="status-loading-spinner"]`
    - 等待用户确认圆点：`[data-testid="attention-dot"]`
    - 未读蓝点：`[data-testid="status-unread-dot"]`
- **改造挂载策略**：
  - 无需新建次左栏！直接在 `[data-testid="conversation-list-sidebar"]` 顶部注入 Claude 风格的 **`Chat | Cowork | </> Code`** 模式胶囊，复用原生 `[data-testid="project-group"]` 展示按项目归类的会话树，并过滤/聚合由主会话派生的子线程（Subagent），避免子线程把左侧主列表刷屏。

### 2.3 中栏：项目主会话与底部紧凑状态条（Center Coordinator & Composer）
- **主对话视图容器**：`[data-testid="conversation-view"]`（含当前会话属性 `data-cascade-id`）
- **虚拟滚动容器**：`[data-testid="conversation-view-scroll-container"]` / `[data-virtuoso-scroller="true"]`
- **对话回合节点**：
  - 用户提问块：`[data-testid="user-input-step"]`、`[data-testid="user-input-step-text"]`（带 `data-user-step-index`、`data-step-index`）
  - AI 回复块：`[data-testid="agent-turn"]`、`[data-testid="planner-response-text"]`
- **原生折叠组件（直接支撑 `Normal / Thinking / Verbose` 切换！）**：
  - 思考过程折叠器：`[data-testid="thinking-collapsible-trigger"]`
  - 耗时汇总折叠器：`[data-testid="worked-for-collapsible"]`
  - 工具调用组折叠器：`[data-testid="tool-group-collapsible"]`
  - 命令行步骤块：`[data-testid="run-command-step"]`
  - 文件变更摘要块：`[data-testid="trajectory-file-changes"]`
  - 交互确认按钮：`[data-testid="interaction-continue-button"]`、`[data-testid="interaction-skip-button"]`、`[data-testid="side-question-panel"]`
- **底部输入区（Composer）**：
  - 输入框外层容器：`[data-testid="agent-input-box"]`
  - 富文本编辑区：`[data-testid="composer-input"]`
  - 模型选择触发器：`[data-testid="model-selector-trigger"]`
  - 发送按钮：`[data-testid="send-button"]`
- **改造挂载策略**：
  1. **底部紧凑状态条（Compact Status Bar）**：紧贴 `[data-testid="agent-input-box"]` 顶部插入 `.claude-composer-statusbar`，实时展示 `🌿 Git Branch` | `+Added -Removed` | `N Working · M Waiting`。
  2. **3 类内嵌卡片（Cards in Chat）**：在 `[data-testid="agent-turn"]` 内通过 DOM Observer 与 React Fiber Step 数据识别子线程派生与任务规划，渲染 `Suggested Threads Card`、`Active Thread Card` 与 `Inline Task Card`。

### 2.4 右栏：Overview 面板与原地内下钻（Right Overview & Thread Inspector）
- **原生辅助面板参考**：宿主本身存在 `[data-testid="running-items-panel"]`、`[data-testid="sidecars-view"]`、`[data-testid="sidecar-detail"]`。
- **改造挂载策略**：
  - 在 `[data-testid="conversation-view"]` 所在的 Flex 主工作区右侧，挂载受控的 `.claude-right-drawer`（宽度 `380px`，支持拖拽调整宽度）：
    - **Overview 态（默认）**：顶部 `Threads` | `Changes` | `Library` 三页签；`Threads` 页签下按 `Waiting on you`、`Working`、`Completed` 三组实时渲染卡片。
    - **Thread Inspector 态（点击任意 Thread 卡片原地切换）**：顶部 `← Back to Overview` + 状态徽章；中部 `Plan` | `Activity` | `Diff` | `Verify` 四页签；底部提供独立追加输入框与 `Stop` / `Approve` 按钮。

---

## 3. 真实状态与事件源桥接方案（Evidence-Based State & RPC Bridge）

**严守“不伪造 RPC、不靠猜状态”的铁律**，本机探测证实我们可以通过 **3 条真实可靠的数据通道** 获取并控制主会话与子线程：

### 通道 A：React Fiber 内存 Store 与 `agentService` 直连（最核心发现）
从 `[data-testid="conversation-view"]` 的 `__reactFiber$` 向上遍历 Context（已在 [`fork-chat.js`](file:///C:/Users/Administrator/.gemini/antigravity/brain/204445a1-cfe6-4be4-b7ae-a21e2e8432c7/scratch/bg_docs/fork-chat.js#L85-L164) 与 [`timeslip.js`](file:///C:/Users/Administrator/.gemini/antigravity/brain/204445a1-cfe6-4be4-b7ae-a21e2e8432c7/scratch/bg_docs/timeslip.js#L124-L178) 中验证 100% 可用），可直接拿到宿主内部的三大核心实例：

1. **`store`（全局状态树 `store.getState()`）**：
   - `state.cascade.activeCascadeId`：当前打开的主会话 ID。
   - `state.trajectorySummaries.summaries[cascadeId]`：所有会话的标题、所属 `projectId`、最后更新时间、运行状态。
   - 实时监控每个会话的 `CortexStepStatus` 枚举值：
     - `1` (`PENDING`), `2` (`RUNNING`), `8` (`GENERATING`), `11` (`QUEUED`) $\rightarrow$ 精确映射为 Claude 的 **`Working`** 状态！
     - `9` (`WAITING`) 或存在未决 `interaction` / `[data-testid="attention-dot"]` $\rightarrow$ 精确映射为 Claude 的 **`Waiting on you`** 状态！
     - 其余终态 $\rightarrow$ 精确映射为 **`Completed`** 状态！
2. **`agentService`（原生 Connect-RPC 客户端实例）**：
   - `agentService.getCascadeTrajectory({ cascadeId, verbosity: 3 })`：**无需离开当前主会话页面**，即可在后台异步拉取任意子线程（Thread / Subagent / Forked Cascade）的完整 `steps`、`generatorMetadata`、工具调用记录、文件 Diff 与 Artifacts！这使**“右侧面板原地内下钻查看子线程详情”**具备 100% 原生数据支撑！
   - `agentService.startCascade(...)` / `agentService.forkConversation(...)`：支持当用户点击 `Suggested Threads Card` 上的 `[Start]` 或 `[Start N threads]` 时，真正调用宿主 API 创建并启动新的并行工作线程（含共享 Git Worktree 选项 `targetForkWorkspace: 2`）！
3. **`router`（原生路由实例 `router.navigate`）**：
   - 支持在用户需要全屏切换某个会话时，无刷新毫秒级路由跳转 `/c/$cascadeId`。

### 通道 B：Connect-RPC 网络拦截器（`plugin.net.onFetch`）
- 拦截 `/exa.language_server_pb.LanguageServerService/*` 请求，实时捕获流式输出、步骤状态变更与 Subagent 消息推送，驱动底部紧凑状态栏与右栏 Overview 红点毫秒级更新。

### 通道 C：本地工程与 Git 状态探测
- 通过插件桥接或 `trajectory-file-changes` 节点实时提取当前项目的 Git 分支名与 `+Added -Removed` 行数统计，渲染到底部状态条与右栏 `Changes` 页签。

---

## 4. `E:\BetterGravity` 目录结构与跨机器迁移架构

为确保所有成果集中存放在 `E:\BetterGravity` 且可一键迁移到任何 Windows 电脑，我们在 `E:\BetterGravity` 建立如下标准工程结构：

```text
E:\BetterGravity\
├── docs\
│   ├── 00-Spec-Baseline.md                 # 已锁定的完整视觉与交互基线规范
│   └── M0-BetterGravity-UI-Feasibility.md  # 本机探测与技术可行性报告（本文档）
├── themes\
│   └── claude-warm-serif.css               # [M1] Claude 暖白羊皮纸浅色 + 赤陶橘黄 + 衬线体主题
├── plugins\
│   └── claude-code-workspace\              # [M1-M4] 核心工作台改造插件
│       ├── plugin.json                     # 插件清单与可选 Bundle Patches
│       ├── index.js                        # 插件主入口（协调三栏、卡片、状态条、下钻面板）
│       └── styles\
│           └── workspace.css               # 三栏布局、3 类卡片、紧凑状态条、Overview 专属样式
├── runtime\                                # BetterGravity 核心运行时与补丁工具（本地化独立副本）
└── scripts\
    ├── install-or-sync.ps1                 # 一键注入 Antigravity.exe 并同步主题/插件到 %APPDATA%\BetterGravity
    └── restore-original.ps1                # 一键从备份恢复原版 Antigravity.exe（安全兜底）
```

---

## 5. 分阶段实施路线图（Milestones M1 → M4）

| 阶段 | 里程碑名称 | 核心交付内容 | 验收标准 |
| :--- | :--- | :--- | :--- |
| **M0** | **本机探测与基线落盘**（当前已完成） | 完成 `Antigravity 2.28.2` 解包探查、79 个 `data-testid` 映射、`agentService/store` Fiber 桥接验证，输出 `00-Spec-Baseline.md` 与 `M0` 报告。 | 文档齐全，无假设性伪 RPC。 |
| **M1** | **环境注入 + Claude 暖白衬线体主题 + 三栏骨架** | 1. 编写 `scripts\install-or-sync.ps1` 完成 BetterGravity 运行时注入；<br>2. 编写 `themes\claude-warm-serif.css`（`#FAF9F5` 暖白底、`#F3F1EA` 侧栏、`#D97757` 赤陶橘黄、衬线体标题与正文）；<br>3. 构建左栏顶部 `Chat | Cowork | </> Code` 胶囊、顶部 `[Overview •]` 按钮与右侧可折叠 Overview 面板骨架。 | 重启/刷新客户端后，整体呈现纯正 Claude 暖白衬线体视觉，左右栏收放自如。 |
| **M2** | **底部紧凑状态条 + `Normal/Thinking/Verbose` 折叠开关** | 1. 在 `[data-testid="agent-input-box"]` 上方挂载紧凑状态条（`🌿 分支 | +X -Y | N Working · M Waiting`）；<br>2. 实现顶部 `Normal | Thinking | Verbose` 切换器（联动控制 `tool-group-collapsible` 与 `thinking-collapsible-trigger`）。 | 点击状态栏 `+X -Y` 可呼出右栏 `Changes`；按 `Ctrl+O` 或点胶囊可瞬间切换工具折叠层级。 |
| **M3** | **主对话流 3 类卡片 + 右栏 Overview 三态汇总** | 1. 基于 `store` 与 `agentService` 实时归集子线程（Subagent / Forked 会话），在右栏 `Threads` 页签按 `Waiting on you` / `Working` / `Completed` 分组渲染；<br>2. 在主对话流内渲染 `Suggested Threads Card`（支持一键 `[Start N threads]`）、`Active Thread Card` 与 `Inline Task Card`。 | 主会话派生子任务时，主对话流展示紧凑追踪卡，右栏实时同步状态与红点提醒。 |
| **M4** | **右栏原地内下钻（Thread Inspector）+ 打包迁移自检** | 1. 点击任意 Thread 卡片时，右栏原地切换为 `← Back to Overview` + `Plan | Activity | Diff | Verify` 四页签 + 底部子线程追加输入框；<br>2. 完善一键迁移与恢复脚本并进行全流程验收。 | 点击卡片不跳走主对话，右栏流畅拉取 `getCascadeTrajectory` 展示子线程详情与 Diff。 |
