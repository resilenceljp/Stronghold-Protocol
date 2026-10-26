# DEV-20261026-01 · DIY 仓库迁移

用户明确指定将 resilenceljp/Stronghold-Protocol-20p 删除，将当前 DIY 版本更新至 resilenceljp/Stronghold-Protocol。

迁移前已镜像备份两个仓库的所有 Git 引用，并生成 D:/Stronghold-Protocol/backups/github-migration-20261026 中的 bundle。当前 DIY 基线为 daaa9ebe / 0.3.2-20p-fun.15；目标原 master 为 488db49f。

目标仓库保留原有功能分支及 PR 分支，默认 master 合并本分支内容；维护项目链接切换至新地址。验证远端代码一致后才删除旧仓库。未将账号、日志、运行数据、游戏素材或个人设置加入仓库。此次不修改玩法、boot 或UI包，不重启游戏。
