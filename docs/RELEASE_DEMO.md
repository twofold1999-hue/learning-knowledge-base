# 发布演示数据与截图

本项目的 README 截图全部来自隔离的虚构演示数据。演示流程不会读取、覆盖或删除真实知识库、浏览器默认 Profile、其他独立验收 Profile、API Key 或外部 AI 服务。

## 安全边界

- 浏览器 Profile 只能位于 `%TEMP%\learning-knowledge-base-release-demo`，并且脚本会拒绝空路径、TEMP 根目录、用户根目录、项目目录及其子目录、Chrome/Edge 默认 User Data 目录，以及不含 `release-demo` 标记的路径。
- 只接受 `http://127.0.0.1:4174` 和 `http://localhost:4174` 两个本地来源；脚本会拦截其他 HTTP/HTTPS 请求。
- 首次打开应用后才访问已有的 `LearningKnowledgeBase`；若 IndexedDB 需要创建或升级，`onupgradeneeded` 会中止操作。
- 不调用 `indexedDB.deleteDatabase`。`--reset` 仅删除主键以 `release-demo-` 开头的记录，然后用确定性的 `put` 写回演示数据。
- 演示内容是虚构的空间数据学习主题，不含真实个人笔记、文件路径、密钥或远端 AI 输出。

## 生成步骤（PowerShell）

在项目根目录执行：

```powershell
npm run build
npm run e2e:server
```

保持第二个命令所在窗口运行，再在新的 PowerShell 窗口验证和写入隔离演示数据：

```powershell
node scripts/release-demo-fixtures.mjs --dry-run
node scripts/release-demo-fixtures.mjs --reset
node scripts/capture-release-screenshots.mjs
```

默认 Profile 是：

```powershell
$env:TEMP\learning-knowledge-base-release-demo
```

截图只会写入以下六个受限输出文件：

```text
README 对应的 docs/assets/screenshots/01-home-dashboard.png
README 对应的 docs/assets/screenshots/02-editor-workspace.png
README 对应的 docs/assets/screenshots/03-search-and-wiki.png
README 对应的 docs/assets/screenshots/04-learning-footprint.png
README 对应的 docs/assets/screenshots/05-course-progress.png
README 对应的 docs/assets/screenshots/06-entity-graph.png
```

截图覆盖首页、Markdown 编辑工作区与辅助面板、搜索与 Wiki 链接、年度创建足迹、课程进度和 approved-only 实体图谱。截图脚本使用 1440 × 900、device scale factor 1 与 reduced motion，避免浏览器 chrome 或开发者工具进入画面。

## 演示数据范围

演示数据包含 16 篇虚构笔记，覆盖 2024、2025、2026；一门包含六章的 `Python Spatial Data Analysis` 课程，其中三章已学习；32 个已确认实体和 45 条已确认关系。另有 suggested/rejected 关系用于确认实体图谱仍只展示 approved 数据。所有标题、正文、实体名称和关系都使用空间数据、遥感、水资源和知识图谱设计主题。

## 仅清理演示 Profile

截图完成且确认不再需要演示数据时，可以关闭演示浏览器并只删除这个精确目录：

```powershell
Remove-Item -LiteralPath "$env:TEMP\learning-knowledge-base-release-demo" -Recurse -Force
```

不要把该命令改为 TEMP 根目录、真实浏览器 Profile 或项目目录。README 中已经提交的 PNG 是发布文档资产；删除 Profile 不会删除这些截图。