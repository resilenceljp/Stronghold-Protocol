import { html } from './components.js';
import { t } from '../../../shared/i18n.js';
export function ProjectNotice() {
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  return html`<aside class="project-notice" aria-label=${t('项目公告')}>
    <small>SERVER NOTICE / 20P EDITION</small><h2>${t('关于本服务器')}</h2>
    <p>${t('20人合作 · 娱乐控制台 · 无尽模拟 · 藏品')}</p>
    <p>${t('娱乐房的控制台、练度、部署位、起始资金及藏品，在第二页准备界面由房主设置。')}</p>
    <p>${t('无尽模式每回合敌人属性增长10%，最终攻势后继续挑战。')}</p>
    <a href="https://github.com/resilenceljp/Stronghold-Protocol" target="_blank" rel="noopener noreferrer">GitHub · resilenceljp / Stronghold-Protocol ↗</a>
    <p>${t('内置独立监视台：房间、阵容、经济、战绩、连接与穿透流量。服主可从monitor文件夹独立启动。')}</p>
    ${local ? html`<a href="http://127.0.0.1:3010/" target="_blank" rel="noopener noreferrer">${t('打开本机监视台')} ↗</a>` : null}
    <small>${t('非官方同人项目，仅供个人非商业娱乐；游戏素材版权归原权利人所有。')}</small>
  </aside>`;
}
