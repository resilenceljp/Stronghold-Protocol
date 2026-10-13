import { PHASE,ERR } from '../../../shared/constants.js';
import { DEFAULT_FUN_RULES,validFunRules } from '../../../shared/entertainmentRules.js';
export class MatchFunRules {
 setFunRules(playerId,patch,revision) {
  if(this.emergencyFrozen) return {error:ERR.SERVER_EMERGENCY};
  if(this.ruleset==='standard'||this.phase!==PHASE.INFO_CHECK||this.setupVote||this.ended||this.disposed) return {error:ERR.WRONG_PHASE};
  const ps=this.players.get(playerId);
  if(!ps||ps.left||ps.isBot||!ps.connected) return {error:ERR.NOT_IN_ROOM};
  if(!validFunRules(patch)||revision!==this.setupRevision) return {error:ERR.BAD_MSG};
  this.funRules={...DEFAULT_FUN_RULES,...this.funRules,...patch};
  this.consoleEnabled=this.funRules.consoleEnabled; this.setupRevision++;
  for(const p of this.order) {p.infoReady=p.botControlled;p.recompute();}
  this.cancel(this._infoAdvanceTimer);this._infoAdvanceTimer=null;
  this.markPublic();this.flush(true);return {ok:true};
 }
}
