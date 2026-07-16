# 产品性能基线

此目录只承载可重复执行的诊断工具与采样结果；它不进入生产 bundle，也不会读取或修改用户的真实浏览器资料。

## 运行方式

```powershell
npm run build
node --test performance/scripts/baseline-utils.node.mjs performance/scripts/bundle-baseline.node.mjs performance/scripts/browser-baseline.node.mjs
node performance/scripts/run-baseline.mjs --output performance/baseline/YYYY-MM-DD.json
```

`run-baseline.mjs` 使用项目已有的 `scripts/e2e-server.mjs`，在 `127.0.0.1:4174` 启动生产 `dist`，并在独立的 Chromium browser context 中创建临时 IndexedDB。每个 context 在采样后关闭，因此不会写入用户的默认浏览器 profile 或本地知识库。

## 口径

- Bundle：递归读取 `dist`，记录原始字节、gzip 字节、JS/CSS 清单和最大产物。
- 编辑器：5/50/250 KiB 正文各三轮，记录首次 CodeMirror 可输入、一次短输入、800ms 防抖后的实际写入完成、DOM、长任务和页面错误。
- 热力图：100/500/2000 笔记各三轮，记录首次可见和 DOM。没有生产埋点时，聚合单独耗时标记为 unavailable，首次可见包含聚合与渲染。
- 实体图谱：50/300 approved 实体各三轮，记录切换到实体模式后的首次节点可见和 DOM；额外进行首页→编辑→首页十轮生命周期检查。
- Backup：使用隔离浏览器内的原生 IndexedDB 只读快照与 JSON 序列化代理，记录普通和较大样本。该代理不把 `backupService` 暴露给生产页面。

浏览器没有标准、安全的通用 listener 计数 API，因此 `listenerCount` 固定为 `null`。`performance.memory` 仅在 Chromium 可用，不能据此得出 heap 泄漏结论。