import test from 'node:test';import assert from 'node:assert/strict';
import {SeatCard,roomFacts,normalizeSeats} from '../public/js/screens/room.js';
for(const capacity of [4,8,10,16,20])for(const count of [0,1])test(`room capacity ${capacity}, occupied ${count}: empty seat render does not reference group before initialization`,()=>{
 const room={mode:'coop',capacity,hostId:'host',seats:count?[{seat:0,playerId:'host',name:'Host',connected:true}]:[]};const facts=roomFacts(room,'host');
 for(const [index,seat] of normalizeSeats(room).entries())assert.doesNotThrow(()=>SeatCard({seat,index,room,facts,myId:'host',busy:null}));
});
