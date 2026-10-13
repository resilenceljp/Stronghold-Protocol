// Owner-approved entertainment content; editable here, never generated game data.
// Each distinct collection entry stacks additively with entries affecting the same attribute.
export const RELICS = [
 {id:'ruler',name:'设计师量尺',tier:1,desc:'干员物理闪避提高10个百分点。',mods:{dodgePhys:0.10}},
 {id:'shield',name:'异铁小圆盾',tier:1,desc:'干员防御提高15%。',mods:{defPct:0.15}},
 {id:'seaweed',name:'凉拌海草',tier:1,desc:'干员攻击速度提高10点。',mods:{aspd:10}},
 {id:'soda',name:'香草沙士汽水',tier:1,desc:'干员技力自然恢复提高0.1点/秒。',mods:{spRecoveryFlat:0.1}},
 {id:'blade',name:'锈蚀刀片',tier:2,desc:'干员物理伤害提高10%。',mods:{physDealtMul:1.10}},
 {id:'ration',name:'教堂救济餐券',tier:2,desc:'干员最大生命提高20%。',mods:{hpPct:0.20}},
 {id:'canned',name:'精选兽肉罐头',tier:2,desc:'干员每秒恢复50点生命。',mods:{hpRegen:50}},
 {id:'amulet',name:'法术杀手',tier:2,desc:'干员法术闪避提高15个百分点。',mods:{dodgeArts:0.15}},
 {id:'ring',name:'至宝指环',tier:3,desc:'从下回合起每回合额外获得1点资金。',income:1},
 {id:'mirror',name:'军团护心镜',tier:3,desc:'干员防御提高25%。',mods:{defPct:0.25}},
 {id:'scope',name:'精密瞄准镜',tier:3,desc:'干员攻击提高25%。',mods:{atkPct:0.25}},
 {id:'core',name:'源石储能芯',tier:4,desc:'干员技力自然恢复提高0.4点/秒。',mods:{spRecoveryFlat:0.4}},
 {id:'armor',name:'堡垒战甲',tier:4,desc:'干员最大生命提高40%。',mods:{hpPct:0.40}},
 {id:'banner',name:'不灭战旗',tier:4,desc:'干员攻击速度提高25点。',mods:{aspd:25}},
 {id:'avenger',name:'复仇者',tier:5,desc:'干员物理伤害提高30%。',mods:{physDealtMul:1.30}},
 {id:'crown',name:'星火王冠',tier:5,desc:'干员攻击提高50%。',mods:{atkPct:0.50}},
 {id:'treasury',name:'同盟金库',tier:5,desc:'从下回合起每回合额外获得3点资金。',income:3},
];
export const RELIC_TIERS=['普通','精良','稀有','史诗','传说'];
export function relicMods(ids) {
 const out={};
 for(const r of RELICS) if(ids.includes(r.id)) for(const [k,v] of Object.entries(r.mods||{})) {
  out[k]=(out[k]??(k.endsWith('Mul')?1:0))+(k.endsWith('Mul')?v-1:v);
 }
 return out;
}
export function relicWeights(round,pity=false) {
 if(pity) return [0,0,70,round>=6?20:0,round>=9?10:0];
 // [ASSUMED] Screenshot fixes R22 at 10/30/35/15/10; interpolate earlier eligible tiers.
 const p=Math.min(1,Math.max(0,(round-1)/21));
 return [70-60*p,30,round>=4?35*p:0,round>=7?15*p:0,round>=7?10*p:0];
}
