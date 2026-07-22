# v0.1.0 候选发布检查清单

本清单用于候选发布复核与正式 GitHub 发布操作。勾选只代表已完成的本地证据；远端推送、标签和 GitHub Release 必须由发布人确认后执行。

## A. 候选内容准备

- [x] 初始基线确认：候选准备前 `main` 与 `origin/main` 一致；
- [x] 项目版本和 `package-lock.json` 根版本均为 `0.1.0`；
- [x] `CHANGELOG.md`、v0.1.0 发布说明和本清单已完成；
- [x] README 已包含隔离演示截图，并确认截图不含真实笔记、API Key 或真实浏览器 Profile；
- [x] 已检查候选提交范围，不包含用户数据、`.env.local`、备份、浏览器 Profile 或媒体私密文件；
- [x] 已完成敏感标记和本地路径扫描；
- [x] 未改变 Dexie v11、Backup v5、数据库迁移或公开业务 API。

## B. 自动验证

- [x] `npm run typecheck` 通过；
- [x] `npm run test` 通过；
- [x] `npm run build` 通过；
- [x] `npm run test:e2e` 通过；
- [x] 版本契约测试通过；
- [x] `git diff --check` 通过。

## C. 构建产物与本地预览

- [x] 已检查生产 `dist/` 的 bundle 大小和既有 html2pdf chunk 警告；
- [x] 已扫描 `dist/`，未发现 API Key 标记、用户绝对路径、临时 Profile 路径或演示 fixture 本地路径；
- [x] 已使用隔离浏览器上下文完成本地生产预览 smoke，覆盖首页、编辑、搜索、年度足迹、课程、图谱和设置入口；
- [x] 未占用或清理非本项目启动的本地服务。

## D. 正式发布操作（需要用户确认）

- [ ] 推送候选提交到远端；
- [ ] 创建带注释标签 `v0.1.0`；
- [ ] 推送标签；
- [ ] 在 GitHub 创建 Release；
- [ ] 粘贴并人工复核发布说明；
- [ ] 检查 GitHub Release、README 与文档链接；
- [ ] 在干净克隆或隔离目录完成一次源码安装与构建验证；
- [ ] 记录最终 Release URL。

## E. 发布后检查（需要用户确认）

- [ ] 确认 GitHub Actions 与 Release 页面状态正常；
- [ ] 确认下载/克隆入口可用；
- [ ] 以普通用户路径复核本地运行、备份导出和恢复说明；
- [ ] 记录真实使用反馈与后续问题，不把候选版本表述为无已知限制的稳定版。