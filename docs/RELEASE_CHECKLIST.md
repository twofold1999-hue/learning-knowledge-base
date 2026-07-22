本清单记录 v0.1.0 从候选准备、正式发布到发布后复核的证据。v0.1.0 已于 2026-07-22 正式发布；未完成的长期真实使用反馈继续保留为后续事项。

# v0.1.0 发布检查清单

## A. 候选内容准备

- [X] 初始基线确认：候选准备前 `main` 与 `origin/main` 一致；
- [X] 项目版本和 `package-lock.json` 根版本均为 `0.1.0`；
- [X] `CHANGELOG.md`、v0.1.0 发布说明和本清单已完成；
- [X] README 已包含隔离演示截图，并确认截图不含真实笔记、API Key 或真实浏览器 Profile；
- [X] 已检查候选提交范围，不包含用户数据、`.env.local`、备份、浏览器 Profile 或媒体私密文件；
- [X] 已完成敏感标记和本地路径扫描；
- [X] 未改变 Dexie v11、Backup v5、数据库迁移或公开业务 API。

## B. 自动验证

- [X] `npm run typecheck` 通过；
- [X] `npm run test` 通过；
- [X] `npm run build` 通过；
- [X] `npm run test:e2e` 通过；
- [X] 版本契约测试通过；
- [X] `git diff --check` 通过。

## C. 构建产物与本地预览

- [X] 已检查生产 `dist/` 的 bundle 大小和既有 html2pdf chunk 警告；
- [X] 已扫描 `dist/`，未发现 API Key 标记、用户绝对路径、临时 Profile 路径或演示 fixture 本地路径；
- [X] 已使用隔离浏览器上下文完成本地生产预览 smoke，覆盖首页、编辑、搜索、年度足迹、课程、图谱和设置入口；
- [X] 未占用或清理非本项目启动的本地服务。

## D. 正式发布操作

- [X] 推送候选提交到远端；
- [X] 创建带注释标签 `v0.1.0`；
- [X] 推送标签；
- [X] 在 GitHub 创建 Release；
- [X] 粘贴并人工复核发布说明；
- [X] 检查 GitHub Release、README 与文档链接；
- [X] 在干净克隆目录完成源码安装、依赖审计、测试与构建验证；
- [X] 记录最终 Release URL。

## E. 发布后检查

- [X] 确认 GitHub Release 页面状态正常；当前提交没有待处理的必要状态检查；
- [X] 确认源码 ZIP、TAR.GZ 与克隆入口可用；
- [X] 复核本地运行入口、备份导出和恢复说明；
- [ ] 持续记录真实使用反馈与后续问题，不把 v0.1.0 表述为无已知限制的稳定版。

## F. 最终发布记录

- 发布日期：2026-07-22
- 版本标签：`v0.1.0`
- 发布提交：`e7170ee4699d4aa063a836f548ff4d04443dca39`
- Release URL：`https://github.com/twofold1999-hue/learning-knowledge-base/releases/tag/v0.1.0`
- 发布状态：Latest Release
- 验证结果：干净克隆安装成功，依赖审计为零，类型检查、328 项 Vitest、26 项 Node 契约测试、3 项发布版本契约测试、构建及 33 项 Playwright E2E 全部通过。
