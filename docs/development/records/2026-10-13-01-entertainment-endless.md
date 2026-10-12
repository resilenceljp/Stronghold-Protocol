# DEV-20261013-01 · 娱乐、无尽与监视台

| 字段 | 内容 |
|---|---|
| 日期 | 2026-10-13，Asia/Macau |
| 状态 | 已完成：实现、定向验证、精简包和功能分支发布；正式服务器未部署 |
| 分支与基线 | feat/entertainment-endless；源HEAD 6a2b72bb97d1469194fd758b3001017a632ce23f |
| 仓库 | resilenceljp/Stronghold-Protocol-20p，独立导入LongQianChen的20人分支 |
| 提交归属 | 完成后与本文同一提交，按记录路径查询 |

用户要求：娱乐模式和建房控制台开关；只在休整期免费获取干员、装备、层数、调度等级；无调用次数限制；娱乐层数9999；截图AC∞模式；启动页非阻挡公告；监视台独立目录。用户选择无尽每回合增长10%。长期边界见 [ENTERTAINMENT.md](../../ENTERTAINMENT.md)。

实现：entertainment.js隔离模式；lobby保存建房配置并传给Match；g.console经服务端本人/房间/阶段/准备/存活检查；房间layerCap覆盖经济、模拟、客户端校验与结算；无尽使用14回合最终攻势，之后循环8–13普通波次，7级额外特殊道具栏；结果不污染原版统计。UI目录可搜索普通/精锐干员和装备，盟约增量输入，调度升级/资金。boot v6和monitor目录仅带程序，无运行配置和日志。

初次回归发现本次添加标准视图字段与wire固定catalog冲突，已改成仅娱乐房扩展字段，g.console采用既有JSON fallback，原v1指纹不改。源仓库旧wire-network测试仍假定5Hz，当前基线已改8Hz（源提交d8e46bd）；check-imports对已有nodeData.js的3个Node导入失败。此处记录，未将旧失败称为通过。

验证：work/entertainment.test.mjs 7/7通过，含实际BattleSpec层数、逐层上限、原版拒绝和最终攻势→R15→R16。定向lint无error（2个已有warning）；严格语言检查初次发现源assetCache既有1条缺项，已补齐。更多结果完成后更新。

浏览器：按旧工作流程尝试Edge，连接失败；使用Codex内置浏览器在独立3020服务器实际建房、进入策略/休整页。未使用正式3000服务器，不中断用户对局。尚未作20真人负载验证，不宣称无限轮数长跑稳定。

## 最终验证补充

- 新增测试保存在 work/entertainment.test.mjs，8/8通过，增加20席位两真人的本人权限隔离、重连权限保留及无尽领袖失败结束。
- 原版layercap/finalAssault/wire-codec 30/30；版本与打包18/18；文档、地图及容量初次65项中64通过，DESIGN新增索引补齐后文档7/7通过。容量套件的20客户端模拟全局完成且无引擎错误。
- 20个物理WebSocket客户端加观战的通信、压缩、重连测试单独复跑1/1通过。最初超时发生在黄金场景计算并行负载中。
- npm run golden:update 重新计算287个场景，Git没有任何golden变化。
- ci定向smoke/lint/typecheck全部通过；lint为0 error，已有warning保留；四语言包严格检查无缺项。新增文案暂用中文fallback，未宣称人工翻译。
- 完整CI未全部重跑：已有wire-network末项仍期待5Hz，而来源现为8Hz；check-imports在未修改的nodeData.js报3个Node导入。
- 内置浏览器真实操作：20席位无尽房建房、策略、休整、搜索普通/精锐干员、直接获取、7级调度、9999层实时同步；关闭按钮、无尽标识与监视台3024识别正常。Edge连接不可用，未作20真人实战或无限回合长跑压测。
- 独立版本0.2.5，原版内容基线仍为上游0.2.4；更新package/lock/APP_VERSION/README/CHANGELOG，版本测试通过。监视台UI1.5已通过Package-Update.ps1打包并复制boot/helper、版本ZIP及latest ZIP到D:\Stronghold-Protocol。

## 发布结果

- GitHub功能分支：feat/entertainment-endless；实现提交5fffcd8e59ebc388125f6025658cf750d9c3b602，树6623defa4f142c090dd9d508356d0f842a3b55af，与本地实现提交9f043bd1的文件树完全一致。原feat/IncreasePlayerCapacity分支保持原样。
- Git命令行push等待未返回，已中止，改用已连接GitHub接口创建树、提交与分支；没有读取或保存新令牌。
- 正式生产精简包Stronghold-Protocol-v0.2.5-lite.zip已生成，约25.7MB，包含生产依赖、启动脚本、monitor和MANIFEST；首次启动仍需素材下载/沿用本机素材。
- 游戏ZIP SHA256：426F99030A95AB2C822CEEEE6F680AE6439E3A3AFF5229052055F84A85E27B2A；程序、helper和控制台文件存在，ZIP无monitor/data、runtime、日志或私人设置。
- 游戏版本ZIP及latest ZIP、监视台UI1.5 ZIP和latest ZIP、boot/helper全部已复制到D:\Stronghold-Protocol，逐文件哈希一致。
- 打包第一次账号名检查误报RequireAdministrator和英文administrators，均为公开代码词汇；使用工具的SP_PACKAGE_SCAN_USER=0排除通用Windows账号名，私人home路径扫描继续执行且通过。
- 测试游戏3020/3022与监视台3024在验证后关闭，正式3000/3010未停止。
