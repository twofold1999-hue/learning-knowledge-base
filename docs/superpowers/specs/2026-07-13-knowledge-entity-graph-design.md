# 知识实体图谱设计

## 目的与范围

本设计为现有知识库规划笔记图谱和实体图谱双模式。它只定义后续实施边界，不实现功能、不新增依赖、不修改数据库、备份或现有笔记图谱。

## 产品范围与已确认决策

- 保留现有 `/graph` 路由，默认打开笔记图谱。
- `/graph` 提供笔记图谱和实体图谱两种模式。
- 不记录上一次模式选择：不写入 Dexie、AppSetting、localStorage、URL 参数或 Zustand 全局状态。
- 笔记图谱继续展示笔记节点与 `[[双链]]` 关系，保留标签筛选、悬停高亮和点击进入 `/editor/:noteId` 的行为。
- 实体图谱首版严格只读：允许搜索、筛选、悬停高亮和点击；不允许创建、修改、删除或审批实体、关系。
- 点击实体节点进入稳定 ID 路由 `/knowledge/entities/:entityId`。

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

## 单向数据流与 300 节点边界

~~~text
EntityGraphView
  -> entityGraphService
  -> buildEntityGraph
  -> forceLayoutAdapter
  -> React Flow
~~~

处理顺序固定为：

1. entityGraphService 只读获取 approved 实体与关系。
2. 应用名称搜索。
3. 应用实体类型筛选。
4. 应用关系类型筛选。
5. 移除端点不在实体结果中的关系。
6. 统计当前筛选结果中的实体连接数。
7. 稳定排序实体：连接数降序、canonicalName 稳定排序、实体 ID 稳定排序。
8. 最多截取 300 个实体。
9. 再移除端点已被截断的关系。
10. 保留孤立实体。
11. 交给布局适配器生成坐标。
12. UI 只渲染和处理交互。

搜索和筛选必须发生在截断前，因此低连接实体仍可被精确搜索找到。超过限制时不修改数据库、不删除记录，并显示非阻塞提示：

> 当前筛选结果共 527 个实体，图谱优先展示连接数最高的 300 个。请使用搜索或筛选缩小范围。

## 可替换布局

首版默认力导向布局，但页面不依赖具体布局库。建议接口：

~~~ts
interface GraphLayoutAdapter {
  layout(input: GraphLayoutInput): Promise<GraphLayoutResult>
}
~~~

forceLayoutAdapter 只计算坐标；buildEntityGraph 不计算坐标，entityGraphService 不知道布局，派生坐标不写入 KnowledgeEntity、Dexie 或备份。相同输入应尽量稳定，使用固定初始位置、固定种子或固定模拟迭代次数；测试只断言有限坐标与稳定性，不断言像素值。

未来替换为径向、层级或聚类布局时，必须单独评估维护状态、许可证、包体积、API 稳定性，以及是否优于小型自实现适配器。本设计阶段不增加依赖。

## 推荐模块与职责

~~~text
src/features/graph/
├── GraphPage.tsx
├── note-graph/
│   ├── NoteGraphView.tsx
│   ├── buildNoteGraph.ts
│   └── buildNoteGraph.test.ts
├── entity-graph/
│   ├── EntityGraphView.tsx
│   ├── entityGraphService.ts
│   ├── entityGraphService.test.ts
│   ├── buildEntityGraph.ts
│   ├── buildEntityGraph.test.ts
│   ├── forceLayoutAdapter.ts
│   └── forceLayoutAdapter.test.ts
└── shared/
    └── 仅放已经出现真实重复的能力
~~~

实施时应以现有目录结构为准做最小必要调整：GraphPage 只负责模式切换与公共框架；NoteGraphView 只负责笔记图谱；EntityGraphView 管理实体图谱局部交互状态；entityGraphService 只读数据库；buildEntityGraph 只做纯筛选、排序、截断和边清理；forceLayoutAdapter 只做坐标；React Flow 只做画布渲染。不得继续把全部逻辑堆入现有 GraphPage。

## 实体图谱交互

顶部包含返回、页面标题、笔记图谱/实体图谱切换、实体名称搜索、实体类型筛选、关系类型筛选、节点数和关系数。

实体节点只展示 canonicalName、实体类型和直接连接数；不展示长描述、完整别名、审计历史、AI 结果或关联笔记详情。

悬停节点时，当前节点、直接相邻节点与相邻边高亮，其他节点与边降低透明度；离开后恢复。`depends_on`、`contains`、`explains`、`prerequisite` 显示方向；`related_to`、`contrasts_with` 不强调方向。边默认显示简短中文关系标签。

## 页面状态

- loading：正在加载知识实体图谱……
- error：显示可理解错误和重新加载按钮，且可切回笔记图谱。
- empty：还没有已确认的知识实体。
- filtered_empty：没有符合当前筛选条件的实体，并提供清除筛选。
- truncated：显示 300 节点提示但不阻止图谱使用。

切离实体图谱或组件卸载时必须忽略过期异步结果。实体图谱错误不得影响笔记图谱。

## 未来测试设计

### buildEntityGraph

覆盖 approved 数据过滤、canonicalName 和 aliases 搜索、大小写/空格、实体和关系类型筛选、无效端点与非 approved 端点过滤、孤立实体、连接数、稳定排序、300 截断、截断后悬空边移除、搜索后低连接实体进入结果和空数据。

### entityGraphService

覆盖只读行为、只读 approved 数据、空数据库、数据库错误向上传递，以及失效关系不破坏查询。

### forceLayoutAdapter

覆盖有限坐标、不丢失或新增节点、不修改边业务字段、相同输入稳定、空图、单节点和替换为其他适配器的能力。

### 组件与 E2E

组件覆盖 `/graph` 默认笔记图谱、切换后才读取实体数据、loading/error/empty/filtered_empty/truncated、三类筛选、悬停、实体详情导航和切回笔记图谱。生产 E2E 覆盖直接访问 `/graph`、默认笔记图谱、切换实体图谱、搜索、点击实体进入详情路由并刷新；300 节点排序由单元测试承担。

## 可删除性边界

未来删除实体图谱，应只需删除 entity-graph 模块、模式切换入口、实体图谱测试和仅供其使用的布局依赖，并更新文档。不应影响 KnowledgeEntity、KnowledgeRelation、NoteEntityLink、KnowledgeAuditLog、AI 候选应用、实体详情页、笔记图谱、Backup v5 或 Dexie schema。