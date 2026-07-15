# Task 20-A0 编辑器体验与保存链路审计

## 1. 总体评价

当前编辑器是可用的本地优先 Markdown 编辑页：正文采用 CodeMirror 6，预览使用同一份 Markdown，普通输入在 800ms 合并后写入 IndexedDB。`EditorPage` 不直接访问 Dexie，读取和写入仍经 Zustand store 与 service，基础分层正确。

但它尚不是目标设计中的学习工作台。编辑模式把 AI 整理、知识分析、知识概览和 AI 历史纵向插在正文前，没有独立右侧辅助区；`EditorPage` 同时承担路由、加载、字段草稿、保存协调、预览、链接查询、媒体桥接和多块辅助 UI。最重要的问题是：AI 摘要应用成功后，旧的编辑器待保存内容没有失效机制，存在后续 flush 覆盖已应用摘要的交错窗口。

结论：先处理保存一致性和高频输入读取边界，再进行布局优化；不建议在这些边界未收敛前重写编辑器或自研混合 Markdown 编辑体验。

## 2. 当前编辑器架构

```text
App 路由 /editor/:noteId
  -> Layout（全局 Sidebar + TopBar + 可滚动 main）
  -> EditorPage
       -> useNoteStore（fetchNote / updateNote / 保存状态）
       -> 标题、目录、项目、课程、标签、关联概念输入
       -> CodeMirrorEditor（Markdown 源码输入、工具栏、图片粘贴）
       -> renderMarkdownPreview（仅预览模式）
       -> findBacklinks / findForwardlinks
       -> AIKnowledgeAnalyzer / KnowledgeOverviewPanel
       -> AINoteOrganizer / AIHistoryPanel
  -> noteStore -> noteService -> db.notes（Dexie）
```

- `src/pages/EditorPage.tsx` 是路由页和主要编排者；用 `actualNoteId`、`pendingSaves`、`debounceTimers` 管理本页草稿保存。
- `src/components/CodeMirrorEditor.tsx` 是实际正文输入组件。它使用 CodeMirror 6，不是 `textarea`、`contenteditable` 或富文本编辑器。
- `src/services/markdownService.ts` 用 `marked` 解析 Markdown、DOMPurify 清理 HTML，并异步解析本地图片引用。
- `src/stores/noteStore.ts` 负责保存状态和完整 Note 回写；`src/services/noteService.ts` 负责 Dexie 更新与读取。页面没有直接读写 Dexie。
- AI/知识面板仅在编辑模式挂载。它们会随父页正文 state 更新重新 render，但 `AIHistoryPanel` 和 `KnowledgeOverviewPanel` 的查询 effect 只依赖 `noteId`、刷新键和稳定 service，不会逐字符重新查询。
- 当前没有通用右侧抽屉、可停靠面板或多标签辅助区基础。可复用的只有全局 `Layout` Sidebar、预览模式的 `Outline` 和各自独立的折叠组件。

## 3. 输入模型与数据流

### 正文、标题与草稿

- 正文编辑源是 `EditorPage` 的局部 `content` state；持久化版本在 store 的 `currentNote` / `allNotes`。
- CodeMirror 的 `EditorView.updateListener` 在 `docChanged` 时执行 `update.state.doc.toString()`，通过 `onChange` 将完整正文传给页面；页面执行 `setContent(val)` 与 `triggerSave({ content: val })`。
- 标题原生 `<input>` 直接执行 `setTitle()` 与 `triggerSave({ title })`。标题、正文、标签、目录、项目、课程、视频字段和关联概念共用同一笔记的 pending patch 与 800ms 定时器。
- 草稿只存在组件内存，不是跨页面持久化草稿；卸载时只尽力 flush。
- 正常键入不会逐键更新 Zustand Note；会逐键更新页面局部 state，并使该页面及编辑模式的子组件重新 render。

### 编辑器行为

- CodeMirror 仅在挂载时初始化。普通键入时外部 value 与内部文档一致，不会重新创建 `EditorView`。
- 加载另一笔记或 AI 应用等外部内容变更，会以一次全量 `from: 0, to: currentDoc.length` dispatch 替换文档；编辑/预览切换会卸载并重新挂载 CodeMirror。因此 undo 历史、光标、选区和滚动位置没有跨这两类切换的显式保留。
- CodeMirror 自身提供原生输入法支持；项目没有 composition/中文输入法测试。这是运行时确认项，不能从没有手写 composition handler 推断为现有故障。
- 图片粘贴会先通过 FileReader 生成 Data URL，并立即写入 `images` 表；成功后才向正文插入 Markdown 图片引用，单张上限 12MB。

## 4. Markdown能力矩阵

|能力|当前状态|代码证据与边界|
|---|---|---|
|标题|已支持|CodeMirror Markdown 语言、H1/H2/H3 工具栏、`marked` 预览|
|加粗、斜体、删除线|已支持|工具栏/快捷键插入 `**`、`*`、`~~`；GFM 解析|
|有序/无序列表|已支持|工具栏前缀和 GFM|
|任务列表|已支持|工具栏插入 `- [ ]`；预览为静态任务项，未提供预览内勾选同步|
|引用|已支持|工具栏 `> ` 与预览 CSS|
|链接与 Wiki 链接|已支持|普通链接工具栏；`[[标题]]` 转内部 `#note:id`；外链使用 `noopener noreferrer`|
|图片|部分支持|粘贴图片写本地 `images`，预览替换 `img_` 引用；只有图片粘贴入口，容量会影响 IndexedDB/备份|
|表格|部分支持|`marked` GFM 与表格 CSS；没有横向滚动包装或编辑表格工具|
|行内代码|已支持|工具栏/快捷键和预览样式|
|代码块|已支持|fenced code；预览 `pre` 横向滚动|
|代码语言标记|部分支持|可保存/解析 fenced language；未接入语言专用预览高亮|
|语法高亮|部分支持|CodeMirror 高亮 Markdown 语法；预览无 Prism/Highlight.js 类配置|
|数学公式|不支持|未发现 KaTeX、MathJax 或数学扩展|
|HTML|部分支持|`marked` 输出后经 DOMPurify；style/iframe/object/embed/form 被禁止，不是任意 HTML 能力|
|脚注|无法确认/未显式支持|未发现脚注插件或测试|
|自定义学习块|不支持|未发现语法、parser 扩展或组件渲染器|

编辑与预览基于同一份 `content`。预览 effect 在编辑模式直接 return，所以不会在正常每个字符输入时解析全文。HTML 在 `dangerouslySetInnerHTML` 前经 DOMPurify；现有单测覆盖脚本、事件属性和 `javascript:` 链接清理。

## 5. 自动保存真实链路

```text
正文输入
  CodeMirror updateListener -> onChange(full Markdown)
  -> EditorPage.setContent + triggerSave({ content })
标题/元数据输入
  -> 对应 setState + triggerSave(partial patch)
triggerSave
  -> pendingSaves[noteId] 合并 patch
  -> 清除同 noteId timer
  -> 800ms 后 trackFlush(noteId)
flushPendingSave
  -> 读取并删除 pending patch
  -> useNoteStore.updateNote(noteId, patch)
  -> noteService.updateNote
  -> db.notes.update(...updatedAt) -> fetchNote(noteId)
  -> store 同步完整 Note、isSaving/saveError
  -> scheduleLocalBackup()（1.5s 防抖）
```

真实位置：

- `src/pages/EditorPage.tsx`：`triggerSave`（800ms）、`flushPendingSave`、Ctrl/Cmd+S、路由切换和卸载清理。
- `src/services/saveCoordinator.ts`：登记已开始的 flush Promise，并提供 `waitForPendingSaves()`。
- `src/stores/noteStore.ts`：保存状态、完整 Note 回写和本地备份调度。
- `src/services/noteService.ts`：验证关联 ID 后执行 `db.notes.update()`，再 `fetchNote()`。

结论：存在 800ms debounce，标题和正文共用同一笔记 timer。普通逐键不直接写 Dexie；停顿或显式保存才写。图片粘贴是单独立即写 `images` 的例外。失败时 `flushPendingSave` 会把 patch 放回 map，但不会重新安排 timer；下一次输入、Ctrl/Cmd+S、切换或卸载 flush 才会重试。页面有“保存中... / 已保存 / 保存失败”状态。

切换笔记时以旧 `noteId` 调用 flush，避免写错新笔记；store 的 requestId 也防旧读取回写。卸载时清除 timers 并以 `Promise.allSettled(trackFlush(...))` 尽力保存；预览切换和导出也会 flush。未发现 `pagehide`、`visibilitychange` 或 `beforeunload` 处理。浏览器/进程突然关闭时，未触发的 800ms 草稿没有应用层保证。

## 6. 保存可靠性与竞态风险

### 已确认、需要优先修复的交错

`applyAIResult()` 在 `notes + aiResults` 事务内原子写入整理后的正文并标记 AIResult 为 applied（`src/services/aiResultApplicationService.ts`）。成功回调在 `EditorPage` 只执行 `setContent(appliedNote.content)` 与 `synchronizePersistedNote(appliedNote)`；它没有取消、替换或版本化该 note 的 `pendingSaves` / debounce timer。

因此，只要同一笔记仍存在旧内容 patch 或已开始的旧 flush，并且 AI 摘要通过 hash 校验后完成应用，旧 `noteService.updateNote()` 仍可以在之后写入旧正文。常见 stale 校验会拦截“正文已不同”的应用，但不能覆盖所有交错：例如旧待保存内容回到与持久化源相同，或旧写入在 AI 事务之后完成。没有 revision/CAS 或保存序列来拒绝过期写入。这是有代码证据的错误覆盖窗口，归类 P0。

|结论|证据|评价|
|---|---|---|
|切换笔记不会把 pending patch 写向新 note|`trackFlush(previousNoteId)` 显式携带旧 ID；store 按 requestId 防旧读取|已受实现保护，但无专门时序测试|
|卸载不会保留 timer|cleanup 清除 timer 后发起按 ID flush|已尽力处理；异步 flush 不能由 React 卸载等待|
|保存失败不会立即丢弃 patch|catch 将 patch 合并回 `pendingSaves`|已保护；无自动重试，离页后的失败恢复较弱|
|同字段并发没有显式序列协议|独立 `db.notes.update`，无 version/compare-and-set|理论风险，需时序测试；不应宣称已频繁发生|
|突然关闭可能丢最近输入|没有 page lifecycle flush|明确边界，仍需真实验验证窗口|

`saveCoordinator` 只跟踪已经开始的 Promise，不跟踪仍在 800ms 等待的 timer；它适合等待 active write，不能独立保证所有未触发草稿已统一 flush。

## 7. 当前布局与视觉问题

|目标项|当前状态|审计判断|
|---|---|---|
|左侧导航常驻|当前已具备（桌面）|`Layout` 提供 264px Sidebar；移动端变覆盖式侧栏|
|中间正文优先|需要局部调整|编辑模式正文前固定堆叠 AI 分析、知识结构、AI 整理、AI 历史|
|右侧辅助面板默认收起|需要新增能力|仅预览模式有固定 `Outline`；没有编辑模式抽屉/停靠面板|
|右侧覆盖或固定|需要新增能力|没有统一容器、开关、宽度或覆盖/推开策略|
|普通正文约 800px|需要局部调整|预览 `maxWidth: 920px`，编辑 `maxWidth: 1320px`，没有正文/宽内容规则|
|宽内容扩展|可复用现有基础实现|编辑容器较宽，但没有用户可控宽屏模式|
|上下文工具栏|部分具备|固定 Markdown 工具栏，不按选区/块类型变化|
|专注/宽屏模式|需要新增能力|未发现模式 state 或入口|

顶栏编辑/预览切换和保存状态清晰。`Outline` 仅预览模式、两级以上标题时固定在右侧，1180px 以下隐藏并有自身纵向滚动。主 `Layout` 是页面纵向滚动容器；正文预览没有第二个纵向滚动容器，代码块有横向滚动，AI 预览/历史展开区有局部滚动。图片有 `max-width: 100%`；表格没有明确横向滚动包装，长不可断单元格与窄屏行为需实测。课程字段的固定二/三列 grid、辅助面板和 CodeMirror 焦点样式缺少专门小屏/键盘验收。

## 8. 组件职责与渲染边界

`EditorPage` 确实同时编排路由加载、创建、多个字段 state、保存 timer、预览渲染、链接查询、媒体桥接、删除/导出，以及四个 AI/知识面板；这不是单纯文件过长，而是保存交错、布局和测试边界难以隔离的原因。

正面事实：页面不直访 Dexie；CodeMirror 封装初始化、工具栏和图片粘贴；预览在独立 `markdownService`；AIHistory/KnowledgeOverview 各自封装只读查询、加载和 requestId 防旧请求。未发现全局事件总线、新 editor Zustand store、未清理 interval，或 parser 在组件 render 内重复初始化。

正文每次变化会重渲染父页和编辑模式已挂载的 AI/知识组件。两个只读面板不会逐字符重新查询，但会重新 render；AI 整理和知识分析均接收 `content` prop。历史多、面板展开或正文很长时，此边界需要测量。

## 9. 编辑流畅度和内存风险

|项目|判断|证据|
|---|---|---|
|每字符全量字符串复制|有代码证据|CodeMirror `doc.toString()`、`setContent` 和受控 value 同时持有全文；同步 effect 再读取全文比较|
|每字符解析 Markdown 预览|暂无此风险|预览 effect 在编辑模式 return，预览时才解析|
|每次输入停顿扫描笔记集合|有代码证据|250ms 后 backlinks/forwardlinks 分别调用 `db.notes.toArray()`；无链接时 forward 会提前返回|
|辅助面板每键重新查 Dexie|暂无此风险|effect 不依赖 content|
|辅助面板每键 React render|有代码证据|位于 `EditorPage` 编辑分支，父 state 更新会重新执行|
|编辑器每键重建/丢光标|暂无此风险（普通输入）|初始化 effect 为 `[]`，相同 value 不 dispatch；外部替换/模式切换除外|
|图片 Object URL 泄漏|暂无此风险|使用 Data URL，不创建 Object URL|
|异步粘贴孤立图片|有代码证据|图片先持久化，若 `viewRef.current !== view` 则不插正文，也不删除图片|
|timer/listener 泄漏|暂无明显证据|timer、message、keydown、预览与链接 timer 均有 cleanup|

长正文、多笔记与 8GB 设备上的实际耗时尚未测量。当前 250ms 全表链接扫描比 Markdown 预览更可能先成为键入后稳定时间的瓶颈。

## 10. 测试覆盖现状

|行为|现状|依据|
|---|---|---|
|Note service 基本更新和删除事务性|已覆盖|`src/services/noteService.test.ts` 覆盖并发局部字段更新、删除清理回滚|
|Markdown 安全、Wiki 链接、本地图片替换|已覆盖|`src/services/markdownService.test.ts` 共 3 项|
|生产创建笔记、编辑标题、保存、刷新保留|部分覆盖|`tests/e2e/smoke.spec.ts` 只填标题并等待 1 秒|
|正文 CodeMirror 输入与自动保存|完全缺失|未找到 `CodeMirrorEditor` / `EditorPage` 测试或正文 E2E 断言|
|快速切换、保存失败、卸载前保存|完全缺失|只有实现层保护，没有时序测试|
|AI 应用后编辑器同步与旧草稿不覆盖|完全缺失|AI service 有事务测试，但没有 EditorPage pending save 交错测试|
|编辑/预览切换、长正文、大段粘贴、输入法|完全缺失|未找到组件或 E2E 覆盖|

本次实际运行 `npx vitest run src/services/noteService.test.ts src/services/markdownService.test.ts`：2 个文件、11 项通过；`npx playwright test tests/e2e/smoke.spec.ts`：5 项通过。通过结果不能扩大解释为覆盖正文保存时序。

## 11. 与目标设计的差距

目标中的“Markdown 唯一主来源”“本地草稿 + 700–1000ms debounce”“保存状态”已有基础：当前 Markdown 是主来源、局部草稿存在、800ms debounce 和保存状态均已实现。

差距是：保存没有版本/序列协调；正文与辅助内容没有主区/右侧面板边界；当前宽度不是“正文约 800px + 可选宽内容”，没有专注/宽屏；工具栏不是块/选区上下文工具；没有混合段落美化体验；没有编辑器性能基线或正文保存时序 E2E。

## 12. 三种实施路线比较

|路线|成本与兼容性|输入法/光标风险|性能、包体与 8GB 设备|课程适配与可撤销性|
|---|---|---|---|---|
|A. 保留当前 CodeMirror，只优化布局、保存状态和渲染边界|低到中；完全兼容现有 Markdown/图片引用|低；继续使用成熟 CodeMirror|可先减少全表链接扫描、面板 render 和保存交错；不增加内核包体|适合计算机代码与绘画图片笔记；可逐步回退|
|B. 保留 Markdown 数据源，替换/升级成熟内核|中到高；需迁移快捷键、图片粘贴、预览与可访问性|中；内核成熟但集成期仍有选区/IME/插件风险|可能增加包体/内存；当前已在用 CodeMirror，替换收益尚无证据|可能改善体验，但需先有测量依据|
|C. 自研当前段落语法、其他段落美化的混合编辑器|高；需稳定段落映射、撤销、粘贴、选择和 Markdown 往返|高；中文 IME、跨块选择和复制粘贴风险最大|渲染/状态同步复杂，对 8GB 设备风险最高|视觉收益可能高，撤销性最低，不能作为可靠性问题前置条件|

## 13. 推荐路线

推荐路线 A：不替换 CodeMirror、不改 Note schema，先收口保存生命周期并建立正文更轻量的渲染边界。

1. 先定义每 note 保存序列或草稿失效规则，解决 AI 原子应用与旧 pending draft 的覆盖，并补时序测试/E2E。
2. 测量并隔离高频 backlinks/forwardlinks 读取，再决定节流或索引策略。
3. 保持 Markdown 源数据不变，建立编辑主区与按需右侧辅助面板。
4. 最后再依据实测评估 CodeMirror 增强或替换；没有证据前不启动 B/C。

## 14. P0/P1/P2风险

### P0

|风险|证据与场景|建议阶段|
|---|---|---|
|AI 摘要应用后可能被旧 pending/in-flight 正文覆盖|AI 成功回调未清 pending；旧 flush 仍经 `noteService.updateNote` 写 notes，且无 revision/CAS|保存可靠性第一任务；先补交错 RED 测试|

### P1

|风险|证据与场景|建议阶段|
|---|---|---|
|输入暂停后可能全表扫描 notes 两次|backlinks/forwardlinks 的 `db.notes.toArray()`|输入渲染边界/性能基线，先测后改|
|突然关闭与卸载失败恢复不完整|无 page lifecycle flush；卸载不可 await；失败无自动重试|保存可靠性任务，明确保证范围并补测试|
|正文保存时序缺少测试保护|生产 E2E 只覆盖标题|保存可靠性完成前补齐|

### P2

|风险|证据与场景|建议阶段|
|---|---|---|
|辅助区挤压正文、无右侧工作台|四个面板直列正文前|布局/右侧面板任务|
|编辑/预览切换不保留编辑上下文|CodeMirror 条件卸载，无 selection/scroll/undo 保存|编辑体验任务|
|窄屏字段 grid、宽表格、CodeMirror focus 未验证|固定 grid、表格无横滚、项目 CSS 未覆盖 CodeMirror focus|响应式/可访问性验收|
|异步图片粘贴孤立 image|保存后 view 失效直接 return|图片生命周期清理任务|

## 15. 实施任务拆分建议

|建议任务|目标、依赖与允许范围|风险/推荐模型强度|可并行性|
|---|---|---|---|
|20-A1 保存可靠性收口|定义每 note 保存序列/草稿失效；改 EditorPage、保存协调、AI 应用交接和测试；不改 schema|P0；高强度模型与时序测试|不与同一保存链路改动并行|
|20-A2 正文输入渲染与链接计算基线|测量长正文/多笔记输入，隔离 backlinks/forwardlinks 高峰读取；改 EditorPage/link service/测试|P1；中等，先测后改|可与纯布局并行|
|20-A3 编辑主区宽度与保存状态|约 800px 正文、可选宽模式、清晰状态；改编辑页/CSS/组件测试|P2；中等|可与性能测量、热力图并行|
|20-A4 右侧辅助面板框架|既有 AI/知识面板移入按需右侧容器；不改查询/写入规则|P2；中等|A1 后更安全|
|20-A5 专注/宽屏模式|页面局部 state，避免新全局 store|P2；低到中|与 A4 顺序串联|
|20-A6 Markdown 最小增强|仅处理确认需求，如表格横滚/代码高亮；改 Markdown/CSS/测试|P2；中等|可与热力图并行|
|20-A7 编辑器生产 E2E|真实 IndexedDB 验证正文、800ms、快速切换、AI 交错、失败提示；只改 E2E|P1；中等|可与 A2/A3 并行|
|20-A8 性能基线|记录 8GB、长正文、多笔记、图片/表格、IME 指标；不改生产代码|P1/P2；中等|可与热力图和文档任务并行|

## 16. 数据库和Backup影响

本审计不要求数据库修改，也不要求 Backup 升级。路线 A 的 P0 修复应优先用现有 Note、AIResult 和组件草稿状态建立保存顺序/失效规则，不新增表或字段；现有 Backup v5 不应因为编辑器布局或保存调度而升级。

只有未来明确需要跨重启独立草稿、版本历史或可恢复编辑冲突时，才应另行设计 schema 与 Backup 影响；这不是本次或第一阶段保存一致性修复的前置条件。

## 17. 仍需运行时测量的问题

1. 100、500、1000+ 笔记时，250ms backlinks/forwardlinks 全表读取对连续中文输入和粘贴的实际延迟。
2. 10KB、100KB、500KB Markdown 下 `doc.toString()`、React 重新渲染、预览切换和 800ms 保存的耗时/内存。
3. 8GB Windows 设备上的 IME、撤销、选区、滚动和编辑/预览切换体验。
4. 大图、宽表、长代码块在 1366px、1024px、768px 和手机宽度下的滚动、裁切和焦点。
5. tab 关闭、崩溃、页面隐藏、快速路由切换与 Dexie 写入失败时的最终持久化结果。
6. AI 摘要应用与正在进行或刚计划的正文保存的确定性复现，用来验证 P0 修复后的不覆盖契约。
