import { PHASE,ERR } from '../../../shared/constants.js';
import { DEFAULT_FUN_RULES,validFunRules } from '../../../shared/entertainmentRules.js';
import { DataSource } from '../../sim/simdata.js';
import { configureEntertainment,configureShop7 } from '../entertainment.js';
export class MatchFunRules {
 offerEndless(outcome) {
  if(this.ruleset!=='entertainment'||!outcome.victory)return this.finish(outcome);
  const voters=this.order.filter(p=>!p.isBot&&!p.left).map(p=>p.playerId);
  if(!voters.length)return this.finish(outcome);
  this._endlessOutcome=outcome;this.phase=PHASE.SETTLE;
  this.endlessVote={id:++this._turnToken,voters,agreed:[],expiresAt:this.sched.now()+60000};
  // [ASSUMED] Silence, disconnect without reconnection, or departure never counts as consent.
  this._endlessTimer=this.later(60000,()=>this.resolveEndless(false));this.markPublic();this.flush(true);
 }
 voteEndless(ps,id,agree){
  const vote=this.endlessVote;
  if(!vote||vote.id!==id||!vote.voters.includes(ps.playerId)||!ps.connected||ps.left)return {error:ERR.BAD_TARGET};
  if(!agree){this.resolveEndless(false);return {ok:true};}
  if(!vote.agreed.includes(ps.playerId))vote.agreed.push(ps.playerId);
  if(vote.voters.every(pid=>vote.agreed.includes(pid)))this.resolveEndless(true);
  else {this.markPublic();this.flush(true);}return {ok:true};
 }
 resolveEndless(agree){
  if(!this.endlessVote)return;this.cancel(this._endlessTimer);this._endlessTimer=null;this.endlessVote=null;
  if(!agree)return this.finish(this._endlessOutcome);
  configureEntertainment(this.gd,'endless');configureShop7(this.gd,this.funRules.shopLevel7);this.ruleset='endless';
  this.modeId=this.gd.modeId;this.difficulty=this.gd.difficulty;
  this.funRules={...this.funRules,endlessEnabled:true};this.bossPool=null;this.bossWaves=null;this.teamLp=null;
  this.startRound(Math.max(15,this.round+1));this.markPublic();this.flush(true);
 }
 setFunRules(playerId,patch,revision) {
  if(this.emergencyFrozen) return {error:ERR.SERVER_EMERGENCY};
  if(this.ruleset==='standard'||this.phase!==PHASE.INFO_CHECK||this.setupVote||this.ended||this.disposed) return {error:ERR.WRONG_PHASE};
  const ps=this.players.get(playerId);
  if(!ps||ps.left||ps.isBot||!ps.connected) return {error:ERR.NOT_IN_ROOM};
  if(patch?.training==='max'&&!this.data['full-training']?.chess)return {error:ERR.BAD_TARGET,detail:'full training data unavailable'};
  if(!validFunRules(patch)||revision!==this.setupRevision) return {error:ERR.BAD_MSG};
  const modeChanged=patch.endlessEnabled!==undefined&&patch.endlessEnabled!==this.funRules.endlessEnabled;
  this.funRules={...DEFAULT_FUN_RULES,...this.funRules,...patch};
  configureEntertainment(this.gd,this.funRules.endlessEnabled?'endless':'entertainment');
  configureShop7(this.gd,this.funRules.shopLevel7);this.ruleset=this.gd.ruleset;
  this.modeId=this.gd.modeId;this.difficulty=this.gd.difficulty;
  const full=this.data['full-training'];
  this.gd.raw=this.funRules.training==='max'&&full?{...this.data,...full}:this.data;this.gd._standIns.clear();
  this.gd._chess=this.funRules.training==='max'&&full?.chess?full.chess:this.data.chess;
  this.ds=new DataSource(this.funRules.training==='max'&&full?{...this.data,...full}:this.data,null);
  this.consoleEnabled=this.funRules.consoleEnabled;
  if(modeChanged){for(const p of this.order)p.recompute();return this.completeSetupReroll();}
  this.setupRevision++;
  for(const p of this.order) {p.infoReady=p.botControlled;p.recompute();}
  this.cancel(this._infoAdvanceTimer);this._infoAdvanceTimer=null;
  this.markPublic();this.flush(true);return {ok:true};
 }
}
