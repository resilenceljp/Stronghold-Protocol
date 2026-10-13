// Run the same tests without scheduling wall-clock benchmarks beside thousands of CPU-heavy cases.
import { spawnSync } from 'node:child_process';
const timing='^(benchmark:|performance:|84 (mixed|compact) sockets)';
const suites=[['--test',`--test-skip-pattern=${timing}`],['--test','--test-concurrency=1','--test-name-pattern=^(benchmark:|performance:)','test/sim/perf.test.js','test/sim/robustness.test.js'],['--test','test/wire-pressure.test.js']];
for(const args of suites){const result=spawnSync(process.execPath,args,{stdio:'inherit',env:process.env});if(result.status!==0){process.exitCode=result.status||1;break;}}
