# Windows 桌面开发

本文说明 v0.2.0 的桌面运行边界和开发验收方式；它不是安装包或公开发布说明。

## 产品身份与数据边界

- 产品名：`学习知识库`
- 开发版本：`0.2.0`
- Tauri identifier：`com.learningknowledgebase.desktop`
- 普通桌面数据使用 Tauri `appLocalDataDir` 对应的当前用户 LocalAppData；主要数据不使用 Roaming AppData。
- 桌面基线只管理本应用的 `config`、`media`、`backups`、`logs`、`temp` 和 `runtime` 目录。WebView 数据仍由 Tauri/WebView 管理，应用不会扫描浏览器 Profile。

## 启动与工作区生命周期

Web 模式保持原有行为：完成 Web 本地迁移后直接进入工作区，且不会调用 Tauri command。

桌面模式的流程为：

`booting → ready → opening_workspace → active`

启动后先显示桌面控制中心，而不是立即读取全部笔记、课程、项目或目录。用户点击“启动并进入知识库”后，工作区初始化器一次读取所需投影并更新现有 store；并发点击复用同一初始化请求，失败时不会发布半成品工作区。

控制中心显示产品名、版本、数据目录准备状态和上次可能的异常退出提示。当前可用操作：

- 启动并进入知识库；
- 配置 AI；
- 退出程序。

“导入浏览器版 Backup”、“打开备份目录”和“查看日志”仍为禁用的后续功能，不绑定替代行为。

工作区顶部仅在桌面模式显示“返回控制中心”和“安全退出”。返回控制中心会先完成保存栅栏，不关闭应用，也不清空数据；再次进入工作区会安全刷新必要数据。

## 桌面 AI 配置与凭据边界

桌面控制中心和桌面设置页复用同一套 AI 配置面板。它只在 Tauri 桌面运行时挂载；Web 模式不会调用 Tauri command，也不会显示桌面 API Key 字段。

- 普通配置保存在本应用 `config/ai-settings.json`：schema v1、provider、HTTPS 根地址、模型、超时和启用状态。文件不含 API Key、脱敏尾号或运行时请求数据。
- API Key 仅通过 Rust `SecretStore` 写入 Windows Credential Manager 的 Generic Credential，稳定 target 为 `com.learningknowledgebase.desktop/ai/deepseek/api-key/v1`。前端读取时只能看到是否已配置和末四位掩码，不能读回完整 Key。
- 允许的提供商为 DeepSeek；地址必须是公网 `https` 根地址（默认 `https://api.deepseek.com`），拒绝 URL 凭据、路径、查询、片段、非 443 端口、localhost、`.local`/`.internal` 和私网/回环 IP。模型长度限制为 1–128，超时范围 5–120 秒。
- 保存使用同目录临时文件、`sync_all` 和替换；损坏 JSON 只报安全错误，不会自动覆盖或删除。替换 Key 后若普通配置写入失败，会尝试恢复先前凭据，并在无法恢复时报告安全的部分更新错误。
- “忘记 API Key”会关闭桌面 AI 并删除该 Credential；没有 Key 时 AI 功能不可用，但笔记、课程、搜索、图谱和 Backup 保持可用。
- 本阶段只配置凭据和普通设置，尚未把真实 AI 网络请求迁移到 Rust；不会从桌面页面调用 DeepSeek，也不会改变浏览器同源代理。

## 安全退出与未清洁退出提示

编辑器注册自己的 debounce flusher。关闭窗口、返回控制中心或点击安全退出都经过同一保存栅栏：先 flush 尚未触发的编辑器保存，再等待已开始的写入。任一 flusher 或写入失败都不会被视为安全退出。

普通窗口关闭由 Rust 拦截，Rust 发送 `desktop-close-requested`，前端完成保存后调用 graceful exit command。保存失败会显示“无法安全退出”对话框，用户可以重试、留在知识库，或经第二次确认后强制退出。

`runtime/unclean-exit.marker` 只表示上次运行可能未正常退出：

- 启动时保留/创建 marker，并把既有 marker 暴露为异常退出提示；
- 只有保存成功后的 graceful exit 删除 marker；
- 强制退出、任务管理器结束、崩溃或断电都可能保留 marker；
- marker 不能证明数据一定损坏，应用不会因此自动删除 IndexedDB、恢复 Backup 或回滚笔记。

Windows 注销、关机、断电和任务管理器强制结束无法保证完整保存；强制退出绝不标记为“安全退出”。

## 单实例

第二次启动不会创建第二个独立实例。它恢复最小化窗口、在需要时显示窗口并请求聚焦，不转发命令行参数或清除页面状态。主窗口标签为 `main`。

## 手工桌面验收

> 不要用真实资料做首次验收；使用单独的测试数据目录。

1. 运行 `npm run desktop:dev`，确认先显示控制中心，且其中没有笔记内容或绝对数据路径。
2. 确认产品名、版本、就绪状态可见；“配置 AI”可打开，其他后续功能按钮仍为禁用状态。
3. 点击“启动并进入知识库”，确认原工作区正常出现；返回控制中心后再次进入仍可使用。
4. 编辑一篇测试笔记后立即点击窗口关闭，确认保存完成后才退出。
5. 在可控的保存失败场景中确认出现“无法安全退出”；“留在知识库”不退出，“仍然退出”需要再次确认。
6. 任务管理器强制结束测试实例后重开，确认控制中心提示上次可能未正常退出；正常安全退出后下次不再显示旧提示。
7. 再次启动应用，确认既有窗口被恢复并聚焦，不创建第二个窗口。
8. 在普通浏览器打开 Web 版本，确认仍直接进入工作区且没有桌面控制中心或桌面操作入口。
9. 在隔离 Windows 用户或测试环境，输入一次测试 Key 后确认只显示掩码；关闭并重新打开后仍显示已配置。不要在日志、JSON、Backup 或 Web 设置页中寻找或粘贴真实 Key。
10. 点击“忘记 API Key”并确认桌面 AI 关闭；笔记、搜索和 Backup 仍可用。
11. 确认关闭应用后没有本项目的后台服务、CMD 或 PowerShell 窗口。

## 本阶段未实现

本阶段不实现真实 AI 传输迁移或测试连接、Backup 文件迁移或恢复、打开备份目录、日志查看和轮转、删除全部数据、安装器/WebView2 策略、代码签名、系统托盘、自动更新、多窗口或 Node sidecar，也不改变 Dexie v11 或 Backup v5。
