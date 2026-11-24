import { html } from './components.js';
import { t } from '../../../shared/i18n.js';
export function ProjectNotice() {
  return html`<aside class="project-notice" aria-label=${t('项目公告')}>
    <small>SERVER NOTICE / 20P EDITION</small><h2>${t('关于本服务器')}</h2>
    <p>${t('20人同盟模拟')}</p>
    <p>${t('房主可在开局简报设置部署位、七级商店和扩展整备区。')}</p>
    <p>${t('娱乐对局获胜后可投票继续无尽挑战。')}</p>
    <a href="https://github.com/resilenceljp/Stronghold-Protocol" target="_blank" rel="noopener noreferrer">GitHub · resilenceljp / Stronghold-Protocol ↗</a>
    <p>${t('内置独立监视台：房间、阵容、经济、战绩、连接与穿透流量。服主可从monitor文件夹独立启动。')}</p>
    <small>${t('非官方同人项目，仅供个人非商业娱乐；游戏素材版权归原权利人所有。')}</small>
  </aside>`;
}
