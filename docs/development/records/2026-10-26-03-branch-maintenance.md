# DEV-20261026-03 · 分支整理与控制台固定回归

## 范围与基线

用户同意将分支整理为 master（稳定）、develop（集成）、upstream/original（纯原版正式版镜像），维护临时 merge 分支并减少控制台同步成本。开始基线 10c2e402 / 0.3.3-20p-fun.16。此次不修改玩法、boot或监控UI，不重启运行服务器。

## 变动

- 创建 develop；upstream/original 从旧0.2.5引用快进至已合并的0.3.3 f07b8965。原版工作流每日只镜像并写标签快照，不自动合并或部署。
- 20p原来源保留手动镜像入口，取消日常定时；脚本与工作流均将快照保存为 source-20p 标签。原版使用 source-original 标签，避免为每次同步生成永久分支。
- DIY常规CI仅在维护/功能分支运行，镜像和备份引用更新不再触发整套DIY CI。新增 Windows/Ubuntu Node22 的 DIY compatibility 工作流。
- 从未入CI的本地临时测试整理 test/fork，新增控制台授予、血量/资金/等级、七级商店、扩展整备区、藏品与无尽同意检查；加入管理员牌库/压力/AI操作、接替重连、清除房间、流量归属与持久历史回归。测试不依赖美术、私人配置或运行中服务器。
- 对原版接入边界做文档审计：monitorBoot、room-control、traffic-ledger、entertainment/funRules 已拆分，但仍需核心接口，不能宣称已成为可随意外挂的原版插件。保留身份与本机权限边界。

## 验证与归档

固定检查 `npm run check:fork` 初次完成68项全部通过，CI分片与运行器守卫28项通过。文档/CI守卫60项通过；新增测试和同步脚本lint通过。归档标签 archive/feat/entertainment-endless 和 archive/backup/fun15-before-original033 保存原引用；固定镜像补上 source-original/v0.3.3-f07b8965 快照标签。遗留上游PR分支保留。只将已镜像/可用标签恢复的旧重复分支归档，不重写PR分支。
