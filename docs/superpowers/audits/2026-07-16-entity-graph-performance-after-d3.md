# 实体图谱性能与生命周期对比：20-D3

- **对比基线：** `2a51dad206bae15a405726d9b2d8eeb32e7192bf`（D1 基线 JSON：`performance/baseline/2026-07-16.json`）
- **本次测量源：** `2d1c162626a574a885b0678ea50c79084dbefb4e+worktree`；测量发生在 D3 代码提交前，JSON 中以 `+worktree` 明确标记。
- **环境：** Windows、Node `v24.15.0`、Playwright Chromium `149.0.7827.55`、生产 `dist`、`scripts/e2e-server.mjs`、`127.0.0.1:4174`、独立 browser context。
- **口径：** 50/300 个 approved 实体和链式 approved 关系，各三轮取中位数；测试先让应用初始化当前 Dexie，再通过原生 IndexedDB 写入样本，`onupgradeneeded` 一律失败。

## 这次改动验证的边界

实体图谱现在按真实阶段运行：`loading-data → building → laying-out → rendering → ready`。每个计算阶段以前后两个 `requestAnimationFrame` 分隔，避免在数据读取完成后立刻用同步 builder/layout 占满同一帧。相同快照和筛选条件只运行一次 builder/layout；筛选、重试或新快照才开启新 generation。旧 generation、已卸载视图和已取消的 rAF 不能回写页面；d3 simulation 在创建后与完成后均显式 `stop()`。

单元测试验证稳定输入的 builder/layout/fitView 均为 1 次；筛选变化才重新准备；旧 layout 完成不会覆盖新 generation；卸载后未完成 snapshot 不会启动 builder/layout。生产 E2E 覆盖 50、300 和 10 轮图谱生命周期。

## 结果

|规模|D1 首次节点可见|D3 首次节点可见|D1 DOM|D3 DOM|节点/边|
|---|---:|---:|---:|---:|---:|
|50|841.2 ms|976.6 ms|609|609|50 / 49|
|300|1266.8 ms|1272.0 ms|3109|3110|300 / 299|

首次节点可见没有明显改善：300 节点为 +5.2 ms（约 +0.4%，可视为同量级波动），50 节点本轮较慢。D3 的目标不是通过静默减少节点换取更低数字；它保留了完整 approved 图，并把原本空白的准备时间变为可观察反馈。因此不能把本次结果宣称为首次节点可见的性能提升。

## 300 实体阶段观察

三轮中位数的 `ready` 为 **1149.6 ms**；首次可见为 **1272.0 ms**。阶段时间来自浏览器中观察到的阶段切换，包含浏览器调度与 rAF，让用户可见的阶段而不是纯 CPU profiler 数字。

|观察区间|中位数近似值|含义|
|---|---:|---|
|进入 `loading-data`|551.6 ms|图谱模式加载后先显示“正在读取知识数据”|
|`building → laying-out`|21.0 ms|builder 与帧边界|
|`laying-out → rendering`|317.7 ms|180 tick d3 layout 与帧边界，是主要可见计算段|
|`rendering → ready`|196.9 ms|React Flow DOM 提交与一次 fitView|

50 节点相应的中位 `ready` 是 724.6 ms；它不显示持续的大图提示。300 节点在准备和 ready 后显示当前实际实体/关系数量。

## MiniMap、Controls 与 Background

300 节点完成后，MiniMap 子树为 **303 DOM 节点**，Controls 为 **9**，Background 为 **3**，页面总 DOM 为 **3110**。MiniMap 约占已观察 DOM 的 9.7%，但当前没有生产 A/B 数据证明它是首次节点可见的主瓶颈；本任务没有基于猜测移除它。节点颜色查询已改为节点自身的稳定数据，不再在 MiniMap 的每次回调中线性搜索整个布局节点数组。

## 生命周期

新增图谱 → 首页循环 10 轮后：首页 DOM 每轮均为 **90**，首末差 **0**，页面错误 **0**。生产 E2E 的同类 10 轮测试也通过。Chromium 不提供通用 listener 数量；`performance.memory` 是最佳努力采样，不能单独得出 heap 无泄漏结论。

## 未解决问题与建议

1. **P1，仍需测量后再决定：** 300 节点的布局段约 318 ms，且 React Flow 提交约 197 ms；若真实低配 Windows/Edge 验收仍卡顿，再单独设计 Worker 方案。当前不引入 Worker、Canvas、缓存历史布局或裁剪。
2. **P2：** MiniMap DOM 成本明确但未证明影响首次可见。只有在后续受控 A/B 测量确认收益后，才考虑“大图默认关闭、用户可打开”的局部策略。
3. **不建议立即继续图谱优化：** 先用真实用户规模与低配设备验证本次反馈、取消和生命周期边界；本任务已消除确定性的重复计算和陈旧结果风险，但没有虚构毫秒收益。
