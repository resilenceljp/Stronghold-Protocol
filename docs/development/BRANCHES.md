# 分支与同步约定

## 固定分支

| 分支 | 职责 | 更新方式 |
|---|---|---|
| `master` | 已验证、可部署的 DIY 稳定版 | 从通过验证的 `develop` 快进合入 |
| `develop` | 控制台维护与原版兼容集成 | 功能修复或临时合并分支通过测试后合入 |
| `upstream/original` | 原作者最新正式版的纯净镜像 | 原版同步工作流每天更新；不能放 DIY 修改 |

`merge/original-版本号` 用于一次较大的上游合并，完成后删除。小型快进更新可直接在 develop 集成。
发布使用 `v版本-20p-fun.编号` 标签，原版同步快照使用 `source-original/版本-提交` 标签。
旧备份和重复的娱乐分支归档为 `archive/原分支名` 标签后从远端分支列表移除；标签保留历史。
已有上游 PR 的功能分支保留，不在本次整理中删除或重写。
`upstream/20p` 是兼容旧来源的辅助镜像，仅手动更新，不参与日常同步。

## 一次同步

1. 同步原版正式版至 `upstream/original`，查看它与 develop 的差异。镜像更新不自动改玩法，不部署服务器。
2. 从 develop 开临时合并分支，合并镜像；逐项核对娱乐规则、分组卡池与本机监控接口。
3. 运行 `npm run check:fork`。该检查不需要游戏素材，覆盖控制台授予/血量/资金/等级、七级商店、扩展整备区、藏品、无尽同意、牌库干预、AI 手动操作/接替、清除房间、流量记录及旧身份保护。
4. 按上游变动运行相应专项测试；改渲染或点选需要 Edge 浏览器验证，改战斗行为需要相应黄金场景。check:fork 不能代替完整 CI 或浏览器检查。
5. 合入 develop，检查 GitHub 的 DIY compatibility 与常规 CI；有未通过项时先确认原因，不把“推送成功”当成“CI通过”。
6. 确认可发布后合入 master、加版本标签，再按用户授权备份并更新本地 DIY。不中断现有对局，下次启动生效。

## 控制台与原版的边界

| 功能 | 独立实现位置 | 仍需核对的原版接入点 |
|---|---|---|
| 玩家娱乐控制台 | `server/match/entertainment.js`、`server/match/match/funRules.js` | intents 路由、PlayerState 获取/装备/商店规则 |
| 管理员局内干预 | `server/http/room-control.js` | 房间生命周期、AI身份、分组库存 |
| 监控启动与本机HTTP接口 | `server/http/monitorBoot.js`、`monitor-v6.js` | boot 安装钩子、关闭流程 |
| 流量记录与界面 | `server/http/traffic-ledger.js`、`monitor/` | 网络请求/帧与房间边界 |

这些模块已有拆分，本次不更改玩法，也不把管理接口改为公网插件。它们仍调用本服核心接口，并非可以直接安装到任意原版的独立插件。后续迁移原版插件接口应逐项验证，不能为减少冲突去掉权限或身份校验。

测试放在 `test/fork/` 并纳入常规测试集合；`npm run check:fork` 是维护者的固定入口。CI会在Windows与Ubuntu的Node22上执行，镜像和归档标签不触发整套DIY流水线。
