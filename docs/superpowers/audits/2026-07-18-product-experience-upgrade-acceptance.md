# 产品体验升级生产验收（Task 20-E0）

## 验收基线

- 基线提交：`2cbb457ba85d16798a530db9b56d12be6bc16ca8`（`perf: reduce resident note content`）
- 日期：2026-07-18
- 环境：Windows、Node `v24.15.0`、Playwright Chromium（隔离 context）
- 构建：`npm run build` 生成的 `dist`
- 服务器：现有生产 Node 静态服务器，`http://127.0.0.1:4174`
- 数据库：真实 `LearningKnowledgeBase` 当前 schema；测试始终先由应用初始化，再在隔离 context 写入 fixture。

已验收的提交线：A2—A6（编辑器与辅助面板）、B1—B4（年度笔记创建足迹）、D1—D3（性能基线、投影治理、图谱生命周期）。

## 自动化验收矩阵

| 能力 | 原任务 | 已有测试 | E0 集成补充 | 结果 |
| --- | --- | --- | --- | --- |
| 长正文编辑 | A2 | 编辑器单测、`editor-draft.spec.ts` | 5/50/250 KiB 打开、250 KiB 修改、保存、切换、刷新 | PASS |
| 保存状态与工作区 | A4 | workspace/draft 测试 | 保存后切换辅助标签不产生额外写入 | PASS |
| 辅助面板与 AI/知识入口 | A5/A6 | side-panel、assistant-migration E2E | 五个标签与 AI 整理/知识分析入口可访问且不自动请求 | PASS |
| 投影、正文搜索与 Wiki | D2/A3 | projection、note-links E2E | 深正文搜索→完整按需正文→正向/反向链接 | PASS |
| 年度创建足迹 | B2/B3/B4 | 纯函数、组件与 footprint E2E | 年份切换、自然周、Tooltip、键盘、日期筛选、零篇日期 | PASS |
| 实体图谱 | D3 | graph E2E、生命周期 E2E | 300 approved 实体、非 approved 排除、详情导航、返回再显示 | PASS |
| 课程与创建足迹口径 | B1/D2 | 课程与投影单测 | chapterOrder、学习状态持久化、创建计数不随 updatedAt 增加 | PASS |
| 生命周期 | D3 | graph 十轮循环 | 编辑器→面板→年度足迹→300 图谱→实体详情→首页十轮 | PASS |
| 外部网络、错误与 schema | 既有生产 E2E 约束 | smoke 与各功能 E2E | 全部 E0 场景统一拦截外网、捕获 console/pageerror、拒绝升级 | PASS |

新增 `tests/e2e/product-experience-upgrade.spec.ts` 采用六个独立场景。每个场景检查 `notes`、`deletedNotes`、`projects`、`courses`、`directories`、`images`、`aiResults`、`knowledgeEntities`、`noteEntityLinks`、`knowledgeRelations` 和 `knowledgeAuditLogs` 均已由应用初始化；`onupgradeneeded` 会立刻中止并使测试失败。

## 编辑器、投影与辅助面板

- 5 KiB 与 50 KiB 笔记均能进入 CodeMirror 编辑状态。
- 250 KiB 笔记可定位到正文尾部、输入唯一文本、完成持久化、经过关闭面板/切换笔记/刷新后仍显示完整修改。
- 切换概览、历史、目录、链接、AI 整理标签时，已存在的 EditorView DOM 节点仍连接；AI 整理和分析按钮存在，未发出 AI 请求。
- 首页预览、深正文唯一词搜索和完整正文按需打开均通过；正向与反向 Wiki 链接均可从辅助面板导航。

## 年度创建足迹

- 当前年份年度视图使用 53/54 周的自然周网格；首页 compact 足迹由既有回归测试继续保护为最近 20 个自然周。
- 历史年份可切换，再切回当前年份；月份标签、Tooltip、方向键移动、Enter/Space 激活均通过。
- 同一本地日期两篇笔记正确筛选到首页；零篇过去日期显示“这一天没有创建笔记。”；future 与 padding 格不渲染为按钮。
- 测试数据只代表笔记创建足迹，没有将学习时长或学习状态伪装成创建量。

## 实体图谱与生命周期

- 300 个 approved 实体与 299 条 approved 关系最终渲染为一个 React Flow 实例；suggested/rejected fixture 不会混入。
- 节点可导航到稳定实体详情路由，浏览器返回后可再次加载实体图谱。
- E0 十轮循环每轮都回到首页后检查：不存在 React Flow、CodeMirror 或 Tooltip 残留；无 pageerror 或 console error。
- 首页 DOM 节点数的最大差为不超过 20，未呈现逐轮单向增长；这是一项 DOM 生命周期信号，不是 heap 无泄漏证明。

## 网络、安全与数据库边界

- 所有 HTTP(S) 非 `127.0.0.1:4174` 请求都会被记录、取消并导致测试失败；本次没有被禁止请求。
- 所有 E0 场景未发生 pageerror 或 console error。
- E0 不调用 AI 供应商，也没有 mock React、Dexie、React Flow 或生产服务。
- E0 测试不创建 schema、不升级 Dexie、不删除数据库；每个 Playwright context 独立关闭，不访问 Edge/Chrome 用户 profile。

## 性能复测

完整原始结果见 [2026-07-18-e0-final.json](../../../performance/baseline/2026-07-18-e0-final.json)。以下是三轮中位数，属于当前机器上的诊断采样，不构成设备敏感 CI 门禁。

| 项目 | 规模 | 中位数结果 |
| --- | --- | --- |
| 编辑器首次可输入 | 5/50/250 KiB | 832.0 / 855.3 / 2057.5 ms |
| 编辑器短输入 | 5/50/250 KiB | 45.9 / 33.1 / 36.8 ms |
| 编辑器保存完成 | 5/50/250 KiB | 58.3 / 57.1 / 51.0 ms |
| 年度足迹首次可见 | 100/500/2000 notes | 249.5 / 175.4 / 152.0 ms |
| 图谱 ready | 50/300 entities | 681.2 / 1108.4 ms |
| 图谱首次节点可见 | 50/300 entities | 822.7 / 1234.1 ms |
| 生命周期 | 10 轮 | DOM delta 0；page errors 0 |
| Backup 原生快照代理 | 100×1 KiB / 500×5 KiB | 4.0 / 21.5 ms 总时间 |

本次 `dist` 总计 2.612 MiB；最大 chunk 是 `html2pdf`（935,882 bytes，gzip 263,986 bytes）。这项既有包体风险只记录，不在 E0 中优化。

### 测量限制

- Playwright Chromium 不是 Microsoft Edge，headless 也不是实际用户设备环境。
- `performance.memory` 仅为 Chromium best-effort 数据；DOM 稳定不等于证明不存在 heap 泄漏。
- 浏览器没有安全、通用的 listener 数量 API，因此 listener 指标为 unavailable。
- 热力图聚合没有生产埋点，首次可见时间包含聚合与渲染。
- Backup 指标使用隔离页面内的原生 IndexedDB 快照/序列化代理，不暴露或替代 `backupService` 内部实现。
- 未得到低配 GPU、数小时运行、真实 IME 或真实 Edge 的结论。

## RED 记录

首次新增定向 E2E 的结果为 `No tests found`，因为 E0 spec 尚不存在。首次实现后的断言失败来自测试错误地假设 CodeMirror 会渲染长正文尾部、以及课程卡片完整 textContent 等于标题；测试改为先聚焦并跳转到文档尾部、再按真实可见卡片结构断言。未修改任何业务代码。最终六个 E0 场景全部通过。

## Microsoft Edge 手工验收

状态：**PENDING — 需要用户在真实 Microsoft Edge 执行。**

### 启动与隔离

1. 在仓库根目录运行 `npm run build`。
2. 在第二个终端运行 `npm run e2e:server`，保持 `http://127.0.0.1:4174` 可访问。
3. 在第三个终端为独立 Edge profile 写入安全 fixture：

   ```powershell
   node scripts/e0-seed-edge-fixtures.mjs
   ```

   脚本只接受 `learning-knowledge-base-e0-edge` 标记的 profile、`http://127.0.0.1:4174`（或 localhost 等价地址），并在应用已初始化当前 schema 后写入稳定 `e0-` 记录。它不会使用 `indexedDB.deleteDatabase()`；重复运行只覆盖相同 fixture。若要先清理旧 fixture 再重建，只使用 `node scripts/e0-seed-edge-fixtures.mjs --reset`，它只删除各表中 `e0-` 主键，保留任何非 `e0-` 记录。

4. 使用独立 Edge profile，而不是日常 profile：

   ```powershell
   & "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe" --user-data-dir="$env:TEMP\learning-knowledge-base-e0-edge" http://127.0.0.1:4174
   ```

5. 如果 Edge 安装在 64 位目录，使用：

   ```powershell
   & "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe" --user-data-dir="$env:TEMP\learning-knowledge-base-e0-edge" http://127.0.0.1:4174
   ```

6. 不要删除或清空日常浏览器的 IndexedDB；脚本和 Edge 都只操作独立 E0 profile。若脚本输出仍显示空数据或拒绝 profile/URL，停止手工验收并保留输出。
7. 先记录：Windows 版本、Edge 版本、总内存、CPU、GPU、显示缩放、分辨率、电源/节能状态、后台大型程序和测试时间。可使用：

   ```powershell
   Get-ComputerInfo | Select-Object WindowsProductName, WindowsVersion, OsBuildNumber, CsTotalPhysicalMemory, CsProcessors
   Get-CimInstance Win32_VideoController | Select-Object Name, AdapterRAM, DriverVersion
   ```

### Edge 手工 fixture 准备

`node scripts/e0-seed-edge-fixtures.mjs` 成功后应显示：2022、2024、2026 年笔记；5/50/250 KiB 正文；一门三章节课程；300 个 approved 实体；600 条 approved、5 条 pending/suggested、5 条 rejected 关系。

- 两篇笔记日期：`2026-01-10`
- 一篇笔记日期：`2026-01-11`
- 零篇过去日期：`2026-01-12`
- 深正文搜索词：`E0_DEEP_SEARCH_TOKEN_2026`
- Wiki：`E0 Wiki Source` → `[[E0 Wiki Target]]`
- 图谱详情入口：`E0 Graph Entry Entity`

在启动 fixture 脚本前关闭使用同一独立 profile 的 Edge 窗口，避免 Windows profile lock。脚本完成后会关闭其 headless Edge context；再启动上面的可见 Edge 命令。它不会连接真实 AI 服务或外部 CDN。

### 手工场景清单

| 场景 | 结果 | 证据/备注 |
| --- | --- | --- |
| 首页和启动 | PENDING | |
| 5 KiB 编辑 | PENDING | |
| 50 KiB 编辑 | PENDING | |
| 250 KiB 编辑 | PENDING | |
| 中文 IME | PENDING | |
| 保存和切换 | PENDING | |
| 辅助面板 | PENDING | |
| 年度足迹 | PENDING | |
| 键盘导航 | PENDING | |
| 正文搜索 | PENDING | |
| Wiki 链接 | PENDING | |
| 300 实体图谱 | PENDING | |
| 十轮循环 | PENDING | |
| Console 错误 | PENDING | |
| 外部请求 | PENDING | |

按以下顺序执行：

1. **首页**：确认卡片、compact 20 周足迹、随机回顾与课程继续学习可见；打开 Console 确认没有红色错误，并在 Edge 任务管理器记录粗略标签页内存。
2. **编辑器**：分别操作 5/50/250 KiB 笔记。每篇输入中文 IME 组合文本、英文、删除、Undo/Redo、约 2 KiB 粘贴、等待保存、预览/编辑切换、切换笔记、返回并刷新。250 KiB 额外快速连续输入、短时 Backspace、Ctrl+F、滚至末尾、五个辅助标签、comfortable/wide、进入/退出 focus。记录丢字、跳光标、保存文案、闪烁与主观流畅度。
3. **年度足迹**：切换年份，检查 365/366 日布局和窄窗口内部横向滚动；hover Tooltip，Tab 进入日期网格，方向键、Enter/Space 激活有笔记及零篇日期；future/padding 不可交互。
4. **搜索和投影**：搜索只存在于正文深处的唯一词，打开后检查全文，再回首页确认仅短预览；检查 Wiki 前链与反链。
5. **300 实体图谱**：观察加载反馈，平移、缩放、MiniMap，点击节点到详情，返回并重复切换笔记/实体图谱 3—5 次；记录冻结、空白、重复图谱、Console 错误和粗略内存。
6. **十轮循环**：首页→250 KiB 编辑器→辅助面板→年度足迹→300 实体图谱→实体详情→首页。第 1、5、10 轮记录 Edge 任务管理器标签页内存、UI 是否变慢、Console 错误、残留 Tooltip/图谱/编辑器。内存数值可波动；只有持续明显增长且伴随体验恶化才记录为可疑。

## 结论

自动化生产验收通过，满足阶段一至四的自动化集成条件。真实 Edge 手工验收仍为 PENDING。只有自动化验收全绿、用户完成上述独立 Edge profile 清单且无阻断级 FAIL、并完成审查后，才可以考虑最终 push。
