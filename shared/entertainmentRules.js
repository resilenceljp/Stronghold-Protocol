import { RELICS } from './relics.js';
export const DEFAULT_FUN_RULES={consoleEnabled:false,endlessEnabled:false,shopLevel7:false,training:'official',deployCap:8,startingFunds:0,relicsEnabled:false,relicIds:RELICS.map(r=>r.id)};
export function validFunRules(v) {
 return !!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>k in DEFAULT_FUN_RULES)
 &&(v.consoleEnabled===undefined||typeof v.consoleEnabled==='boolean')
 &&(v.endlessEnabled===undefined||typeof v.endlessEnabled==='boolean')
 &&(v.shopLevel7===undefined||typeof v.shopLevel7==='boolean')
 &&(v.training===undefined||['official','max'].includes(v.training))
 &&(v.deployCap===undefined||[8,12].includes(v.deployCap))
 &&(v.startingFunds===undefined||(Number.isInteger(v.startingFunds)&&v.startingFunds>=0&&v.startingFunds<=9999))
 &&(v.relicsEnabled===undefined||typeof v.relicsEnabled==='boolean')
 &&(v.relicIds===undefined||(Array.isArray(v.relicIds)&&v.relicIds.length<=RELICS.length&&new Set(v.relicIds).size===v.relicIds.length&&v.relicIds.every(id=>RELICS.some(r=>r.id===id))));
}
