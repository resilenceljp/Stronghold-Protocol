# 0.2.4-20p-fun.2 · 娱乐扩展版

来源：sganggs原始复刻 → LongQianChen feat/IncreasePlayerCapacity 20人核心0.2.4 → resilenceljp扩展修订2。

## 本次新增

- 全真人同意刷新战场；拒绝/掉线取消，只换地图，个人配置和其余开局信息保留。
- 娱乐和无尽22格整备区，两排11格；普通模式保持10格。

## 启动

需要Node.js22或24。解压到新目录，沿用原游戏的public/assets（以及有本地素材时的data/local-assets.json）或按原setup流程获取素材。游戏启动方式同前版；监视台从monitor目录运行启动监视台.cmd，或者根目录npm run monitor，默认仅本机3010端口。

此包不会自动替换运行中的游戏。游戏端口3000与监视台3010是两个服务。

## 同步

GitHub Actions「同步原版20p到独立分支」支持手动及每日检查，上游源码保存到upstream/20p及带版本/SHA的快照分支。原样同步不会覆盖娱乐代码，审查合并后再更新基础版本。包内UPSTREAM.json记录真实基线，Git源码目录可使用npm run sync:upstream；精简ZIP本身不包含.git，不能直接在其内执行Git维护操作。

## 已知边界




fun.3 布局、七级普通商店槽与手机精简素材说明见[手机与布局更新](FUN_MOBILE.md)。
