当前版本：UI 2.5 / boot v13（适配0.3.2-20p-fun.15）。启动集成保留原版0.3.2的更新校验与退出流程，监控接入独立到 monitorBoot.js；安装时必须同时复制该辅助模块。

当前版本：UI 2.4 / boot v12（适配0.3.0-20p-fun.14）。插件隔离进程中的房间可查看基础监控和流量，但暂不支持局内干预。普通多人和娱乐/无尽房间不受此限制。

# UI 2.2 / boot v11 · 牌库、AI与压力

本功能需要游戏fun.12及boot v11/monitor-v6.js/traffic-ledger.js/room-control.js四件一起更新。单独给旧原版替换boot不会开启不支持的局内干预。

房间页点击“房间干预”：可调整各组干员和装备库存、开关真人托管，暂停AI后操作其商店/阵容/装备，恢复或移除AI，以及把AI交给后加入的在线玩家。严格素材准入时新玩家须先观战。交接继承AI原局内状态，不覆盖成个人调配，刷新和重连仍能回到该席位。

压力倍率0.1–20，下一回合起乘生命/攻击/防御及Boss血池；设回1恢复。牌库不得少于已持有量，修改只影响后续获取，结束或重刷后重置。后台人工操作不会延长休整倒计时。

写操作均有确认、房间提示和事件记录。仅本机管理，不要穿透监视台或管理端口。更新有备份；结束对局后再重启游戏服，监视台单独重启。上游只读PR #605不包含此管理功能。

# UI 2.1 / boot v10 · 清除房间与实际分组

房间页新增清除房间。确认后立即结束该房间对局，移除AI，将真人与观战者送回大厅，不断开连接也不封禁。旧房间/旧对局请求会拒绝，动作写入事件记录。

对照表读取当前游戏实际固定A–E卡池组；旧版缺少元数据时才使用每4席估算。等待室座位按当前已占用席位预览分组，开局后固定。

需要 Install-Boot-v10.ps1 安装新版boot与辅助模块后，下次启动游戏服生效。监视台更新后单独重启；不要中断正在进行的对局。

# UI 2.0 / boot v9 · 自动端口与服主管理

双击启动监视台即可。首选端口被占用或被 Windows 保留时自动换端口，窗口显示尝试过程和最终地址，再自动打开页面。重复启动会找到同一目录已运行的监视台。可用 Start.ps1 -UiPort 指定首选端口。

在线玩家页可踢出大厅或房间玩家，房间页也有踢出按钮。确认后按正常主动离场流程移除，关闭连接并作废旧会话；局内玩家会失去当前对局资格。不是永久封禁，新会话仍可重新进入。请求会核对玩家ID及当前房间，位置改变时拒绝旧请求。动作写入监视台事件记录。

踢出需要 boot v9、monitor-v6.js、traffic-ledger.js 一起安装。运行 Install-Boot-v9.ps1；安装会备份旧文件，下次游戏启动生效，不要中断正在进行的对局。管理接口仍只监听本机，踢出要求同源页面并经本地管理接口转发。上游 #605 的只读贡献不包含此管理功能。

验证：真实 WebSocket 的大厅/等待房间/进行中对局移除，旧令牌作废，跨来源拒绝、换房旧请求拒绝；浏览器点击大厅与房间按钮；Windows 启动首选3010被保留后转13010，遇占用再转13011，打印地址成功并返回0。测试未踢出真实玩家。

# UI 1.9 · 房间与玩家流量账本

进入「流量账本与历史」，按日期查询：局内/局外、房间/每局/玩家、HTTP素材与WebSocket消息；每项列出玩家上传、玩家下载与合计。素材细分图像、模型、声音、游戏数据、脚本样式与页面。另有房间生命周期和最终玩家LP/资金/战绩，以及SakuraFRP账户用量、剩余变化、补充和重置记录。可以下载当天NDJSON明细。

服务器每秒采样实际TCP负载字节，约30秒落盘到游戏 `runtime/monitor-traffic/`；监视台镜像到 `data/traffic-日期.ndjson`、`rooms-日期.ndjson`、`sakura-日期.ndjson`。关闭游戏后，监视台仍可从已识别的本机账本目录导入和查询。不会自动删除历史；文件随着使用增长。

流量包含压缩后的HTTP/WS内容与协议框架，不含TCP/IP/TLS及FRP额外开销；不能当成平台账单。HTTP通过非敏感浏览器编号关联玩家；无法关联时保留未识别，不以IP猜测个人。FRP来源确认依赖本机进程连接匹配，Tailscale仅地址候选。账户级SakuraFRP用量不可准确分摊到房间或个人。

# UI 1.9 / boot v8 · 服主消息与聊天

新增：向指定房间或全服在线玩家发送200字以内的服主通知；查看指定房间当前对局最近200条聊天。需新boot生效后才能发送，旧boot仍可读取原有监控数据。游戏更新后重启；监视台更新后单独重启监视台，再刷新页面。

安装：运行 `Install-Boot-v8.ps1 -GameRoot D:\Stronghold-Protocol\Stronghold-Protocol-diy`。脚本备份旧boot及辅助模块。最新boot依赖 `monitor-v6.js` 和 `traffic-ledger.js`，三者必须一起复制。管理接口只供本机，消息不通过公网管理端口发送。每次更新运行 `Package-Update.ps1 -Version 1.9`，同步到D:\Stronghold-Protocol。

# Stronghold Monitor UI 1.4 + boot v6

本机独立运行的 Stronghold-Protocol 服务器监视台。纯 Node.js + HTML/CSS/JavaScript，无 npm 安装、无前端构建、无云端服务。界面默认监听 `127.0.0.1:3010`，通过独立进程读取游戏 `3000/healthz` 与管理 `3001/admin/status.json`。

2026-10-12 更新：保留玩家的六类指标表格，新增休整结束阵容、头像、棋盘坐标、朝向、技能、模组、装备、手牌、临时区、Boss 队友阵容，以及当前商店商品、羁绊、效果/悬赏和下一波敌人明细。运行诊断新增游戏端口流量及穿透来源识别。

## SakuraFRP 官方可用流量（v1.2）

总览和运行诊断新增“SakuraFRP 可用流量”，读取官方 `https://api.natfrp.com/v4/user/info` 的 `traffic[0]`（今日已用字节）和 `traffic[1]`（账户总剩余字节）。每 60 秒更新，显示 GiB（1 GiB = 1,073,741,824 字节）和最近成功更新时间。额度属于账户内所有隧道共享，不能解释为 Stronghold 单条隧道的专属剩余；游戏停止时仍查询。

本机已成功读取启动器账户并通过真实接口验证；更新监视台后已生效。认证读取 Windows 官方默认配置 `%ProgramData%\SakuraFrpService\config.json` 的 `token`，仅发送到固定的官方 HTTPS API，使用 Bearer 请求头，不把密钥放入 URL。不会修改启动器配置、隧道或账户。

优先支持 `NATFRP_TOKEN` 环境变量，其次使用启动器配置；如启动器使用自定义配置位置，可设置 `MONITOR_SAKURA_CONFIG` 指向配置文件。`MONITOR_SAKURA_DISABLED=1` 可关闭此查询。修改环境变量后重启监视台。没有配置密钥时显示未连接，不需要浏览器页面保持打开。

API 返回的账号名仅用于核对查询账户；`token/邮箱/实名认证/完整账户响应` 不进入 UI、导出、日志或 ZIP。没有新增本地凭据副本。共享截图与 JSON 前仍可检查是否包含不希望分享的游戏玩家或账户名称。

请求最多等待 10 秒；失败保留最后成功配额并标记旧数据，不伪造 0。读取密钥改变时先清除旧账户数据。流量包详情来自 `GET /user/data_plans?status=valid`，显示名称、总量、剩余和到期时间；流量包详情失败不影响成功读取的账户总剩余。接口没有返回有效流量包时，不显示流量包表。

官方来源：[API 定义](https://github.com/natfrp/api)、[用户信息字段](https://github.com/natfrp/api/blob/master/schemas/UserInfo.yaml)、[启动器配置说明](https://doc.natfrp.com/launcher/manual)。v1.2 本身无需更新游戏 boot，安装包继续包含已验证的 boot v6。

## boot v6 安装和更新时机

本次已按用户授权安装到 `D:\Stronghold-Protocol\Stronghold-Protocol-origin\server\http\boot.js`，辅助模块是同目录 `monitor-v6.js`。原 boot 备份为 `boot.js.backup-20261012-180914-315`。游戏服务未重启。20 人目录只做了实际对局对象兼容测试，未替换其 boot。

其他安装目录先关闭游戏服，再运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Install-Boot-v6.ps1 -GameRoot "D:\Stronghold-Protocol\Stronghold-Protocol-origin"
# 20 人整合包改为其 app 目录：
powershell -NoProfile -ExecutionPolicy Bypass -File .\Install-Boot-v6.ps1 -GameRoot "D:\Stronghold-Protocol\Stronghold-Protocol-20p.4\app"
```

v6 需要两个文件一起安装，不能只复制 boot。安装脚本会备份已有 boot 和已有辅助模块。回滚时把 boot 备份复制回 `server\http\boot.js`，即可恢复旧入口；未被引用的辅助模块可以保留。游戏自动更新可能覆盖 boot，更新后检查 `monitorVersion`，需要时重新安装。

```powershell
$s = Invoke-RestMethod http://127.0.0.1:3001/admin/status.json
$s.monitorVersion  # 应为 6，没有房间也可判断
$s.monitorCapabilities
$s.gameTraffic
$s.roomsDetail[0].matchDetail.players[0].rosterSnapshot
```

**阵容与头像只在每回合 PREP 结束、开始普通战斗或 Boss 战斗前保存一次**，在游戏自身 `onPrepEnd` 和玩家临时区结算之后读取最终阵容。下一轮休整中的移动、出售、技能选择不会改动上一回合快照。界面显示快照回合和时间；新开局首次休整结束前显示“等待保存”。LP、资金、商店等现有指标继续按原周期更新。阵容不是战斗动画或实时录像。

`rosterSnapshot` 含 `round/capturedAt/stageId/board/hand/temp/bossMate`；棋子含 `uid/id/kind/name/avatarUrl/row/col/dir/tier/golden/items/skillIndex/skillName/moduleId/moduleName/potential/cultivate/standInFor`。普通棋盘显示内部坐标 rows 9–12、cols 0–10，实际部署通常 cols 2–10；高行号在上。Boss 队友使用其游戏提供的 Boss 场坐标，另列表展示。棋盘图是位置示意，不包含关卡地形或 Spine 战斗动画。

玩家新增实时字段为 `shopDetail/effectsDetail/bondsDetail/nextEnemiesDetail/personalChoice`。接口只选择所需玩家视图字段，不输出重连凭证。原数据存在但接口不兼容时显示缺失，不伪造数据。

图片从游戏现有 `/assets/...` 获取，经本机监视台代理，既不复制到安装包也不加载第三方链接。代理只允许本机游戏端口的 PNG/WebP/JPEG 路径，限制单图 2 MiB，内存缓存合计最多 16 MiB / 128 张。浏览器缓存头像一天，减少重复下载。若游戏缺少素材，则仍保留名字、站位和数值。更新素材后可清浏览器缓存并重启监视台。

## 游戏流量与穿透流量的边界

`gameTraffic` 记录游戏 HTTP/WebSocket TCP socket 的 `bytesRead/bytesWritten`，含服务玩家的网页、资源和 WebSocket 开销。累计起点为游戏进程启动，重启清零；速率每秒采样。排除带监视台标记的本机健康检查及图片代理请求，3001 管理接口和 3010 页面流量不属于游戏端口统计。

运行诊断通过 Windows TCP 连接的本机对端端口和地址匹配 `frpc/SakuraFrpService`，为已匹配连接汇总“已识别 SakuraFRP 连接”流量。系统诊断每 10 秒更新，短连接可能在采样前消失，因此无法保证识别所有穿透下载；未识别部分始终计入游戏总量与“其他/未识别”。地址 `100.64.0.0/10` 标记为 Tailscale 候选，此地址段也可由其他网络使用，并不是 Tailscale 身份证明。历史最近连接最多保存 1000 条，超出部分仍留在游戏总累计，来源回归未识别。

这些数值不包含 TCP/IP、隧道加密封装、重传及平台计费规则，**不能替代 SakuraFRP 账户计费或剩余流量**。整机网卡流量单独保留，包含其他应用。v1.2 已额外接入官方账户 API，见本文前面的可用流量说明；本节的游戏 TCP 字节与官方账户额度仍是不同统计。

兼容性已验证：本机原版 v0.2.4 与 20 人版 v0.2.3 的实际 `Match.endPrep`、玩家视图及阵容字段。旧 boot 仍可显示已有基础/对局指标，但没有新增阵容和游戏流量。其他分支可能改变 `MatchClass/startCombat/startFinalAssault/privateView`，需要另行验证；不保证所有历史与未来版本。

## 启动与停止

1. 解压到可写目录，双击 **启动监视台.cmd**。程序在后台运行并自动打开浏览器。
2. 在左下角“监控设置”填写游戏端口、管理端口及服主昵称。
3. 双击 **停止监视台.cmd** 停止监视台。关闭浏览器不会停止后台监控。

需要 Node.js 22+。启动器依次查找本程序 `node\node.exe`、`D:\nodejs\node.exe`、当前 20 人整合包内的 Node，最后查找系统 PATH。可复制便携版 Node 到 `node` 子目录实现无需系统安装的启动；本压缩包不重复包含 Node 二进制。

界面地址：<http://127.0.0.1:3010>。独立运行指监视台无需启动原 PowerShell Monitor v8，也不依赖游戏进程存活；有实时游戏数据仍需游戏服运行。

手动启动：

```powershell
node .\server.mjs
# 改变 UI 端口：
.\Start.ps1 -UiPort 3012
```

## 界面功能

- 实时总览：服务器状态、识别后的在线玩家、房间、对局、运行时长、内存、连接趋势、大厅玩家、最近事件。
- 房间与对局：搜索、只看对局中；房间/本局时长；回合、阶段、阶段剩余、暂停、关卡、战场、进度、Boss HP、团队 LP、生存与经济汇总。
- 玩家：服主/房主、PlayerId、在线/离线、存活/淘汰回合、资金与待入账、LP 与预计损失、调度等级、商店、部署、手牌、临时区、托管、策略、本回合花费、完整累计战绩与上次作战。
- 在线玩家：按大厅/房间筛选，显示连入时间和本次在线时长，观战玩家在房间详情单独展示。
- 事件：服务器、房间、对局、连接、换房、回合、阶段、LP、淘汰、调度等级变化。首次采样建立基线，避免把已有用户全部记录为新连接。
- 运行诊断：Windows 监听进程、CPU、内存、TCP 状态、网卡速率、SakuraFRP/Tailscale 进程、接口新鲜度和版本信息。
- 导出快照：保存当前 JSON，包含接口时间、旧数据标记、诊断和最近事件。

## 现有接口与 boot v5 升级

2026-10-12 早期核实：游戏运行 `D:\Stronghold-Protocol\Stronghold-Protocol-origin\server\index.js`，4 人版 v0.2.4，当时两个游戏目录中的 boot.js 为旧版。后续本次 UI 验证时，实际运行的接口已提供 `matchDetail` 与 `connectedAt`，并成功显示进行中对局的 R9–R11、LP、经济、战场进度和累计战绩。因此当前实测接口已具备完整监控字段。文件下载和实际生效应分开核对，其他游戏目录仍需单独确认。

随包 `compat\boot-universal-v5.js` 为用户已有文件的原样副本。v5 安装器保留供旧环境使用；当前推荐前述 v6 安装器，已安装目录见前文。升级命令会先备份目标，然后替换；请在方便重启游戏的时段使用：

```powershell
# 原版游戏根目录
powershell -NoProfile -ExecutionPolicy Bypass -File .\Install-Boot-v5.ps1 -GameRoot "D:\Stronghold-Protocol\Stronghold-Protocol-origin"

# 20 人整合包的游戏根目录是 app
powershell -NoProfile -ExecutionPolicy Bypass -File .\Install-Boot-v5.ps1 -GameRoot "D:\Stronghold-Protocol\Stronghold-Protocol-20p.4\app"
```

安装后手动重启对应游戏服，检查：

```powershell
$s = Invoke-RestMethod http://127.0.0.1:3001/admin/status.json
$s.roomsDetail | Select-Object code, matchDetail
```

旧 v5 没有版本标记时，无法仅凭空数组确认接口版本；v6 可检查 monitorVersion。实际开一局后，应出现 `roomsDetail[].matchDetail`，其中包含 `players`、`fields`、`phase`、`round`、`economy`、`bossHp` 等。更换 UI 程序本身无需重启游戏服。

## 状态判断与技术边界

健康检查 `ok=true` 为 ONLINE。失败后 TCP 能连为 HUNG，被拒绝为 DOWN，探测超时为 UNKNOWN。该判断表示响应状态，不自动证明故障原因。已知 Windows CMD QuickEdit 选择模式可造成游戏假死：若标题显示“选择”，按 Esc，再关闭控制台属性中的快速编辑模式。

健康接口成功后才查询 Admin；HUNG/DOWN 每次采样完成后至少等 5 秒再探测。请求超时默认 2 秒，历史图在失败处断开；管理数据保留最后快照，并显示准确采样时间与旧数据提示。独立监控每 10 秒查询 Windows 系统诊断，可能比游戏字段更晚更新。

战场 `resolved / total` 表示敌人已处理进度，`killed` 单独显示。客户端战斗使用 `b.progress` 上报，进度可能落后浏览器画面。LP、资金、回合等读取服务器当前状态；“服务器保存”不代表战斗上报防作弊。

服主识别：设置了 PlayerId 时严格按 PlayerId 匹配，否则按昵称忽略大小写匹配。房主来自 `room.hostId` / `players[].host`。昵称标记不授予管理权限，重名可能产生错误标记。

未知字段显示“—”；旧 boot 缺失 `connectedAt` 时，不把首次观察时间伪装成真实在线时长。Boss 或暂停等字段仅在对应阶段存在。网卡流量包含整台机器其他程序，Sakura/Tailscale 进程存在不代表外网访问成功。

管理和 UI 都保持本机绑定，未添加公网入口或隧道。设置写接口校验 Host 与 Origin。所有昵称/事件文本经 HTML 转义。该服务设计为本机工具，不应直接映射到公网。

## 日志与设置

所有文件位于程序旁 `data/`；无需复用或覆盖原 Monitor v8 日志。

| 文件 | 内容 |
| --- | --- |
| settings.json | 端口、采样间隔、服主配置 |
| stronghold-monitor.csv | ISO 时间、状态、连接数、房间数、对局数；健康检查失败时统计留空 |
| stronghold-monitor-events.log | JSON Lines 格式的服务器/房间/在线事件 |
| stronghold-game-events.log | JSON Lines 格式的回合/阶段/LP/淘汰/调度事件 |
| stronghold-monitor-faults.log | 最多每 30 秒的故障与系统诊断快照 |
| ui-stdout.log / ui-stderr.log | 启动器保存的程序输出与错误 |
| monitor.pid | 停止脚本使用的进程标识，并核对命令行 |

界面仅保留本次运行的最近 300 个事件和 180 个趋势点；完整历史保存在磁盘。日志目前持续追加，没有自动轮转；长期开服建议定期归档。原 PowerShell Monitor 配置不会自动导入，可在 UI 重新设置一次服主信息。

## 后续开发

建议优先增加日志轮转、详情字段的新鲜度、接口 schema/version 标记，再考虑通知或更多历史图表。不要把自动重启游戏列为默认恢复策略，以免中断玩家对局。早期版本只读；当前版本另有显式服主管理操作。

## 验证记录

v1.0 历史验证：已通过 Node 语法检查、PowerShell 脚本解析、实际后台启动/停止/再次启动，以及 12 项隔离集成检查：ONLINE 和完整对局字段、Host 校验、设置来源校验、非法端口拒绝、设置持久化、LP/淘汰/阶段事件、Admin 失败保留旧快照、HUNG、快照导出、DOWN、恢复 ONLINE、CSV 旧数据留空。

真实浏览器检查了总览、房间详情与展开战绩、在线玩家、设置窗口和诊断页；页面未产生控制台错误。真实对局确认了经济、LP、调度等级、回合与战场进度；Boss 数据由隔离测试验证。v1.0 当时后台进程已连接服务器；本次 v1.1 安装时游戏已停止，3010 监视台继续等待恢复。压缩包只含程序与说明，不包含本次监控的玩家数据、日志或个人设置。


### v1.1 验证

4 项 boot v6 测试通过：普通/ Boss 边界只保存一次，快照不随后续棋盘变化；玩家视图不兼容不阻断原方法；TCP 字节与本机监视请求排除；原版和 20 人版实际 Match.endPrep 的最终阵容、头像、坐标和朝向。另有 13 项 UI 服务回归检查（含图片路径穿越拒绝），以及真实游戏 HTTP 健康接口、56,617 字节头像、v6 能力识别、图片代理缓存、本机代理流量排除和外部链接拒绝的隔离验证。

浏览器检查了阵容网格、头像加载、方向、表格和新增流量诊断区。界面样例截图使用明确标注的演示数据；生产游戏没有自动启动。


### v1.2 验证

新增 7 项配额测试通过：白名单输出与密钥过滤、零流量与不兼容字段、每分钟限频、流量包查询部分失败、接口失败保留旧数据、账户密钥变更清除旧账户配额、无密钥与禁用状态不发送请求。真实官方 API 已返回今日消耗和总剩余，运行中的 3010 页面已显示；页面无控制台错误。运行中的 /api/status 和 /api/export 均检查不包含启动器访问密钥。


## 20 人横向对照表（v1.3）

房间内的玩家指标改为同一张横向表：每列一个玩家，每行一个指标。无需逐个展开数值详情。支持按实际人数显示，20 人不分页；按零起始席位每 4 人显示一组，A=Seat 0–3，B=4–7，C=8–11，D=12–15，E=16–19。显示分组不代表游戏里的战场配对或真实队伍，也不修改游戏状态。颜色区分组，支持全部玩家或单组筛选。

常用指标默认显示连接、生存、LP、当前资金、待入账、调度、部署和托管；可切换商店与部署、本回合、累计经济、累计战绩、策略与状态、上次作战，或显示全部指标。昵称保留服主/房主标记，显示席位和 PlayerId。阵容、头像、商品与效果移至每位玩家独立可展开的明细。

指标列和两层表头固定，窄屏可在表格内横向滚动，全部指标可在表格内纵向滚动。自动刷新保留筛选、展开状态和表格滚动位置；切换指标回到表格顶部，切换组回到左侧。仅修改静态界面，刷新浏览器即可生效，无需重启游戏或监视台；仍使用 boot v6 和官方流量查询。

已在真实浏览器使用明确标注的 20 人演示数据验证 20 列、A–E 五组、组筛选、战绩切换、表头/指标固定、刷新后的横向与纵向滚动位置保持，页面无控制台错误。

另外已连接当前运行中的 20 人版 v0.2.3，核对真实房间的 20 个玩家列、A–E 五组和实时商店/部署值；未修改或重启游戏进程。


## v1.4：详情滚动修复与本地交付

修复每次自动刷新时阵容、商品与效果详情短暂收起，造成页面高度缩小并跳回表头的问题。新内容先在文档外恢复展开状态，再一起替换；按玩家 ID 保持展开状态，恢复整页与表格滚动位置，并以正在阅读的玩家详情作为位置锚点。真实浏览器在展开阵容后多次自动刷新，scrollY 持续为 1843，详情顶部位置 -357.375 不变，页面无错误。

20 人版已安装两个文件：D:\Stronghold-Protocol\Stronghold-Protocol-20p.4\app\server\http\boot.js 和同目录 monitor-v6.js。旧入口备份为 boot.js.backup-20261012-195715-293。没有重启正式游戏；下次启动检查 monitorVersion=6。已通过真实本版临时端口健康/头像/能力测试，以及 4 项 v6 监控测试。

用户要求：此后每次更新 boot 和 ZIP，都同步一份到 D:\Stronghold-Protocol。发布使用 Package-Update.ps1 -Version 1.4，自动生成排除 data 的包并复制版本 ZIP、Stronghold-Monitor-UI-latest.zip、boot.js、boot-universal-v6.js 和 monitor-v6.js 到该目录。版本升级时更改 Version；将来 boot 代数变化时同步修改打包脚本。

## UI 1.5：项目集成

娱乐与无尽房显示模式和控制台标记；无尽回合分母显示∞。游戏项目中的 monitor 文件夹可独立启动。管理员接口继续只监听本机，不向玩家开放。

## v1.6
兼容娱乐规则与藏品状态，玩家明细新增已获得藏品、LP护盾及待选择状态。旧版游戏不显示这些扩展。
