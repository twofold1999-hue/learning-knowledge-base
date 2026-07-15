# 知识实体图谱设计

## 目的与范围

本设计记录现有知识库的笔记图谱和实体图谱双模式边界。实体图谱首版已经实现为只读知识关系可视化；本文档不扩大其产品承诺，也不要求修改数据库、备份或现有笔记图谱。

## 产品范围与已确认决策

- 保留现有 `/graph` 路由，默认打开笔记图谱。
- `/graph` 提供笔记图谱和实体图谱两种模式。
- 不记录上一次模式选择：不写入 Dexie、AppSetting、localStorage、URL 参数或 Zustand 全局状态。
- 笔记图谱继续展示笔记节点与 `[[双链]]` 关系，保留标签筛选、悬停高亮和点击进入 `/editor/:noteId` 的行为。
- 实体图谱首版严格只读：支持搜索、实体类型筛选和关系类型筛选；不允许创建、修改、删除或审批实体、关系。
- 实体节点可通过稳定 entityId 导航至现有 `/knowledge/entities/:entityId` 只读详情页；节点不承担详情查询或编辑。

## 实体图谱可信数据范围

默认只显示 `status === approved` 的 KnowledgeEntity 和 KnowledgeRelation。孤立的已确认实体也必须显示。

- suggested 与 rejected 实体默认不显示。
- suggested 与 rejected 关系默认不显示。
- 起点或终点缺失、任一端点不是 approved、或关系不是 approved 时，忽略该关系。
- 单条异常关系不能让整个图谱加载失败。
- 图谱模块不得自动修改、清理或修复任何数据库记录。

## 首版筛选能力

### 实体名称搜索

搜索 canonicalName 和 aliases，忽略大小写与首尾空格。首版不做拼写纠错、模糊分词、AI 搜索、FlexSearch 索引或描述全文搜索。

### 实体类型

支持全部、concept/概念、topic/主题、tool/工具、method/方法、person/人物、term/术语。

### 关系类型

支持全部、related_to/相关、depends_on/依赖、contains/包含、explains/解释、contrasts_with/对比、prerequisite/前置。关系类型筛选只影响边；实体即使没有该类型关系也不自动隐藏。

## 应用编排、纯构建与 300 节点边界

EntityGraphView 是应用流程调用方；GraphPage 负责页面级路由导航，并把稳定 entityId 的回调传入 EntityGraphView。下面是由实体图谱视图发起的独立数据步骤，不是模块之间的深层调用链：

~~~text
EntityGraphView
  -> entityGraphService.readApprovedSnapshot()
  -> buildEntityGraph(snapshot, filters)
  -> forceLayoutAdapter.layout(graph)
  -> React Flow render(layout)
~~~

具体编排为：

1. EntityGraphView 调用 entityGraphService 读取只读快照。
2. entityGraphService 利用现有 KnowledgeEntity.status 和 KnowledgeRelation.status 索引，优先只读取 approved 数据，减少无用 IndexedDB 读取；它不修改数据库。
3. EntityGraphView 将快照和筛选条件传给 buildEntityGraph。
4. buildEntityGraph 防御性重新检查实体与关系是否 approved，移除端点不在有效实体集合中的关系。
5. buildEntityGraph 应用名称搜索、实体类型筛选和关系类型筛选。
6. buildEntityGraph 统计当前筛选结果中的实体连接数。
7. buildEntityGraph 稳定排序实体：连接数降序、canonicalName 稳定排序、实体 ID 稳定排序。
8. buildEntityGraph 最多截取 300 个实体，再移除端点已被截断的关系，并保留孤立实体。
9. EntityGraphView 将图构建结果传给 forceLayoutAdapter 生成坐标。
10. EntityGraphView 将布局结果交给 React Flow 渲染；React Flow 不拥有业务筛选规则。

搜索和筛选必须发生在 300 节点截断前，因此低连接实体仍可被精确搜索找到。超过限制时不修改数据库、不删除记录；首版只保证内部稳定截断，不承诺额外的用户提示。

### approved 过滤的两层职责

entityGraphService 是持久化读取适配器。它只做 approved 范围的 I/O 预过滤、空数据与读取错误传递，不执行名称搜索、类型筛选、连接数排序、300 节点截断或布局。

buildEntityGraph 是纯业务转换边界。它不调用 entityGraphService、不读取 Dexie、不调用布局；即使输入包含 suggested、rejected 或失效端点，也重新校验并产生正确的 approved-only 图。它负责名称搜索、类型/关系筛选、连接数、稳定排序、300 节点截断与悬空边移除。

service 的 status 查询是减少无用读取的 I/O 预过滤；builder 的 status 校验是纯业务正确性保护。两者不是两套独立业务实现，不得复制复杂筛选逻辑。forceLayoutAdapter 不读取数据库，entityGraphService 不调用 buildEntityGraph，buildEntityGraph 不调用 entityGraphService。

## 可替换布局

首版默认力导向布局，但页面不依赖具体布局库。建议接口：

~~~ts
interface GraphLayoutAdapter {
  layout(input: GraphLayoutInput): Promise<GraphLayoutResult>
}
~~~

forceLayoutAdapter 只计算坐标；buildEntityGraph 不计算坐标，entityGraphService 不知道布局，派生坐标不写入 KnowledgeEntity、Dexie 或备份。首版输入硬上限为 300 个节点，力导向模拟必须有固定最大迭代次数，不允许无限运行或永久动画式求解。相同输入应尽量稳定，使用固定初始位置、固定种子或固定模拟迭代次数；测试只断言有限坐标与稳定性，不断言像素值。空图和单节点不启动不必要模拟。每次筛选产生新的布局请求标识；旧请求完成后不得覆盖新筛选结果，组件卸载后不得更新状态。首版不强制 Web Worker、多线程、WASM 或后台布局服务；只有真实性能测量证明同步有限迭代仍造成明显卡顿时，才单独设计 Worker 方案。

未来替换为径向、层级或聚类布局时，必须单独评估维护状态、许可证、包体积、API 稳定性，以及是否优于小型自实现适配器。本设计阶段不增加依赖。

## 推荐模块与职责

~~~text
src/
├── pages/
│   └── GraphPage.tsx
└── features/
    └── graph/
        ├── note-graph/
        │   ├── NoteGraphView.tsx
        │   ├── buildNoteGraph.ts
        │   └── buildNoteGraph.test.ts
        └── entity-graph/
            ├── EntityGraphView.tsx
            ├── entityGraphService.ts
            ├── entityGraphService.test.ts
            ├── buildEntityGraph.ts
            ├── buildEntityGraph.test.ts
            ├── forceLayoutAdapter.ts
            └── forceLayoutAdapter.test.ts
~~~

实施时应以现有目录结构为准做最小必要调整：GraphPage 只负责模式切换与公共框架；NoteGraphView 只负责笔记图谱；EntityGraphView 管理实体图谱局部交互状态；entityGraphService 只读数据库；buildEntityGraph 只做纯筛选、排序、截断和边清理；forceLayoutAdapter 只做坐标；React Flow 只做画布渲染。不得继续把全部逻辑堆入现有 GraphPage。

## 实体图谱首版交互

`/graph` 顶部提供笔记图谱/实体图谱模式切换。进入实体图谱后，页面提供实体名称搜索、实体类型筛选、关系类型筛选以及当前节点和连接数量；刷新页面后始终回到笔记图谱模式。

实体节点首版只展示 canonicalName，并以实体类型区分视觉颜色；不展示长描述、完整别名、审计历史、AI 结果、关联笔记详情、实体类型文字或直接连接数。`depends_on`、`contains`、`explains`、`prerequisite` 显示单向箭头；`related_to`、`contrasts_with` 不显示双向箭头，并显示简短中文关系标签。

实体节点点击只上报稳定 entityId；GraphPage 使用路由导航到现有只读详情页。EntityGraphView 不依赖 Router、不读取详情数据，也不提供编辑入口。悬浮邻接高亮和节点详细信息面板属于未来交互增强，必须在单独任务中确定体验、测试和范围后才可加入。

## 页面状态

- loading：正在加载知识实体图谱……
- error：显示可理解错误和重新加载按钮，且可切回笔记图谱。
- empty：当前没有可展示的已确认实体，或当前筛选条件没有匹配结果；首版使用统一空状态，不提供清除筛选按钮。
- truncated：内部稳定限制为最多 300 个节点；首版不提供截断提示 UI。

切离实体图谱或组件卸载时必须忽略过期异步结果。实体图谱错误不得影响笔记图谱。

## 未来测试设计

### buildEntityGraph

即使输入包含 suggested、rejected 或失效端点，也覆盖 approved-only 结果、canonicalName 和 aliases 搜索、大小写/空格、实体和关系类型筛选、孤立实体、连接数、稳定排序、300 截断、截断后悬空边移除、搜索后低连接实体进入结果和空数据。

### entityGraphService

覆盖使用 approved 范围读取、只读行为、空数据库与数据库读取错误向上传递。所有搜索、筛选、排序和截断规则只在 buildEntityGraph 测试。

### forceLayoutAdapter

覆盖有限坐标、不丢失或新增节点、不修改边业务字段、相同输入稳定、空图、单节点和替换为其他适配器的能力。

### 组件与 E2E

组件覆盖 `/graph` 默认笔记图谱、切换后才读取实体数据、loading/error/empty、三类筛选、关系方向标记、实体节点上报稳定 ID 和切回笔记图谱。生产 E2E 覆盖直接访问 `/graph`、默认笔记图谱、切换实体图谱、approved-only 数据范围、点击实体节点进入既有详情页、刷新后回到默认模式及切回笔记图谱；300 节点排序由单元测试承担。

## 可删除性边界

未来删除实体图谱，应只需删除 entity-graph 模块、模式切换入口、实体图谱测试和仅供其使用的布局依赖，并更新文档。不应影响 KnowledgeEntity、KnowledgeRelation、NoteEntityLink、KnowledgeAuditLog、AI 候选应用、实体详情页、笔记图谱、Backup v5 或 Dexie schema。
