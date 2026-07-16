# 性能、内存与生命周期基线 v1

- **基线提交：** `2a51dad206bae15a405726d9b2d8eeb32e7192bf` (`feat: migrate editor assistants to side panel`)
- **采样日期：** 2026-07-16
- **环境：** Windows (`win32`)、Node `v24.15.0`、Playwright Chromium `149.0.7827.55`、生产 `dist`、`scripts/e2e-server.mjs`、`http://127.0.0.1:4174`
- **隔离：** 每个场景使用新 Chromium browser context；先由应用初始化当前 Dexie schema，再以原生 IndexedDB 写入临时样本。`onupgradeneeded` 一律失败，缺少所需 object store 也失败。context 关闭后不保留用户资料。
- **原始数据：** `performance/baseline/2026-07-16.json`

本报告只建立测量基线；没有优化、没有业务代码改动，也没有性能门槛。

## 可重复执行方式

```powershell
npm run build
node --test performance/scripts/baseline-utils.node.mjs performance/scripts/bundle-baseline.node.mjs performance/scripts/browser-baseline.node.mjs
node performance/scripts/run-baseline.mjs --output performance/baseline/YYYY-MM-DD.json
```

采样器拦截所有非 `127.0.0.1:4174` 的 HTTP(S) 请求；出现此类请求即失败。它不启动 Vite，不读取真实浏览器 profile，也不改动本地知识库。

## Bundle

|指标|结果|
|---|---:|
|`dist` 总大小|2,772,797 B（2.644 MiB）|
|最大产物|`assets/html2pdf-D20Rt9EK.js`，935,882 B / gzip 263,986 B|
|CodeMirror lazy chunk|531,825 B / gzip 181,925 B|
|实体图谱 view chunk|18,146 B / gzip 7,041 B|
|图谱页面 chunk|5,615 B / gzip 2,502 B|

`html2pdf`、CodeMirror 和图谱仍是独立产物；此任务没有调整 chunk、依赖或加载策略。

## 编辑器（每种规模 3 轮，中位数）

`首次可输入` 从访问编辑页到 CodeMirror 可见；`短输入` 是一次小范围文本插入；`写入可见` 从该插入开始到 IndexedDB 中观察到内容。后者是端到端观察值，包含页面已有调度和写入路径，不能单独证明 800ms 防抖定时器的精确等待时长。

|正文规模|首次可输入|短输入|写入可见|输入后 long task|DOM|
|---|---:|---:|---:|---:|---:|
|5 KiB|894.7 ms|18.4 ms|33.3 ms|0|125|
|50 KiB|767.2 ms|73.3 ms|92.6 ms|1|127|
|250 KiB|1,956.5 ms|54.3 ms|73.3 ms|1|127|

250 KiB 的首次可输入明显高于较小正文，是 D2 比较时应保留的主信号。一次小范围插入未显示随正文线性恶化；这不是对连续输入、IME 或低配设备的结论。

## 笔记创建足迹 / 热力图（每种规模 3 轮，中位数）

|笔记数|首次可见|DOM|
|---|---:|---:|
|100|300.6 ms|307|
|500|167.2 ms|307|
|2,000|178.5 ms|307|

当前没有生产埋点可把聚合与首次渲染拆分，因此仅记录首次可见总耗时。固定 DOM 数量符合现有固定自然周格子的设计；不同规模的波动不应被解读为优化结果。

## 实体图谱（approved 数据，每种规模 3 轮，中位数）

|实体数|渲染节点|首次节点可见|DOM|
|---|---:|---:|---:|
|50|50|841.2 ms|609|
|300|300|1,266.8 ms|3,109|

300 实体首次可见约 1.27 秒，是后续 D3 的对比基线。页面测量包含 production bundle 加载、Dexie 只读快照、builder、180 tick layout 和 React Flow DOM 准备，不将任一阶段错误归因。

## 生命周期

运行 10 轮：首页 → 编辑页 → 首页。每轮回到首页的 DOM 都是 306，首末差值为 0；没有页面错误。浏览器不提供安全、通用的 listener 总数 API，因此 listener 记录为 `unavailable`；此结果不能单独证明不存在所有类型的监听器或 heap 泄漏。

## 内存边界

Chromium 本次提供 `performance.memory` 的粗略值：编辑器约 10.6–12.7 MB、300 实体图谱约 16.1 MB、热力图 2,000 笔记约 12.7 MB。该字段是 Chromium 专有、采样粒度有限，不能作为 JS heap 泄漏结论，也不能替代真实 8 GB Edge 验收。

## Backup 快照代理

生产页面不暴露 `backupService`，因此这里使用同一隔离 context 中的原生 IndexedDB **只读快照 + JSON 序列化代理**。它用于趋势测量，不替代 backupService 的单元与恢复测试。

|样本|笔记|每篇正文|序列化 JSON|只读快照|序列化|总计|
|---|---:|---:|---:|---:|---:|---:|
|普通|100|1 KiB|140,516 B|3.3 ms|0.4 ms|3.8 ms|
|较大|500|5 KiB|2,751,916 B|23.9 ms|3.9 ms|27.8 ms|

本任务未修改 Backup 格式、实现、限制或调度。

## 当前风险与后续使用

1. **P1：** 250 KiB 编辑器首次可输入约 1.96 秒；20-D2 应首先以本 JSON 同口径比较 allNotes 正文治理前后差异。
2. **P1：** 300 实体图谱约 1.27 秒、3,109 DOM 节点；20-D3 应以阶段拆分和生命周期回落数据决定最小改动，不能据此直接引入 Worker/WASM。
3. **P2：** heap、listener 与热力图聚合阶段没有可移植精确指标。若未来确实需要更精细归因，应另行设计诊断埋点，不在性能优化任务中顺带加入。
4. **P2：** Bundle 中 html2pdf 和 CodeMirror 是最大可见产物；目前均非首屏直接加载，不能仅凭体积启动拆包改造。

后续 D2/D3 应复用此 harness、使用相同规模和至少三轮中位数，不设置设备敏感的 CI 毫秒硬门槛。