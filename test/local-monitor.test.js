import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import http from 'node:http';
import {startServer} from '../server/index.js';

async function freePort(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
test('optional monitor is read-only, loopback-bound, and closes with the game',async()=>{
 const port=await freePort();const srv=await startServer({port:0,host:'127.0.0.1',quiet:true,localMonitor:true,adminPort:port});
 try{const url=`http://127.0.0.1:${port}/admin/status.json`;
 const r=await fetch(url);assert.equal(r.status,200);const body=await r.json();assert.equal(typeof body.rooms,'number');assert.ok(body.trafficLedger);
 assert.equal((await fetch(url,{method:'POST'})).status,405);
 assert.equal(await new Promise((resolve,reject)=>{http.get(url,{headers:{Host:'external.example'}},r=>{r.resume();resolve(r.statusCode);}).on('error',reject);}),403);
 }finally{await srv.close();}
 await assert.rejects(fetch(`http://127.0.0.1:${port}/admin/status.json`));
});
test('disabled monitor does not bind a port',async()=>{
 const port=await freePort();const srv=await startServer({port:0,quiet:true,localMonitor:false,adminPort:port});
 try{await assert.rejects(fetch(`http://127.0.0.1:${port}/admin/status.json`));}finally{await srv.close();}
});
test('optional monitor port collision does not prevent game startup',async()=>{
 const occupied=net.createServer();await new Promise(r=>occupied.listen(0,'127.0.0.1',r));
 const srv=await startServer({port:0,host:'127.0.0.1',quiet:true,localMonitor:true,adminPort:occupied.address().port});
 try{assert.equal((await fetch(srv.url+'/healthz')).status,200);}finally{await srv.close();await new Promise(r=>occupied.close(r));}
});
