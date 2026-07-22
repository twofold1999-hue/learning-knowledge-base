# Windows 桌面开发基线

本文记录 v0.2.0 的桌面工程基线；它不是安装包或公开发布说明。

## 产品身份

- 产品名：`学习知识库`
- 开发版本：`0.2.0`
- Tauri identifier：`com.learningknowledgebase.desktop`

## 本地运行

```powershell
npm run desktop:dev
```

应用使用 Tauri 的 `appLocalDataDir` 语义。在 Windows 上，它是按稳定 identifier 隔离的当前用户 LocalAppData 位置，而不是 Roaming AppData。桌面基线仅创建本应用的 `config`、`media`、`backups`、`logs`、`temp` 与 `runtime` 目录。WebView 数据由 Tauri/WebView 管理；应用不会扫描浏览器 Profile。

## 单实例行为

第二次启动不得创建第二个独立实例。它会恢复最小化的主窗口、在可能时显示隐藏的主窗口，并请求聚焦，且不会清除现有页面状态。已配置的主窗口标签为 `main`。

## 手工桌面验收

1. 运行 `npm run desktop:dev`，确认主窗口标题是“学习知识库”。
2. 确认 release 构建路径不会创建无关控制台窗口。
3. 再次启动应用，确认现有窗口被恢复并聚焦，而不是重复创建窗口。
4. 关闭主窗口，确认应用退出，再次启动能正常打开。
5. 确认当前用户的 Tauri 本地数据根目录中只创建本文记录的应用目录，且浏览器 Profile 未被读取或修改。

## 本阶段未实现

本阶段不实现桌面控制中心 UI、Credential Manager/SecretStore、AI 传输迁移、DesktopBridge、备份迁移或恢复、删除全部数据、安装器/WebView2 策略、代码签名、系统托盘、自动更新，也不改变 Dexie v11 或 Backup v5。
