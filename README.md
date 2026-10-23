# DSH 重启按钮（dsh-restart-button）

给 **DeepSeek Harness 桌面版** 的本地插件：在「设置 → 通用」里加一个**一键重启**按钮，并把同一动作做成**可自定义的快捷键**。不用再右键托盘图标退出、再手动启动。

> 仅支持 Windows 桌面版。原理依赖 Electron 主进程 + Host 进程的父子关系，Web/CLI 部署不适用。

## 功能

- **设置里的重启按钮**：设置 → 通用 → 「重启 DeepSeek Harness」→ 点「重启」，约 2 秒窗口关闭并自动重新打开。
- **快捷键**：默认 <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>R</kbd>（仅桌面端默认绑定），在 **设置 → 通用 → 键盘快捷键** 里可以改成任意组合（支持单键/双键）。
- **有任务时会先问**：仅当真的有进行中的任务（agent 正在生成/工具在跑、排队的用户消息、后台 job、挂起的定时任务）时，才会弹出确认卡片（Esc 取消）；空闲时一键直接走。
- **优雅重启**：结束的是 Electron 外壳，宿主进程会因 IPC 断开自行完成关闭（会话日志正常落盘），然后重新启动应用。

## 安装

这是 DSH 的本地插件包（`dsh.bundle`），把整个目录放在任意位置，然后用 DSH 的插件管理器安装：

```
plugin_manager install_bundle  target = <本目录的绝对路径>
```

或在会话里让 DSH 的 agent 帮你装（对它说「装一下这个本地插件」）。安装会写入 desktop profile 的 bundle 列表，插件对所有会话生效并随应用启动加载。

## 使用

| 操作 | 位置 |
|---|---|
| 重启按钮 | 设置 → 通用（在「当前版本」上方） |
| 改快捷键 | 设置 → 通用 → 键盘快捷键 → 「重启 DeepSeek Harness」→ 点键位重新录制 |
| 查看诊断日志 | 插件目录下的 `launch.log`（重启脚本每一步）、`orchestrator.log`（交接记录）、`blocked.json`（最近一次被拦截的原因） |

## 实现原理

```
页面（设置行 / 快捷键）
   └─ POST /api/dsh-restart            ← 走 DSH 自带的 /api 鉴权载体
        └─ 宿主插件：判断是否有任务 → 需要确认就先回 needs-confirmation
             └─ spawn + await launch.ps1        （同步等交接完成）
                  └─ WMI Win32_Process.Create   （让重启脚本独立于宿主存活）
                       └─ restart.ps1：结束 Electron 主进程
                            → Host 感知 IPC 断开，自行优雅退出（会话落盘）
                            → Start-Process 重新启动 DeepSeek Harness.exe
```

几个关键点：

- 宿主进程用 `detached: true` 拉起的 PowerShell 会**直接退出且不执行脚本**（实测），所以改用 WMI 创建独立进程；
- 判断「是否有任务」不能用 `agent.inbox.nextStep`：系统通知（例如权限变更提示）会滞留在 idle 会话里，导致永远误报；
- 快捷键默认值只声明桌面端：Web 端的 `page.refresh`（刷新页面）已占用 `primary+alt+KeyR`。

## 文件结构

| 文件 | 作用 |
|---|---|
| `index.js` | 宿主半边：`/api/dsh-restart` 路由、任务检测、启动重启编排脚本 |
| `client.js` | 页面半边：设置行、确认卡片、快捷键命令、文案字典 |
| `launch.ps1` | 编排器：用 WMI 创建真正执行重启的脚本（宿主退出后仍存活） |
| `restart.ps1` | 真正重启：校验进程路径 → 结束主进程 → 等待宿主优雅退出 → 启动应用 |
| `cordis.patch.yml` | 插件加载条目 |
| `locale/*.json` | 插件管理页显示用的标题/描述 |
| `icon.svg` | 插件图标 |

## 已知限制

- 仅 Windows 桌面版；重启时没有「你确定要退出吗」的原生对话框（有任务时由插件自己的卡片确认）。
- 依赖系统自带的 WMI 与 PowerShell 7（没有 PowerShell 7 时回退到 Windows PowerShell）。
- 重启会中断正在生成的任务（确认卡片里会说明）。

## 关于上传

本仓库**不是仓库主人手动创建/上传的**：代码由仓库主人在 DSH（DeepSeek Harness）会话中与 AI 助手协作完成，仓库创建、提交、推送以及临时访问令牌的创建与删除，全部由该 AI 助手代为自动执行（主人只授权了 GitHub 登录会话并选择了公开可见性）。因此提交历史里的自动化痕迹（单次批量提交、临时 PAT）是预期现象。

