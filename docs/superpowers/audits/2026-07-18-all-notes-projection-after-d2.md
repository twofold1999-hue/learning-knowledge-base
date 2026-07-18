# Task 20-D2：allNotes 正文常驻治理验收

## 结论

`noteStore.notes` 与 `noteStore.allNotes` 现在只保存 `NoteProjection`，不包含 `content` 属性。完整 Markdown 仅由编辑器的 `currentNote`、一次性导出和 Backup 的数据库读取持有。

## 消费者矩阵

| 消费者 | 最小数据 | 是否读取全文 |
| --- | --- | --- |
| App 初始化、首页、侧栏、标签、紧凑热力图、年度足迹 | 标题、标签、创建/更新时间、分类 ID | 否 |
| 随机回顾、NoteCard、课程章节 | `contentPreview`、`isLearned` 与课程字段 | 否 |
| EditorPage | `currentNote: Note`；全局链接输入只用 title/wikiTargets | 当前编辑笔记才需要 |
| Wiki 前/反链、笔记图谱 | id、title、wikiTargets、tags | 否 |
| 正文搜索、孤立链接检查 | 按需逐条读取正文，结果立即投影 | 仅查询期间 |
| Markdown/PDF/Word 导出、Backup | 明确的一次性完整数据库读取 | 是 |
| 回收站 | `DeletedNote` 原有完整契约 | 是，未改模型 |
| 实体图谱 | 独立知识实体服务 | 不依赖 Note 列表正文 |

## 新数据流

```text
IndexedDB notes --逐条转换--> NoteProjection[] --> notes/allNotes --> 列表、统计、图谱、链接索引
IndexedDB notes --fetchNote(id)--> Note --> currentNote --> 编辑器、Markdown、AI
IndexedDB notes --一次性读取--> Note[] --> 导出 / Backup
```

`toNoteProjection()` 复制数组字段，提取全部 Wiki 目标（去空、大小写不敏感去重、保留首次拼写和顺序），并生成最多 200 字符的预览。预览移除 HTML 注释和 Markdown 图片，因而不会持有图片 Data URL 或超长无空格正文。

## 搜索、链接与完整性

- 搜索仍匹配标题、标签和完整正文，但结果是投影；不再保留 FlexSearch 的全局 `Note` Map。
- 当前草稿的前链仍从最新 draft 内容解析；已保存笔记的反链与笔记图谱只消费 `wikiTargets`。
- 保存、AI 同步、创建、恢复和课程重排均在持久化成功后更新投影；失败不会写入假预览或假 Wiki 目标。
- Backup 保持 v5 和完整 Note JSON；设置页 Markdown/PDF/Word 导出改为显式读取完整记录，绝不以 preview 代替正文。

## 测量环境与结果

环境：Windows、Node v24.15.0、Chromium/Playwright、生产 `dist` 和隔离 IndexedDB；3 轮中位数。完整原始数据见：

- `performance/baseline/2026-07-18-d2.json`
- `performance/baseline/2026-07-18-d2-projection-payload.json`

| 项目 | 100 | 500 | 2000 |
| --- | ---: | ---: | ---: |
| 热力图首次可见（ms） | 257.8 | 193.3 | 181.8 |
| 投影 JSON payload / 完整 fixture | 5.06% | 5.06% | 5.07% |

编辑器 5/50/250 KiB 的首次可输入中位数分别为 950.7 / 914.5 / 2010.0 ms；250 KiB 的输入与保存中位数为 50.0 / 62.5 ms。实体图谱 50/300 节点首次可见中位数为 962.5 / 1238.2 ms；其 300 节点 DOM 为 3110，属于图谱自身的已知成本，不来自 Note 全文常驻。十轮页面生命周期 DOM 增量为 0，页面错误为 0。

上述 payload 是序列化体积代理，不是浏览器 Heap 测量。当前 schema 不支持 IndexedDB 字段级 projection：逐条读取时浏览器仍会反序列化单条完整记录；本任务消除了完整 `Note[]` 的集中和长期常驻，未声称消除了该单条成本。

## 回归与剩余风险

生产 E2E 验证了首页预览、正文深处检索、打开 250 KiB 级笔记和完整 CodeMirror 内容。单元测试覆盖投影不可变性、预览上限、Wiki 语义、按需正文搜索、Store 成功/失败同步和 2000 篇 payload 代理。

剩余风险：按需全文搜索和孤立链接检查仍是 O(N) 正文扫描；这是保留现有语义且不新增全文索引的有意边界。若将来真实数据量证明该操作不可接受，应单独设计搜索索引，而不是把正文重新放回全局 Store。
