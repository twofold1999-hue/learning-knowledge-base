# Knowledge Entity Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在保留现有笔记双链图谱的前提下，为 `/graph` 增加只读、approved-only、最多 300 个节点的知识实体图谱。

**Architecture:** 保留 `src/pages/GraphPage.tsx` 作为路由页面和模式切换外壳；笔记图谱与实体图谱放入独立 feature 模块。实体图谱由只读快照服务、纯图构建函数、有限迭代力导向布局适配器和 React Flow 展示组件组成。

**Tech Stack:** React 18、TypeScript、React Router 6、React Flow 11、Dexie 4、Vitest、fake-indexeddb、Playwright、d3-force。

## Global Constraints

- `/graph` 默认仍为笔记图谱，模式只存在 `GraphPage` 局部 state，不持久化到 Dexie、AppSetting、URL、localStorage 或 Zustand。
- 笔记图谱保留标签筛选、`[[双链]]`、节点样式、悬停高亮和 `/editor/:noteId` 稳定 ID 导航。
- 实体图谱严格只读；不能创建、修改、删除或审批实体、关系，不能写 Dexie、备份或任何 store。
- 只展示 `approved` 实体和 `approved` 关系；已确认的孤立实体必须保留。
- 搜索和筛选发生在 300 节点截断前；节点稳定排序为连接数降序、`canonicalName`、实体 ID。
- 不升级 Dexie schema，不修改 Backup v5，不修改既有实体、关系或笔记数据模型。
- 不新增 Zustand store。
- 不升级或迁移 React Flow；继续使用当前 `reactflow` v11 API。
- 不加入 Web Worker、WASM 或后台布局服务；布局必须有限工作量且不持续占用主线程。
- 不复制 React Flow Pro 示例源码；只使用公开 API 与独立实现。
- 不进行无关重构；不存在通用 `GraphUtils`、`GraphService`、`GraphStore` 或万能 `shared` 文件。
- 每个实施任务必须测试驱动、独立可审查并形成单一意图提交。

---

## Locked File Layout and Responsibilities

```text
src/pages/
├── GraphPage.tsx
└── GraphPage.test.tsx
src/features/graph/
├── note-graph/
│   ├── NoteGraphView.tsx
│   ├── buildNoteGraph.ts
│   └── buildNoteGraph.test.ts
└── entity-graph/
    ├── entityGraphTypes.ts
    ├── entityGraphService.ts
    ├── entityGraphService.test.ts
    ├── buildEntityGraph.ts
    ├── buildEntityGraph.test.ts
    ├── forceLayoutAdapter.ts
    ├── forceLayoutAdapter.test.ts
    ├── EntityGraphNode.tsx
    ├── EntityGraphView.tsx
    └── EntityGraphView.test.tsx
```

- `GraphPage` 保留现有 lazy route，不修改 `App.tsx`；它只负责返回按钮、标题、模式切换及选择当前视图。`GraphPage.test.tsx` 沿用现有页面测试的就近放置方式。
- `NoteGraphView` 承接现有笔记图谱交互和 React Flow；`buildNoteGraph` 只承接双链解析、边去重、度数和初始环形坐标。
- `entityGraphTypes` 只放 service、builder、layout 与 view 的真实共享契约，不依赖 React、Dexie、React Flow。
- `entityGraphService` 只读 Dexie approved 快照；`buildEntityGraph` 只做纯业务筛选/排序/截断；`forceLayoutAdapter` 只给纯图计算坐标。
- `EntityGraphNode` 只显示节点视觉内容；`EntityGraphView` 只负责局部筛选状态、加载、布局请求和导航。
- 只有两个 feature 出现同一项已测试的重复能力时，才新增窄共享模块；不能预先抽象。

## Dependency and Layout Decision

Task 4 才能修改依赖，准确命令为：

```bash
npm install d3-force
```

安装后检查该版本实际包声明；若对当前 TypeScript 配置没有可用类型声明，才运行：

```bash
npm install -D @types/d3-force
```

不安装完整 `d3`，不升级 `reactflow`。选择 `d3-force` 是因为 React Flow 官方力导向示例使用它、它可以作为独立可替换适配器、`simulation.stop()` 加固定 `tick()` 能生成静态布局，且采用 ISC 许可证。只参考公开 API 与设计思想，不复制 Pro 源码。

`entityGraphTypes.ts` 锁定导出：

```ts
export const ENTITY_GRAPH_NODE_LIMIT = 300
export const FORCE_LAYOUT_ITERATIONS = 180
```

Builder 的输入节点已稳定排序。布局前复制节点和边，避免 d3-force 的可变对象污染业务输入。空图返回空结果；单节点返回 `{ x: 0, y: 0 }`；多节点使用 `forceSimulation`、`forceLink`、`forceManyBody`、`forceCenter`、`forceCollide`，立即 `stop()` 后手动精确执行 180 次 `tick()`。输出前验证所有坐标为有限数字。布局不注册持续 tick 监听器、不启动动画、不重新加热、不写坐标进 Dexie 或备份。

每个快照/筛选组合都拥有递增 request ID。旧布局结果、旧数据库读取结果或卸载后的完成结果不得更新当前 state。首版不实现 Worker、WASM 或后台服务；只有真实测量证明有限同步布局仍卡顿，才单独设计替代方案。
## Repository Test and Import Contracts

- Physical type declarations are in `src/types/index.ts`. Production source may follow the existing directory import style, for example `import type { KnowledgeEntity } from '../../../types'`; plan references to physical files use `src/types/index.ts`.
- `package.json` has neither a React Testing Library package nor a Jest DOM matcher package. Component/page tests use the existing `createRoot`, `act`, DOM `querySelector`, dispatched `MouseEvent`, and `MemoryRouter` pattern. Do not repeat per-file environment comments because Vitest configuration is global.
- `vitest.config.ts`, not `vite.config.ts`, provides `environment: 'jsdom'`; `src/test/setup.ts` imports `fake-indexeddb/auto`. Dexie tests reuse shared `db` and clear their own tables in `beforeEach`, rather than create a parallel application database.
- The existing note graph only applies `trim()` to a wiki-link target. It applies `toLocaleLowerCase()` to titles without trim. Extraction must preserve that asymmetry.
- Existing note graph `node.data` is exactly `{ label, noteType }`; degree remains derived layout data and must not be added to node data.

### Task 1: Isolate the Existing Note Graph Without Behavior Changes

Files:
- Create: `src/features/graph/note-graph/buildNoteGraph.ts`
- Create: `src/features/graph/note-graph/buildNoteGraph.test.ts`
- Create: `src/features/graph/note-graph/NoteGraphView.tsx`
- Modify: `src/pages/GraphPage.tsx`
- Test: `src/features/graph/note-graph/buildNoteGraph.test.ts`

Interfaces:
- Consumes: `Note` from `src/types/index.ts`, current `useNoteStore`, React Flow v11 types and the existing visual tokens.
- Produces: `buildNoteGraph(notes: Note[], filterTag: string): NoteGraphModel` and a `NoteGraphView` with unchanged note-graph behavior.

- [ ] **Step 1: Write concrete failing pure-builder tests.**

  Use fixed notes to assert tag filtering; case-insensitive lookup where only the wiki-link target is trimmed; a whitespace-padded title does not match an unpadded target; self-link removal; reciprocal-edge de-duplication; degree-based radial distance; `无标题` fallback; and node data equal to only `{ label, noteType }` for fragments and chapters.

  ```ts
  expect(buildNoteGraph(notes, '').edges.map((edge) => edge.id)).toEqual(['note_a:note_b'])
  expect(buildNoteGraph(notes, '数据库').nodes.map((node) => node.id)).toEqual(['note_a'])
  ```

- [ ] **Step 2: Run the exact test and confirm it fails.**

  Run: `npx vitest run src/features/graph/note-graph/buildNoteGraph.test.ts`

  Expected: FAIL because `buildNoteGraph.ts` does not exist.

- [ ] **Step 3: Implement the minimal pure extraction.**

  Move only GraphPage's current title map, regexp `/\[\[([^\]]+)\]\]/g`, sorted edge key, degree calculation and radius formula into `buildNoteGraph`; do not change parsing or styling semantics.

  ```ts
  export interface NoteGraphNodeData { label: string; noteType: string }
  export interface NoteGraphModel { nodes: Node<NoteGraphNodeData>[]; edges: Edge[] }
  export function buildNoteGraph(notes: Note[], filterTag: string): NoteGraphModel {
    const visibleNotes = filterTag ? notes.filter((note) => note.tags.includes(filterTag)) : notes
    return { nodes, edges }
  }
  ```

- [ ] **Step 4: Move only presentation and interaction into `NoteGraphView`.**

  Keep tags, selected tag, hovered node, opacity rules, React Flow, Background, Controls, MiniMap and `navigate(`/editor/${encodeURIComponent(node.id)}`)` in `NoteGraphView`. Make `GraphPage` render it without adding persistence or a new store.

- [ ] **Step 5: Run the focused test after extraction.**

  Run: `npx vitest run src/features/graph/note-graph/buildNoteGraph.test.ts`

  Expected: PASS.

- [ ] **Step 6: Run regression and inspect the exact patch.**

  Run: `npm run typecheck && git diff --check && git diff -- src/pages/GraphPage.tsx src/features/graph/note-graph`

  Expected: PASS; GraphPage no longer contains link parsing or radial-layout details.

- [ ] **Step 7: Create the isolated review commit.**

  ```bash
  git add src/pages/GraphPage.tsx src/features/graph/note-graph
  git commit -m "refactor: isolate note graph feature"
  ```

### Task 2: Add Entity Graph Contracts and Approved Snapshot Service

Files:
- Create: `src/features/graph/entity-graph/entityGraphTypes.ts`
- Create: `src/features/graph/entity-graph/entityGraphService.ts`
- Create: `src/features/graph/entity-graph/entityGraphService.test.ts`
- Test: `src/features/graph/entity-graph/entityGraphService.test.ts`

Interfaces:
- Consumes: `db` from `src/services/db.ts`; `KnowledgeEntity`, `KnowledgeEntityType`, `KnowledgeRelation`, `KnowledgeRelationType` from `src/types/index.ts`.
- Produces: `EntityGraphSnapshot`, `EntityGraphFilters`, `EntityGraphService`, `entityGraphService`, `ENTITY_GRAPH_NODE_LIMIT`, `FORCE_LAYOUT_ITERATIONS`.

- [ ] **Step 1: Write failing fake-indexeddb service tests.**

  In `beforeEach`, clear `db.knowledgeEntities` and `db.knowledgeRelations` with `Promise.all`, then seed approved, suggested and rejected records. Assert only approved records return, an approved orphan returns, empty database returns two empty arrays, an injected read error rejects, and no `put/add/update/delete` is called. Reuse `src/test/setup.ts` fake IndexedDB initialization; do not instantiate a second application database.

  ```ts
  await expect(service.readApprovedSnapshot()).resolves.toEqual({ entities: [approvedEntity], relations: [approvedRelation] })
  expect(writeSpy).not.toHaveBeenCalled()
  ```

- [ ] **Step 2: Run the precise service test and confirm failure.**

  Run: `npx vitest run src/features/graph/entity-graph/entityGraphService.test.ts`

  Expected: FAIL because the contracts and service are absent.

- [ ] **Step 3: Define the complete shared contracts.**

  ```ts
  export const ENTITY_GRAPH_NODE_LIMIT = 300
  export const FORCE_LAYOUT_ITERATIONS = 180
  export interface EntityGraphSnapshot { entities: KnowledgeEntity[]; relations: KnowledgeRelation[] }
  export interface EntityGraphFilters {
    query: string
    entityType: KnowledgeEntityType | 'all'
    relationType: KnowledgeRelationType | 'all'
  }
  export interface EntityGraphService { readApprovedSnapshot(): Promise<EntityGraphSnapshot> }
  ```

- [ ] **Step 4: Implement the narrow readonly adapter.**

  Read both status indexes inside one `db.transaction('r', db.knowledgeEntities, db.knowledgeRelations, ...)`; return the arrays and propagate errors. It must not search, sort, truncate, layout or write.

  ```ts
  return db.transaction('r', db.knowledgeEntities, db.knowledgeRelations, async () => ({
    entities: await db.knowledgeEntities.where('status').equals('approved').toArray(),
    relations: await db.knowledgeRelations.where('status').equals('approved').toArray(),
  }))
  ```

- [ ] **Step 5: Run focused service tests after implementation.**

  Run: `npx vitest run src/features/graph/entity-graph/entityGraphService.test.ts`

  Expected: PASS.

- [ ] **Step 6: Run type/regression checks and inspect responsibility boundaries.**

  Run: `npm run typecheck && git diff --check && git diff -- src/features/graph/entity-graph/entityGraphTypes.ts src/features/graph/entity-graph/entityGraphService.ts`

  Expected: PASS; no UI, builder or layout rule appears in the adapter.

- [ ] **Step 7: Create the review commit.**

  ```bash
  git add src/features/graph/entity-graph/entityGraphTypes.ts src/features/graph/entity-graph/entityGraphService.ts src/features/graph/entity-graph/entityGraphService.test.ts
  git commit -m "feat: add approved entity graph snapshot service"
  ```

### Task 3: Build the Pure Filtered Entity Graph Model

Files:
- Create: `src/features/graph/entity-graph/buildEntityGraph.ts`
- Create: `src/features/graph/entity-graph/buildEntityGraph.test.ts`
- Modify: `src/features/graph/entity-graph/entityGraphTypes.ts`
- Test: `src/features/graph/entity-graph/buildEntityGraph.test.ts`

Interfaces:
- Consumes: raw `KnowledgeEntity[]`, raw `KnowledgeRelation[]`, `EntityGraphFilters`, `ENTITY_GRAPH_NODE_LIMIT`.
- Produces: `buildEntityGraph(input: EntityGraphBuildInput): EntityGraphBuildResult`, a pure layout-free graph.

- [ ] **Step 1: Write table-driven failing builder tests.**

  Cover suggested/rejected input, invalid endpoints, canonical and alias search, trim/case normalization, entity filter, relation filter affecting only edges, orphans, degree counts, connection/name/ID sorting, 300 cut, cut-edge removal, searched low-degree inclusion, input object/array immutability and empty data.

  ```ts
  expect(buildEntityGraph({ entities, relations, filters: { query: '  cpu ', entityType: 'all', relationType: 'all' } }).nodes)
    .toEqual(expect.arrayContaining([expect.objectContaining({ id: 'entity_cpu' })]))
  ```

- [ ] **Step 2: Run the precise builder test and confirm failure.**

  Run: `npx vitest run src/features/graph/entity-graph/buildEntityGraph.test.ts`

  Expected: FAIL because builder contracts and implementation are absent.

- [ ] **Step 3: Define complete builder input/output contracts.**

  ```ts
  export interface EntityGraphBuildInput {
    entities: KnowledgeEntity[]
    relations: KnowledgeRelation[]
    filters: EntityGraphFilters
    maxNodes?: number
  }
  export interface EntityGraphBusinessNode { id: string; entity: KnowledgeEntity; connectionCount: number }
  export interface EntityGraphBusinessEdge { id: string; relation: KnowledgeRelation; source: string; target: string }
  export interface EntityGraphBuildResult {
    nodes: EntityGraphBusinessNode[]
    edges: EntityGraphBusinessEdge[]
    totalMatchedEntities: number
    truncated: boolean
    connectionCount: ReadonlyMap<string, number>
  }
  ```

- [ ] **Step 4: Implement the pure rule order.**

  Defensively retain only approved entities/relations. For the entity graph only, compare `query.trim().toLowerCase()` with `canonicalName.trim().toLowerCase()` and each `alias.trim().toLowerCase()`; do not extract a shared normalization utility and do not alter Task 1 note-graph normalization. Apply entity type; retain orphans; validate endpoints; apply relation type only to edges; count remaining edges; sort by count/name/ID; take `maxNodes ?? ENTITY_GRAPH_NODE_LIMIT`; remove cut endpoints' edges. Never import Dexie, a service, React Flow or layout.

  ```ts
  const ordered = [...entities].sort((a, b) =>
    (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0)
    || a.canonicalName.localeCompare(b.canonicalName)
    || a.id.localeCompare(b.id),
  )
  ```

- [ ] **Step 5: Run focused builder tests after implementation.**

  Run: `npx vitest run src/features/graph/entity-graph/buildEntityGraph.test.ts`

  Expected: PASS.

- [ ] **Step 6: Run type/regression checks and inspect purity.**

  Run: `npm run typecheck && git diff --check && git diff -- src/features/graph/entity-graph/buildEntityGraph.ts`

  Expected: PASS; no persistence or layout dependency exists.

- [ ] **Step 7: Create the review commit.**

  ```bash
  git add src/features/graph/entity-graph/entityGraphTypes.ts src/features/graph/entity-graph/buildEntityGraph.ts src/features/graph/entity-graph/buildEntityGraph.test.ts
  git commit -m "feat: build filtered entity graph model"
  ```

### Task 4: Add the Bounded Force Layout Adapter

Files:
- Create: `src/features/graph/entity-graph/forceLayoutAdapter.ts`
- Create: `src/features/graph/entity-graph/forceLayoutAdapter.test.ts`
- Modify: `src/features/graph/entity-graph/entityGraphTypes.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Test: `src/features/graph/entity-graph/forceLayoutAdapter.test.ts`

Interfaces:
- Consumes: `EntityGraphBuildResult`, `FORCE_LAYOUT_ITERATIONS`, `ENTITY_GRAPH_NODE_LIMIT`, `d3-force`.
- Produces: `EntityGraphLayoutAdapter` and `forceLayoutAdapter.layout(input): Promise<EntityGraphLayoutResult>`.

- [ ] **Step 1: Write failing bounded-layout tests.**

  Test empty graph, exact single-node origin, finite multi-node positions, same input stability, unchanged node IDs, unchanged edge IDs/fields, immutable input, no persistent simulation and an explicit `RangeError` for 301 nodes.

  ```ts
  expect(result.nodes.every((node) => Number.isFinite(node.position.x) && Number.isFinite(node.position.y))).toBe(true)
  await expect(forceLayoutAdapter.layout(graphWith301Nodes)).rejects.toBeInstanceOf(RangeError)
  ```

- [ ] **Step 2: Run the focused layout test and confirm failure.**

  Run: `npx vitest run src/features/graph/entity-graph/forceLayoutAdapter.test.ts`

  Expected: FAIL because the adapter and runtime dependency are absent.

- [ ] **Step 3: Install only the approved dependency and check declarations.**

  Run the `d3-force` command in the dependency decision section. Inspect installed declarations; add `@types/d3-force` only if required. Verify `reactflow` remains `^11.11.4` and full `d3` is absent.

  ```bash
  npm install d3-force
  npm run typecheck
  # Only if the installed package lacks usable declarations:
  npm install -D @types/d3-force
  ```

- [ ] **Step 4: Implement static finite simulation and contracts.**

  ```ts
  export interface EntityGraphLayoutNode extends EntityGraphBusinessNode { position: { x: number; y: number } }
  export type EntityGraphLayoutEdge = EntityGraphBusinessEdge
  export interface EntityGraphLayoutResult { nodes: EntityGraphLayoutNode[]; edges: EntityGraphLayoutEdge[] }
  export interface EntityGraphLayoutAdapter { layout(input: EntityGraphBuildResult): Promise<EntityGraphLayoutResult> }
  
  simulation.stop()
  for (let iteration = 0; iteration < FORCE_LAYOUT_ITERATIONS; iteration += 1) simulation.tick()
  ```

  Clone business nodes/edges, deterministically initialize copies by stable index, reject input above 300, create all five required forces, stop immediately, tick exactly 180 times and validate finite coordinates. Return copied `EntityGraphLayoutEdge` values; do not add marker, label or React Flow style fields to layout edges, and do not mutate business input. Do not add listeners, animation, coordinate persistence or drag reheat.

- [ ] **Step 5: Run focused adapter tests after implementation.**

  Run: `npx vitest run src/features/graph/entity-graph/forceLayoutAdapter.test.ts`

  Expected: PASS.

- [ ] **Step 6: Run dependency/type regression and inspect the diff.**

  Run: `npm run typecheck && git diff --check && git diff -- package.json package-lock.json src/features/graph/entity-graph`

  Expected: PASS; only `d3-force` and conditionally its type package appear.

- [ ] **Step 7: Create the review commit.**

  ```bash
  git add package.json package-lock.json src/features/graph/entity-graph/entityGraphTypes.ts src/features/graph/entity-graph/forceLayoutAdapter.ts src/features/graph/entity-graph/forceLayoutAdapter.test.ts
  git commit -m "feat: add bounded force layout adapter"
  ```

### Task 5: Build the Read-Only Entity Graph View

Files:
- Create: `src/features/graph/entity-graph/EntityGraphNode.tsx`
- Create: `src/features/graph/entity-graph/EntityGraphView.tsx`
- Create: `src/features/graph/entity-graph/EntityGraphView.test.tsx`
- Test: `src/features/graph/entity-graph/EntityGraphView.test.tsx`

Interfaces:
- Consumes: injected `EntityGraphService`, `buildEntityGraph`, `EntityGraphLayoutAdapter`, React Flow v11 and React Router.
- Produces: default-exported `EntityGraphView` accepting optional injected `service`, `builder`, `layoutAdapter`; `EntityGraphNode`; no write API.

- [ ] **Step 1: Write failing view tests with fake service/builder/layout injection.**

  Cover loading, retryable error, approved-empty, filtered-empty and clear filters, truncated notice, query/type/relation controls, node name/type/direct count, hover adjacency dimming, `MarkerType.ArrowClosed` only for directed relations, no markerStart/markerEnd for symmetric relations, Chinese relation labels, stable detail route navigation, no writes and an older layout result losing to a newer request.

  ```tsx
  expect(service.readApprovedSnapshot).toHaveBeenCalledTimes(1)
  expect(writeSpy).not.toHaveBeenCalled()
  await act(async () => { resolveOldLayout?.(oldLayout) })
  expect(container?.textContent).not.toContain('旧筛选节点')
  ```

- [ ] **Step 2: Run the focused view test and confirm failure.**

  Run: `npx vitest run src/features/graph/entity-graph/EntityGraphView.test.tsx`

  Expected: FAIL because the view components do not exist.

- [ ] **Step 3: Implement the default-export view contract and stable React Flow mapping.**

  ```tsx
  export interface EntityGraphViewProps {
    service?: EntityGraphService
    builder?: typeof buildEntityGraph
    layoutAdapter?: EntityGraphLayoutAdapter
  }

  export default function EntityGraphView(
    props: EntityGraphViewProps,
  ): JSX.Element {
    const service = props.service ?? entityGraphService
    const builder = props.builder ?? buildEntityGraph
    const layoutAdapter = props.layoutAdapter ?? forceLayoutAdapter
    void service; void builder; void layoutAdapter
    return <section aria-label="实体图谱" />
  }
  ```

  `EntityGraphNode` renders canonical name, localized type and direct connection count only. Import `MarkerType` from current React Flow v11. `depends_on`, `contains`, `explains` and `prerequisite` set only `markerEnd: { type: MarkerType.ArrowClosed }`. `related_to` and `contrasts_with` set neither `markerStart` nor `markerEnd`, never render double arrows, may render a Chinese relation label, and do not emphasize persisted `from/to` storage direction. Do not render descriptions, aliases, audit histories, AI payloads or linked-note detail. The default export is the exact target of Task 6 `React.lazy(() => import('../features/graph/entity-graph/EntityGraphView'))`.

- [ ] **Step 4: Implement local state, readonly loading and stale-result protection.**

  On mount read once, then only rebuild/layout when local filters change. Retry reloads snapshot. Use request IDs and unmount guards; errors are contained inside the entity view. Render Background, Controls, MiniMap, counts and the non-blocking 300-node message.

  ```ts
  const requestId = ++requestIdRef.current
  const layout = await layoutAdapter.layout(graph)
  if (!mountedRef.current || requestId !== requestIdRef.current) return
  setLayout(layout)
  ```

- [ ] **Step 5: Run focused view tests after implementation.**

  Run: `npx vitest run src/features/graph/entity-graph/EntityGraphView.test.tsx`

  Expected: PASS.

- [ ] **Step 6: Run type/regression checks and inspect read-only boundary.**

  Run: `npm run typecheck && git diff --check && git diff -- src/features/graph/entity-graph/EntityGraphNode.tsx src/features/graph/entity-graph/EntityGraphView.tsx`

  Expected: PASS; neither component directly writes Dexie.

- [ ] **Step 7: Create the review commit.**

  ```bash
  git add src/features/graph/entity-graph/EntityGraphNode.tsx src/features/graph/entity-graph/EntityGraphView.tsx src/features/graph/entity-graph/EntityGraphView.test.tsx
  git commit -m "feat: add read-only entity graph view"
  ```

### Task 6: Integrate the Local `/graph` Mode Switcher

Files:
- Create: `src/pages/GraphPage.test.tsx`
- Modify: `src/pages/GraphPage.tsx`
- Test: `src/pages/GraphPage.test.tsx`

Interfaces:
- Consumes: `NoteGraphView` and lazily loaded `EntityGraphView`.
- Produces: `type GraphMode = 'notes' | 'entities'`, reset to `'notes'` on every page mount.

- [ ] **Step 1: Write failing GraphPage integration tests.**

  Mock child feature modules at their boundaries with `vi.mock`. Follow the existing component-test setup: create a container, render `GraphPage` with `createRoot` inside `MemoryRouter`, then use `act` and a dispatched `MouseEvent`. Assert default note mode, that the lazy entity test double is not mounted before selection, lazy fallback while loading, switch back preserving note view, remount resetting to notes, and an entity component that throws does not remove mode controls. Suppress the expected test-only `console.error`, then assert the user can switch to notes after the boundary fallback. The snapshot-call contract stays in `EntityGraphView.test.tsx`; GraphPage only proves whether the entity view mounts.

  ```tsx
  const entityButton = [...(container?.querySelectorAll('button') ?? [])]
    .find((button) => button.textContent === '实体图谱')
  await act(async () => {
    entityButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await Promise.resolve()
  })
  expect(container?.textContent).toContain('实体图谱测试视图')
  ```

- [ ] **Step 2: Run the exact page test and confirm failure.**

  Run: `npx vitest run src/pages/GraphPage.test.tsx`

  Expected: FAIL because the switcher and lazy entity boundary are absent.

- [ ] **Step 3: Implement the minimal mode shell.**

  Keep `App.tsx` and `/graph` route unchanged. Add accessible mode buttons, `useState<GraphMode>('notes')`, `React.lazy(() => import('../features/graph/entity-graph/EntityGraphView'))`, a small Suspense fallback, and an internal narrow class error boundary in `GraphPage`; do not install `react-error-boundary`. Mode controls remain outside that boundary. The boundary renders a local failure message for a rejected entity bundle or entity-render exception, while the note view remains selectable. Because the boundary is conditionally mounted only for entity mode, switching to notes unmounts it and entering entity mode again creates fresh boundary state. Do not encode mode in any URL or persistence system.

  ```tsx
  import { Component, type ReactNode } from 'react'

  class EntityGraphBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
    state = { failed: false }
    static getDerivedStateFromError(): { failed: boolean } { return { failed: true } }
    render(): ReactNode { return this.state.failed ? <p role="alert">实体图谱加载失败，可切回笔记图谱。</p> : this.props.children }
  }

  const [mode, setMode] = useState<GraphMode>('notes')
  {mode === 'notes' ? <NoteGraphView /> : (
    <EntityGraphBoundary><Suspense fallback={<p>正在加载实体图谱……</p>}><EntityGraphView /></Suspense></EntityGraphBoundary>
  )}
  ```

- [ ] **Step 4: Confirm feature isolation.**

  Check GraphPage imports no `db` or `d3-force`; note graph is untouched until its view renders; entity view errors remain local and users can return to notes.

- [ ] **Step 5: Run focused mode tests after implementation.**

  Run: `npx vitest run src/pages/GraphPage.test.tsx src/features/graph/note-graph/buildNoteGraph.test.ts src/features/graph/entity-graph/EntityGraphView.test.tsx`

  Expected: PASS.

- [ ] **Step 6: Run type/regression checks and inspect route scope.**

  Run: `npm run typecheck && git diff --check && git diff -- src/pages/GraphPage.tsx src/pages/GraphPage.test.tsx src/App.tsx`

  Expected: PASS; `src/App.tsx` has no modification and mode is not persisted.

- [ ] **Step 7: Create the review commit.**

  ```bash
  git add src/pages/GraphPage.tsx src/pages/GraphPage.test.tsx
  git commit -m "feat: add graph mode switcher"
  ```

### Task 7: Validate Production E2E, README and Complete Verification

Files:
- Modify: `tests/e2e/smoke.spec.ts`
- Modify: `README.md`
- Test: `tests/e2e/smoke.spec.ts`

Interfaces:
- Consumes: production build, existing E2E server at 4174, browser IndexedDB `LearningKnowledgeBase`, stable graph/entity routes.
- Produces: production evidence for entity graph behavior and a concise README capability note; no production seed endpoint.

- [ ] **Step 1: Write a failing production E2E with page-side IndexedDB seed.**

  First visit `/graph` and wait for its rendered shell. `src/main.tsx` waits for `migrateFromLocalStorage()`, which opens and upgrades `LearningKnowledgeBase` through the declared Dexie v11 schema; only after that may `page.evaluate` open the existing database. `onupgradeneeded` must reject, and the test must reject after closing the database if either required object store is absent, so the test never creates a version or object store. Transactionally add only uniquely prefixed approved `knowledgeEntities` and `knowledgeRelations`, including one suggested entity that must not render. Do not clear the whole database, add a seed API, use DeepSeek, alter the production 4173 instance or make external HTTP requests.

  ```ts
  await page.goto('/graph')
  await expect(page.getByRole('heading', { name: '知识图谱' })).toBeVisible()
  await page.evaluate(async ({ entityId, relatedId, hiddenId, relationId }) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('LearningKnowledgeBase')
      request.onupgradeneeded = () => {
        request.transaction?.abort()
        reject(new Error('E2E must not create or upgrade LearningKnowledgeBase'))
      }
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const database = request.result
        if (!database.objectStoreNames.contains('knowledgeEntities') || !database.objectStoreNames.contains('knowledgeRelations')) {
          database.close()
          reject(new Error('E2E database is missing knowledge entity stores'))
          return
        }
        const transaction = database.transaction(['knowledgeEntities', 'knowledgeRelations'], 'readwrite')
        transaction.objectStore('knowledgeEntities').put({ id: entityId, canonicalName: 'E2E CPU', aliases: ['E2E 处理器'], type: 'concept', status: 'approved', description: '', createdAt: '2026-07-13T00:00:00.000Z', updatedAt: '2026-07-13T00:00:00.000Z' })
        transaction.objectStore('knowledgeEntities').put({ id: relatedId, canonicalName: 'E2E 缓存', aliases: [], type: 'concept', status: 'approved', description: '', createdAt: '2026-07-13T00:00:00.000Z', updatedAt: '2026-07-13T00:00:00.000Z' })
        transaction.objectStore('knowledgeEntities').put({ id: hiddenId, canonicalName: 'E2E 待确认', aliases: [], type: 'concept', status: 'suggested', description: '', createdAt: '2026-07-13T00:00:00.000Z', updatedAt: '2026-07-13T00:00:00.000Z' })
        transaction.objectStore('knowledgeRelations').put({ id: relationId, fromEntityId: entityId, toEntityId: relatedId, relationType: 'depends_on', status: 'approved', confidence: 1, source: 'manual', aiResultId: null, evidenceNoteId: null, createdAt: '2026-07-13T00:00:00.000Z', updatedAt: '2026-07-13T00:00:00.000Z' })
        transaction.oncomplete = () => { database.close(); resolve() }
        transaction.onerror = () => reject(transaction.error)
      }
    })
  }, ids)
  ```

- [ ] **Step 2: Run the exact E2E and confirm failure before the feature is complete.**

  Run: `npx playwright test tests/e2e/smoke.spec.ts`

  Expected: FAIL until `/graph` exposes the entity graph; retain all existing production static-resource assertions.

- [ ] **Step 3: Complete the production-safe E2E assertions.**

  Directly visit `/graph`, prove note graph is default, switch to entity mode, assert approved records appear and suggested record does not, find the lower-degree approved entity by canonical name or alias, click its stable ID route, and refresh its detail page. Keep request routing that rejects external HTTP. The E2E server remains on 4174 and leaves `.runtime/local-server.json` untouched.

- [ ] **Step 4: Add the concise README feature statement.**

  State that knowledge graph offers existing note double-link graph plus read-only approved entity-relation graph; it preserves approved orphans, filters before the 300-node display limit and does not persist the selected mode. Retain links to the design and development principles. Do not claim semantic search, automatic AI approval, editable graph, Worker layout, backup changes or React Flow upgrade.

- [ ] **Step 5: Run focused E2E after implementation.**

  Run: `npx playwright test tests/e2e/smoke.spec.ts`

  Expected: PASS with no external request and a built production server.

- [ ] **Step 6: Run complete validation and inspect working tree.**

  ```bash
  npm run typecheck
  npm run test
  npm run build
  npm run test:e2e
  git diff --check
  git status --short
  ```

  Expected: all commands pass. The known Vite large-chunk warning remains a warning, not a failure.

- [ ] **Step 7: Create the final review commit.**

  ```bash
  git add tests/e2e/smoke.spec.ts README.md
  git commit -m "test: cover entity graph production flow"
  ```

## Plan Self-Check

- [x] The seven tasks cover all approved design requirements: note graph preservation, approved snapshot I/O, pure business graph, static bounded layout, read-only UI, local mode integration, production E2E and README.
- [x] Later interfaces are defined before use and use the current repository type names from physical file `src/types/index.ts`, while source imports retain existing directory-import style.
- [x] Every task has explicit files, consumed/produced interfaces, failure-first test command, minimal implementation details, focused pass command, regression/diff check and one commit boundary.
- [x] Service I/O pre-filtering and builder defensive approved validation are distinct; only EntityGraphView orchestrates service, builder and layout.
- [x] Search before cutoff, orphan retention, stable sorting, 300 cap, cut-edge cleanup, fixed 180 ticks, immutable d3 input, unstyled copied layout edges, directed/symmetric marker rules and stale async-result protection all have code and test coverage.
- [x] The plan does not change Dexie, Backup v5, React Flow version, existing routes, AI, global state, worker strategy or unrelated features; GraphPage uses its own narrow boundary instead of a new dependency.
- [x] Placeholder scan is clean: no deferred implementation marker, vague test instruction or undefined public interface remains; test instructions use repository Vitest jsdom, fake IndexedDB and React DOM patterns.
