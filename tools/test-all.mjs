// Run the same tests without scheduling wall-clock benchmarks beside thousands of CPU-heavy cases.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
const testFiles = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? testFiles(join(dir, e.name)) : e.name.endsWith('.test.js') ? [join(dir, e.name)] : []);
import { spawnSync } from 'node:child_process';
const timing='^(benchmark:|performance:|84 (mixed|compact) sockets|match result replay|real-time co-op over websockets)';
const suites=[['--test','work/fun5.test.mjs','work/fun6.test.mjs','work/fun7.test.mjs','work/fun9-monitor.test.mjs','work/fun10.test.mjs','work/fun11.test.mjs','work/fun12.test.mjs','work/trafficLedger.test.mjs'],['--test',`--test-skip-pattern=${timing}`, ...testFiles('test')],['--test','--test-concurrency=1','--test-name-pattern=^real-time co-op over websockets','test/match/realtime.test.js'],['--test','--test-concurrency=1','--test-name-pattern=^match result replay','test/lobby.test.js'],['--test','--test-concurrency=1','--test-name-pattern=^(benchmark:|performance:)','test/sim/perf.test.js','test/sim/robustness.test.js'],['--test','test/wire-pressure.test.js']];
for(const args of suites){const result=spawnSync(process.execPath,args,{stdio:'inherit',env:process.env});if(result.status!==0){process.exitCode=result.status||1;break;}}
