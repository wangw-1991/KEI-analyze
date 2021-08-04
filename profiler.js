const si = require('systeminformation');
const path = require('path');
const {getTimeStamp, InfoMessage} = require('./utils.js');
const {delaySecond} = require('./delay.js');
const util = require('util');
const { spawn } = require('child_process');
const exec = util.promisify(require('child_process').exec);
const execSync = util.promisify(require('child_process').execSync);

let globalPage = null;

async function stopSEP(env) {
  if(env.configs.profilerTool === "SEP") {
    try{
      InfoMessage(env, 'stopSEP');
      execSync('sep -stop', {maxBuffer: 1024 * 1024 * 10});
    } catch (e) {
      InfoMessage(env, `Exception in stopSEP: ${e}`);
    }
  }
}

async function startSEP(env, fileName = "SEP_Result") {
  // This will sample the whole system
  // TODO: if we want the profiler to sample only the browser, use sep -app <path/to/chrome>
  if(env.configs.profilerTool === "SEP") {
    InfoMessage(env, 'startSEP');
    const cpu = await si.cpu();
    try {
      InfoMessage(env, `..Start SEP for ${cpu.vendor}`);
      let command = '';
      const filePath = path.resolve(env.profileResultDir, `${fileName}_${getTimeStamp()}`);
      if (cpu.vendor.indexOf('Intel') != -1) {
        command = `sep -start -d 0 -sam 0.1 -start-paused -ec "INST_RETIRED.ANY,CPU_CLK_UNHALTED.THREAD,BR_INST_RETIRED.ALL_BRANCHES,BR_MISP_RETIRED.ALL_BRANCHES,ITLB_MISSES.STLB_HIT,ITLB_MISSES.WALK_COMPLETED,ITLB_MISSES.WALK_COMPLETED_4K,ITLB_MISSES.WALK_COMPLETED_2M_4M,ITLB_MISSES.WALK_COMPLETED_1G,L2_RQSTS.ALL_CODE_RD,DTLB_STORE_MISSES.STLB_HIT,DTLB_LOAD_MISSES.STLB_HIT,DTLB_LOAD_MISSES.WALK_COMPLETED,DTLB_STORE_MISSES.WALK_COMPLETED,DTLB_LOAD_MISSES.WALK_COMPLETED_4K,DTLB_STORE_MISSES.WALK_COMPLETED_4K,DTLB_LOAD_MISSES.WALK_COMPLETED_2M_4M,DTLB_STORE_MISSES.WALK_COMPLETED_2M_4M,DTLB_LOAD_MISSES.WALK_COMPLETED_1G,DTLB_STORE_MISSES.WALK_COMPLETED_1G,L1D.REPLACEMENT" -nb -out ${filePath}`;
      } else if (cpu.vendor.indexOf('AMD') != -1) {
        command = `sep -start -d 0 -sam 0.1 -start-paused -ec "INST_RETIRED.ANY,CPU_CLK_UNHALTED.THREAD,Branches.Retired,Branches.Mispred,BpL1ITLBMissL2ITLBHit,BpL1ITLBMissL2ITLBMiss,BpL1ITLBMissL2ITLBMiss.4K,BpL1ITLBMissL2ITLBMiss.2M,BpL1ITLBMissL2ITLBMiss.1G,IcCacheFillL2,IcCacheFillSystem,L2DtlbHit.4K,L2DtlbHit.2M,L2DtlbHit.1G,L2DtlbMiss.4K,L2DtlbMiss.2M,L2DtlbMiss.1G,L2ReqG1.RdBlkL" -nb -out ${filePath}`;
      }
  
      if (command !== '') {
        InfoMessage(env, `Starting SEP: ${command}`);
        exec(command);
        await delaySecond(env, 2);
      }
    } catch (e) {
      InfoMessage(env, `Exception in startSEP: ${e}`);
    }
  }
}

async function pauseSEP(env) {
  if(env.configs.profilerTool === "SEP") {
    InfoMessage(env, 'pauseSEP');
    try {
      execSync('sep -pause', {maxBuffer: 1024 * 1024 * 10, stdio: 'inherit'});
    } catch (e) {
      InfoMessage(env, `Exception found in pauseSEP: ${e}`);
    }
  }
}

async function resumeSEP(env) {
  if(env.configs.profilerTool === "SEP") {
    InfoMessage(env, 'resumeSEP');
    try {
      execSync('sep -resume', {maxBuffer: 1024 * 1024 * 10, stdio: 'inherit'});
    } catch (e) {
      InfoMessage(env, `Exception found in resumeSEP: ${e}`);
    }
  }
}

async function startETL(env) {
  if(env.configs.profilerTool === "ETL") {
    InfoMessage(env, 'startETL');
    try {
      execSync('wpr -start GeneralProfile -start CPU -start GPU -start Network');
    } catch (e) {
      InfoMessage(env, `Exception found in startETL: ${e}`);
    }
  }
}

async function stopETL(env, fileName) {
  if(env.configs.profilerTool === "ETL") {
    InfoMessage(env, 'stopETL');
    const filePath = path.resolve(env.profileResultDir, `${fileName}__${getTimeStamp()}`);
    try {
      execSync(`wpr -stop "${filePath}.etl"`);
    } catch (e) {
      InfoMessage(env, `Exception found in stopETL: ${e}`);
    }
  }
}

async function startVTUNE(env, pid, resultDir="vtunedata") {
  if(env.configs.profilerTool === "VTUNE") {
    InfoMessage(env, 'startVTUNE');
    try {
      let vt = spawn('vtune', ['-collect', 'uarch-exploration', '-finalization-mode=none', '-knob sampling-interval=0.1', '-start-paused', `-result-dir=${resultDir}`,'-data-limit=100000', '-target-pid', `${pid}`]);
      vt.stdout.on('data', (data) => {
        console.log(`vtune child process stdout: ${data}`);
      });
      vt.stderr.on('data', (data) => {
        console.error(`vtune child process stderr: ${data}`);
      });
      vt.on('close', (code) => {
        console.log(`vtune child process exited with code ${code}`);
      });
      await delaySecond(env, 2);
    } catch (e) {
      InfoMessage(env, `Exception found in startVTUNE: ${e}`);
    }
  }
}

async function stopVTUNE(env, resultDir="vtunedata") {
  if(env.configs.profilerTool === "VTUNE") {
    InfoMessage(env, 'stopVTUNE');
    try {
      execSync(`vtune -command stop -r ${resultDir}`, {maxBuffer: 1024 * 1024 * 10});
    } catch (e) {
      InfoMessage(env, `Exception found in stopVTUNE: ${e}`);
    }
  }
}

async function resumeVTUNE(env, resultDir="vtunedata") {
  if(env.configs.profilerTool === "VTUNE") {
    InfoMessage(env, 'resumeVTUNE');
    try {
      execSync(`vtune -command resume -r ${resultDir}`, {maxBuffer: 1024 * 1024 * 10, stdio: 'inherit'});
    } catch (e) {
      InfoMessage(env, `Exception found in resumeVTUNE: ${e}`);
    }
  }
}

async function pauseVTUNE(env, resultDir="vtunedata") {
  if(env.configs.profilerTool === "VTUNE") {
    InfoMessage(env, 'pauseVTUNE');
    try {
      execSync(`vtune -command pause -r ${resultDir}`, {maxBuffer: 1024 * 1024 * 10, stdio: 'inherit'});
    } catch (e) {
      InfoMessage(env, `Exception found in pauseVTUNE: ${e}`);
    }
  }
}

async function startProfile(env, name) {
  if (env.configs.profilerTool === "SEP") {
    await resumeSEP(env);
  } else if(env.configs.profilerTool === "ETL") {
    await startETL(env);
  } else if(env.configs.profilerTool === "VTUNE") {
    await resumeVTUNE(env);
  } else if(env.configs.profilerTool === "TRACE") {
    if(name === "Launch-Browser") {
      return;
    }
    InfoMessage(env, `Please open chrome tracing manually.`);
    await delaySecond(env, 60);  // Need to open chrome tracing manually
    InfoMessage(env, `Start tracing manually now.`);
    await delaySecond(env, 5);  // Need to open chrome tracing manually
    globalPage = env.runtime.page;
    await globalPage.evaluate(() => { console.time("scoreRange"); });
  } else {}
}

async function stopProfile(env, name) {
  if (env.configs.profilerTool === "SEP") {
    await pauseSEP(env);
  } else if(env.configs.profilerTool === "ETL") {
    await stopETL(env, name);
  } else if(env.configs.profilerTool === "VTUNE") {
    await pauseVTUNE(env);
  } else if(env.configs.profilerTool === "TRACE") {
    if(name === "Launch-Browser") {
      return;
    }
    await globalPage.evaluate(() => { console.timeEnd("scoreRange"); });
    InfoMessage(env, `Please stop and save chrome tracing manually.`);
    await delaySecond(env, 60);  // Need to close chrome tracing manually
  } else {}
}

module.exports = {
  startSEP: startSEP,
  stopSEP: stopSEP,

  startVTUNE: startVTUNE,
  stopVTUNE: stopVTUNE,
  
  startProfile: startProfile,
  stopProfile: stopProfile,
};

