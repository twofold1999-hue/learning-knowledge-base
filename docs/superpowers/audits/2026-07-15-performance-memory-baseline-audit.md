# Task 20-D0 性能、内存、包体与生命周期基线审计

## 1. 总体评价

当前版本适合继续开展小范围产品迭代，但在 8GB 设备上的长期高频编辑、超大笔记集合与实体图谱上限场景前，应先完成若干有证据支持的性能收敛任务。没有发现 P0 级的数据损坏、应用冻结或可复现的持续内存泄漏。

本审计明确区分三类证据：

- **静态证据**：直接阅读当前代码得到的调用、持有和清理关系。
- **运行时基线**：2026-07-15 在生产 `dist`、本地 Node 静态服务器与隔离 Playwright Chromium 上重复测得；它不是 Edge/8GB 真机结论。
- **理论风险**：规模继续增长后可能出现的问题，尚没有在本次受控数据下被证明。

## 2. 测量环境与可信度边界

| 项目 | 本次条件 |
|---|---|
| 构建 | `npm run build`，生产 `dist` |
| 服务 | 仓库 `scripts/e2e-server.mjs`，仅 `127.0.0.1:4174` |
| 浏览器 | Playwright Chromium，无痕隔离 context；未读取用户浏览器或真实 IndexedDB |
| 数据库 | 先由应用初始化当前 Dexie schema；之后仅在隔离 context 中写入数据。`onupgradeneeded` 会中止，且验证 `notes`、`deletedNotes`、`knowledgeEntities`、`noteEntityLinks`、`knowledgeRelations`、`knowledgeAuditLogs` 均存在 |
| 重复 | 时间类各 3 次，报告中位数；页面循环 10 次 |
| 内存/DOM | CDP `Memory.getDOMCounters`；每个采样点请求 `HeapProfiler.collectGarbage` |
| 不可用指标 | Chromium 本次 `Performance.getMetrics` 未提供 `JSHeapUsedSize`，因此 heap 数值记为 unavailable；未采集浏览器 Long Task API、CPU 使用率、GPU 或真实 Edge 内存 |

绝对时间会受 CPU、磁盘、扩展、后台程序、Chromium 版本和无头模式影响。这里可用于后续同环境相对比较，不能冒充 Windows 8GB、较旧 CPU、集显的 Edge 真实体验；这些仍需人工设备验证。

## 3. 应用启动与 Bundle 结构

`npm run build` 成功。构建输出中主要 JavaScript 资产如下（原始/gzip）：

| 资产 | 原始 | gzip | 观察 |
|---|---:|---:|---|
| `html2pdf-*.js` | 935.88 KB | 265.63 KB | 唯一触发 Vite 550 KB 大 chunk 警告；设置/导出动态导入 |
| `CodeMirrorEditor-*.js` | 531.71 KB | 183.98 KB | 编辑器内按需加载 |
| `dist-*.js` | 350.01 KB | 99.37 KB | 第三方基础依赖聚合 chunk |
| `index-*.js` | 248.73 KB | 81.02 KB | 入口应用 chunk |
| `exportService-*.js` | 171.82 KB | 54.88 KB | 导出路径 |
| `style-*.js` | 141.14 KB | 45.66 KB | 样式相关运行时 |
| `jsx-runtime-*.js` | 119.87 KB | 37.85 KB | React JSX 运行时 |
| `EditorPage-*.js` | 86.03 KB | 24.41 KB | 路由页面；AI 组件也在其静态依赖链内 |
| `EntityGraphView-*.js` | 18.14 KB | 7.07 KB | 图谱实体模式单独 lazy |
| `Heatmap-*.js` | 3.61 KB | 较小 | 热力图组件；完整热力图页面是路由 lazy |

入口的加载关系是：

```text
main / App
├─ 首屏框架、Sidebar、Zustand 与路由
├─ lazy 路由：Home、Editor、Settings、Heatmap、Graph、实体详情等
│  ├─ EditorPage -> lazy CodeMirrorEditor
│  └─ GraphPage -> lazy EntityGraphView（React Flow/d3-force）
└─ 导出路径 -> dynamic html2pdf/docx
```

静态证据表明 CodeMirror、实体图谱和 html2pdf 均未进入首屏入口。当前最显著的包体问题是导出用 `html2pdf` 的独立大 chunk，而非首屏被它拖累；没有 bundle analyzer，不能将该 chunk 精确分摊到单个依赖。`index`/基础依赖是合理的拆分候选观察点，但不应仅因体积就继续细碎拆分。

未发现 source map 随 `dist` 输出。PWA 预缓存本次构建为 30 个条目、约 1759.18 KiB；这会影响首次安装/更新下载量，应与首屏网络加载分开看待。

## 4. 全局数据加载与 Zustand 常驻状态

**静态证据：** `main.tsx` 完成迁移后才挂载应用；`App.tsx` 初始化并行加载 `loadAllNotes()`、项目、课程和目录。`noteService.fetchNotes()` 在无筛选时使用 `db.notes.toArray()`。`noteStore` 将完整活动笔记同时保留在 `allNotes`，并在部分工作流中保留 `notes`、`currentNote`；`Note.content` 是完整正文。当前未在启动时加载 `deletedNotes`、知识实体/关系、AIResult 或审计日志。

更新笔记会写入 Dexie，随后替换 store 中的相关数组项，并通知使用 `allNotes` selector 的 Sidebar、首页、热力图、笔记图谱、编辑页标签/双链派生逻辑和设置导出入口。活动笔记正文因此是实际常驻数据，而实体/关系等目前是按页面查询的临时快照。

| 规模 | 常驻正文风险 | 结论 |
|---|---|---|
| 100 篇 | 低 | 当前实现可接受 |
| 500 篇 | 中 | 完整正文和派生 `allNotes` 消费者开始值得关注 |
| 2000 篇 | 高 | 不能按本次小正文热力图数据推断为安全；全文常驻和全量复制会放大内存与渲染传播 |

本次没有捏造 MB 估算：真实占用高度取决于每篇正文、图片 Data URL、AI payload 和浏览器字符串实现。

## 5. 编辑器输入和保存性能

**静态输入链路：** CodeMirror 每次 document change 会调用 `state.doc.toString()`，即单个字符也生成完整正文字符串；`EditorPage` 随后更新局部 `content` state 并向 `editorSaveCoordinator` 发送保存请求。协调器以 800ms debounce 执行保存；保存路径更新 Dexie、同步 store，并安排 1.5 秒后的本地备份调度。

CodeMirror `EditorView` 只在 mount 创建，cleanup 中销毁；外部 `value` 与当前文档相等时不会重新 dispatch，因此没有“每次输入重建编辑器”的静态证据。AIHistoryPanel、KnowledgeOverviewPanel 在编辑模式默认挂载，会随父组件 render，但其读取 effect 依赖 noteId/refresh key，不会为每个字符重查 Dexie。Markdown preview 不与编辑模式同时常驻。链接相关查询在当前笔记变化时触发，预览更新使用 250ms 定时器；需要在后续任务中进一步确认全量扫描成本与实际频率。CodeMirror 自身处理 IME，本代码未额外监听 composition 事件；长中文输入仍应在真实 Edge 手工验证。

保存不是同步阻塞输入的直接写入，但 `toString`、React render 与大段粘贴在主线程进行。保存后 `noteService.updateNote` 还会重新读取单条笔记，属于可量化的额外 I/O。

## 6. 编辑器运行时基线

测试为进入编辑页、切到编辑模式、输入唯一短文本、等待已持久化、粘贴约 2 KiB 文本，再切换预览/编辑。单位为 ms，中位数（3 次）。自动保存含 800ms debounce，因此不应与纯 Dexie 写入耗时混同。

| 初始正文 | 到可输入 | 短输入 | 自动保存完成 | 约2KiB粘贴 | DOM 节点（前→后，最大） |
|---|---:|---:|---:|---:|---:|
| 5 KiB | 757.9 | 13.0 | 822.4 | 7.9 | 267 → 273 |
| 50 KiB | 747.1 | 26.0 | 820.0 | 30.3 | 297 → 301 |
| 250 KiB | 776.0 | 37.1 | 820.7 | 30.3 | 286 → 286 |

在这台 Chromium 基线上，250 KiB 并未造成进入编辑器或单次粘贴的秒级退化；但输入耗时从 13.0ms 增至 37.1ms，和全量字符串生成的静态证据一致，属于 **P1 需要保护的增长方向**。DOM 数不随正文线性增长，说明 CodeMirror 虚拟化/渲染策略在此次内容模式下有效。heap 指标不可用，不能据此声称长正文无内存问题。

未完成的细化指标：没有侵入式埋点时，无法将浏览器内的 `buildEntityGraph`、Dexie 写入、React render 与布局精确拆成独立时间；本审计使用用户可见的端到端可交互/持久化时间，不伪造子阶段数字。

## 7. 热力图运行时基线

测试将 100/500/2000 篇小正文活动笔记写入隔离库，reload 后进入 `/heatmap`，点击日期方格；单位为 ms，中位数（3 次）。

| 活动笔记 | 到完整热力图可见 | 日期点击到路由/过滤启动 | DOM 节点（进入→点击后） |
|---|---:|---:|---:|
| 100 | 579.8 | 138.8 | 376 → 119 |
| 500 | 608.8 | 141.1 | 376 → 119 |
| 2000 | 583.5 | 152.5 | 376 → 119 |

`Heatmap` 固定渲染 26×7=182 个日期按钮（紧凑版 140）；本次 DOM 数不随笔记数增长，方格本身不是明显成本。其 dateMap 在 `allNotes` 引用改变时遍历全量笔记，因而 2000 条小记录也不能证明大正文、频繁更新的 store 快照没有成本。页面导航时间含应用 reload、Dexie 全量读取、路由和渲染，不能视为单独聚合时间。十轮循环后的 DOM 计数稳定，未发现热力图离开后持续节点增长。

## 8. 实体图谱运行时基线

测试使用 approved-only 的 50/300 实体和约 2.5 倍关系，进入 `/graph` 后切换实体图谱，等到 React Flow 首个节点可见；单位为 ms，中位数（3 次）。`forceLayoutAdapter` 对多节点固定执行 180 tick，并且 graph builder 在视图中同步执行。

| 实体 | 到实体图谱首次节点可见 | 可见时 DOM 节点/监听器最大 | 离开后 DOM 节点/监听器 |
|---|---:|---:|---:|
| 50 | 782.5 | 1397 / 529 | 162 / 164 |
| 300 | 1252.0 | 7022 / 2154 | 162 / 164 |

这是完整页面阶段（Dexie approved 读取、builder、固定布局、React Flow、MiniMap）的用户可见基线；未经生产代码性能标记，不能把 1252ms 虚构拆分为 builder/layout/React Flow 的精确占比。纯函数已有独立测试和固定 180 tick 契约，但本任务重点是页面生命周期。

静态证据表明 d3 simulation 在 tick 前调用 `stop()`，没有全局坐标缓存；EntityGraphView effect 有 request-id/active 防过期 setState，GraphPage 仅在实体模式挂载它。离开后 DOM/监听器均回到 162/164，支持“React Flow 随视图卸载”的结论；但这不是 Chrome 内部对象引用链证明，不能写成绝对无泄漏。

## 9. 页面切换与内存回落

在同一隔离 context 中循环 10 次：编辑器 → 热力图 → 实体图谱 → 首页 → 编辑器，并在每轮回到首页后请求 GC。每轮均为 **1504 DOM 节点、409 listener、1 document**。没有单向增长；`JSHeapUsedSize` 本环境不可用，故不能用 heap 回落做更强断言。

结论：本次受控 10 轮没有发现持续 DOM/listener 增长，也没有 console error 或未处理 rejection。它不等价于真实用户在多个 tab、媒体预览、长时间 AI 操作或大量图片下的内存证明。

## 10. 定时器、监听器和资源清理

| 来源 | 类型 | 创建位置 | 清理位置 | 判断 |
|---|---|---|---|---|
| 编辑器保存 | 800ms timer | `editorSaveCoordinator` | flush/cancel 与页面协调清理 | 已有生命周期保护；仍需长期手工验证快速切换 |
| 本地备份 | 1.5s module timer | `scheduleLocalBackup` | 下次调度会 clear；模块级不随页面卸载 | 可能跨页面存活，设计上用于合并写入，不是泄漏证据 |
| Markdown/链接延迟 | 250ms timeout | `EditorPage` effect | effect cleanup | 静态上已清理 |
| CodeMirror | EditorView/listener | `CodeMirrorEditor` mount | `view.destroy()` cleanup | 已正确清理 |
| React Flow | 内部 listener/observer | EntityGraphView 挂载 | 组件卸载 | 运行时 DOM/listener 回落支持正确清理 |
| d3-force | simulation | `forceLayoutAdapter.layout` | `simulation.stop()`，无持续 tick timer | 已正确停止 |
| 视频临时 URL | Object URL | VideoPanel | 替换/卸载时 revoke | 静态上已清理 |
| 导出 URL | Object URL | 设置/导出流程 | 下载后 revoke | 静态上已清理 |
| window/keyboard/message | 页面 effect | EditorPage、命令面板等 | 对应 cleanup | 静态上已看到移除；未逐项做长时运行证明 |

未发现当前代码主动使用 `ResizeObserver`、`MutationObserver`、`IntersectionObserver`、持久 requestAnimationFrame 或永久 d3 animation。第三方 React Flow 的内部 observer 行为依赖其实现，运行时回落是本次唯一可重复证据。

## 11. Dexie 与 Backup 成本

`createBackup()` 已在一个 readonly Dexie transaction 内读取 notes、deleted notes、项目、课程、目录、图片、AIResult、实体、链接、关系与审计；因此生成备份是全库快照操作。`scheduleLocalBackup()` 将它延后 1.5 秒并合并频繁突发变更，未在每个字符输入时直接执行。若未连接本地目录，则 `writeLocalBackup()` 会在权限/目录检查后快速返回。

真实风险在于：一次保存后的 1.5 秒，完整备份会在主浏览器环境中序列化完整数据，尤其是 images Data URL、AI payload 与审计历史增长后。这个成本未在本次隔离基线中构造大型图片/AI 审计数据，故是 **P2 理论风险**，不是已测到的输入阻塞。AI/知识写入通过持久化成功通知进入既有调度，事务失败不会产生假备份；没有发现每次输入同步触发全库 backup 的证据。

## 12. AI及重模块常驻情况

EditorPage 在编辑模式默认挂载 AIKnowledgeAnalyzer、KnowledgeOverviewPanel、AINoteOrganizer 和 AIHistoryPanel；因此这些 React 组件和其渲染逻辑属于编辑路由常驻部分。AIHistoryPanel 与知识概览的读取由 noteId/refresh 触发，不随正文每个字符发起查询。AI 客户端/Prompt 依赖在 EditorPage 路由链中，而不是首屏入口；没有看到独立的 AI 面板 lazy chunk。

面板即便视觉收起仍保持挂载和已有查询结果，这是可预期的体验/性能权衡。当前没有 AI 自动轮询、全局事件总线或未使用 AI 时仍发起网络请求的静态证据。是否需要将辅助面板延迟挂载，必须先用真实编辑行为与低配 Edge 测量，而不能仅凭架构偏好决定。

## 13. 三级规模评价

| 项目 | 日常：100篇/数百实体 | 中等：500篇/数千实体 | 压力：2000篇/上万实体 |
|---|---|---|---|
| 编辑器 | 良好（5–250KiB 受控基线） | 可接受，需关注输入全量字符串 | 有风险，长正文与 store 正文常驻未充分测量 |
| 首页/列表 | 可接受 | 有风险，`allNotes` 全文常驻与消费者传播 | 有风险 |
| 热力图 | 良好（固定182格，2000小记录基线稳定） | 可接受 | 可接受于小记录；大正文内存未测量 |
| 实体图谱 | 可接受（50实体） | 有风险（300实体首次可见约1.25s） | 未测量；builder 会截断300节点，但读取与关系量仍可能增长 |
| 启动 | 可接受 | 有风险，启动全量 `notes.toArray()` | 有风险 |
| 内存稳定 | 未发现10轮DOM/listener增长 | 未测量真实大正文 | 未测量 |

课程、学习记录的独立运行时模型尚未存在，不能虚构“20/50/100门课程”指标。

## 14. 测试保护现状

| 保护项 | 状态 | 说明 |
|---|---|---|
| 单元/组件/E2E功能回归 | 已覆盖 | 现有 Vitest、Node server test、Playwright 生产 E2E |
| bundle 大小门禁 | 完全缺失 | 只有 Vite 构建告警 |
| 页面加载性能基线 | 完全缺失 | 本次临时脚本未提交 |
| 长正文编辑 | 部分覆盖 | 有功能/生命周期保护；无正式性能回归阈值 |
| 热力图大规模 | 完全缺失 | 无100/500/2000固定数据性能测试 |
| 图谱生命周期 | 部分覆盖 | 有 builder/layout/view 测试；无正式10轮内存回落保护 |
| Dexie 大数据/备份耗时 | 完全缺失 | 只有正确性与事务测试 |

不建议现在把不稳定的绝对毫秒门槛直接放入 CI；应先沉淀可重复脚本与相对趋势报告。

## 15. 优化候选及收益排序

| 候选任务 | 证据 | 预期收益 | 回归风险 | 是否可并行 |
|---|---|---|---|---|
| 20-01：编辑器渲染边界与长正文输入诊断 | 单字生成完整字符串；250KiB输入37.1ms | 降低高频输入主线程压力 | 中；不能破坏保存/AI应用竞态 | 可与热力图视觉并行，不与编辑器视觉并行 |
| 20-02：Wiki/双链查询频率与索引投影审计后收敛 | 编辑器派生查询与 `allNotes` 全文常驻 | 减少大库下派生扫描 | 中高，需要明确查询契约 | 不建议与20-01并行 |
| 20-03：`allNotes` 轻量投影/按需读取设计 | 启动 `notes.toArray()`，完整正文常驻 | 降低启动与长期内存 | 高，影响多页面消费者 | 先设计，后实施 |
| 20-04：图谱300节点交互性能优化 | 300实体首次可见1.25s、7022 DOM节点 | 改善上限图谱可见时间 | 中；不能破坏布局稳定性/导航 | 可与编辑器工作并行 |
| 20-05：可重复性能诊断脚本 | 本次临时脚本有效但不可提交 | 持续发现趋势，不改业务行为 | 低 | 可独立 |
| 20-06：备份大资产成本测量 | 全库 transaction + JSON 序列化是静态事实 | 确认图片/AI历史增长拐点 | 低 | 可独立 |

建议模型强度：20-01/20-04 需要高推理与完整回归；20-05/20-06 中等即可。路由级拆分的收益当前主要来自 `html2pdf` 已独立加载，除非后续网络基线证明其他路由 chunk 有问题，不应立即拆更多基础模块。

## 16. 不建议立即实施的优化

- **365格热力图虚拟化或 Canvas**：当前完整热力图只有182格，DOM基线稳定，没有证据支持复杂化。
- **Web Worker/WASM force layout**：300节点有约1.25s首次可见风险，但当前固定180 tick、离开回落正常；先测真实低配设备再决定。
- **全项目 `React.memo`/任意缓存**：会掩盖数据流问题并提高失效风险，没有具体热点证据。
- **替换 CodeMirror**：长文本受控基线仍可用，问题首先是应用层完整字符串/派生数据边界，而非编辑器库已被证明失效。
- **全面把 AI 面板 lazy 化**：存在默认挂载，但尚无低配设备体验证据；先验证后再做局部延迟挂载。

## 17. P0/P1/P2风险

| 等级 | 风险 | 静态证据 | 运行时证据 | 用户影响/建议阶段 |
|---|---|---|---|---|
| P0 | 无 | — | 未发现明确泄漏、冻结或数据损坏 | 无需紧急修复 |
| P1 | 长正文输入随全文字符串生成增长 | CodeMirror `doc.toString()` -> 父 state | 5/50/250KiB短输入中位数13.0/26.0/37.1ms | 高频长笔记可能卡顿；优先20-01 |
| P1 | 图谱上限页面首次可见偏慢 | 同步builder + 180 tick + React Flow/MiniMap | 300实体1.252s、7022 DOM节点 | 8GB旧设备可能明显；20-04先诊断再优化 |
| P2 | 全量正文 `allNotes` 常驻和更新传播 | App启动 `toArray()`、store保留完整Note | 热力图小记录2000稳定，但未测大正文 | 规模增长风险；20-03设计 |
| P2 | Backup 全库快照与大资产序列化 | readonly全表读取、JSON写两份本地文件 | 未构造大图片/AI审计数据 | 后期保存后后台压力；20-06测量 |
| P2 | 缺少持续性能/包体回归保护 | 仅有Vite警告、无正式基线脚本 | 本次脚本是临时的 | 性能回退难发现；20-05 |

## 18. 建议实施任务拆分

1. **Task 20-01 编辑器输入链路测量与渲染边界**：先把正文草稿、辅助派生视图和保存协调的性能契约拆清；不改数据库/Backup；高风险，不能与编辑器视觉任务并行。
2. **Task 20-02 Wiki链接查询收敛**：量化当前查询频率、为按需索引/节流提出最小方案；可能影响数据读取，不改 schema；中高风险。
3. **Task 20-03 allNotes 投影设计与迁移**：定义轻量列表索引与需要全文的页面边界；可能影响持久化读取和 Backup 调度，但不应先改 Backup；高风险，先设计。
4. **Task 20-04 图谱上限体验诊断**：检查 MiniMap、节点转换和布局在真实低配 Edge 的占比；不改数据库/Backup；中风险，可与热力图工作并行。
5. **Task 20-05 可重复性能基线脚本**：把安全隔离数据库初始化、测量环境和趋势格式整理为可选开发工具；不改数据库/Backup；低风险，可独立。
6. **Task 20-06 大备份资产压测**：用受控图片/AI审计数据量化快照和序列化，不修改导出语义；不改数据库/Backup；低风险，可独立。
7. **Task 20-07 长时间页面循环手工/生产E2E**：将10轮以上生命周期检查作为诊断工具，避免固定毫秒阈值；不改数据库/Backup；中风险。

## 19. 数据库和Backup影响

本审计没有修改 Dexie schema、实体/关系模型、AIResult、Backup 版本或 JSON 格式。建议任务中，20-01、20-04、20-05、20-06、20-07 不要求 schema 或 Backup 升级；20-02/20-03 若改变全局数据投影，需要先评估读取服务与本地备份通知契约，但不应预设升级。

## 20. 仍需真实8GB Edge设备验证的问题

- Edge、真实扩展和后台程序下 5/50/250KiB 中文输入、IME 组合输入与大段粘贴的输入延迟。
- 带真实图片、视频、AI历史和审计 payload 的启动、保存后本地备份与内存回落。
- 300实体图谱在集显下的交互、缩放、MiniMap、首次布局及连续筛选。
- 500/2000篇真实长正文而非本次小正文热力图数据下的启动、`allNotes` 内存和日期聚合。
- 长时间多页面切换后 Chromium/Edge heap 与 GPU 资源是否在显式GC后持续增长。

本次临时测量脚本与结果均在系统临时目录运行，未提交且已在审计完成前删除。
