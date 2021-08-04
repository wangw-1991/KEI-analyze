const program = require('commander');
const chromePaths = require('chrome-paths');
const path = require('path');
const util = require('util');
const fs = require('fs');
const readFile = util.promisify(fs.readFile);
const os = require('os');
const {startSEP, stopSEP, startVTUNE, stopVTUNE} = require('./profiler.js');
const {saveResult} = require('./utils.js');
const {Workflow} = require('./workflow.js');
const {getTimeStamp, InfoMessage, getProjRoot} = require('./utils.js');
const { delaySecond } = require('./delay.js');

program
  .version('1.0')
  .usage('[options] test-case-1 test-case-2 ...')
  .option('-o, --output-file [file]', 'specify a file to output, default to "test-result-*.json"')
  .option('-d, --output-dir [dir]', 'specify a dir to output, default to "output"')
  .parse(process.argv);

const options = program.opts();
if (!options.outputDir) {
  options.outputDir = path.resolve(__dirname, "output");
}
makeSureOutputExist(options.outputDir);
options.outputFile = path.resolve(options.outputDir, options.outputFile || `test-result_${getTimeStamp()}.json`);

// make sure outputDir folder exist.
function makeSureOutputExist(outputDir) {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
    fs.closeSync(fs.openSync(path.resolve(outputDir, ".keep"), 'w'));
  }
  if (!fs.lstatSync(outputDir).isDirectory()) {
    InfoMessage(env, '');
    InfoMessage(env, `Error: please make sure the output folder ${outputDir} exist.`);
    InfoMessage(env, '');
    process.exit();
  }
}

async function readConfigs(env) {
  let configs = {};
  try {
    const filePath = path.resolve(getProjRoot(), 'config.json');
    const bytes = await readFile(filePath);
    configs = JSON.parse(bytes);
  } catch (e) {
    // Skip
  }

  if (configs["use-proxy"]) {
    env.configs.proxy = configs.proxy;
  }

  if (configs["checkup-delay"]) {
    env.configs.defaultCheckupDelay = configs["checkup-delay"];
  }

  if (configs["profilerTool"]) {
    env.configs.profilerTool = configs["profilerTool"];
  }

  if (configs["user-data-dir"]) {
    env.runtime.platform.userDataDir = configs["user-data-dir"];
  }

  if (configs["profile"]) {
    env.runtime.platform.profile = configs["profile"];
  }

  if (configs["chrome-path"]) {
    env.runtime.platform.chromePath = configs["chrome-path"];
  }
}

async function setupEnv(env) {
  if (!env.runtime.platform.chromePath) {
    env.runtime.platform.chromePath = chromePaths.chrome;
  }

  if (!env.runtime.platform.userDataDir) {
    env.runtime.platform.userDataDir = getDefaultUserDataDir();
  }

  if (!env.runtime.platform.profile) {
    env.runtime.platform.profile = "Default";
  }

  env.screenshotDir = path.resolve(env.outputDir, "screenshot");
  if (!fs.existsSync(env.screenshotDir)) {
    fs.mkdirSync(env.screenshotDir);
  }

  if(env.configs.profilerTool !== "none") {
    env.profileResultDir = path.resolve(env.outputDir, "profileResult");
    if (!fs.existsSync(env.profileResultDir)) {
      fs.mkdirSync(env.profileResultDir);
    }
  }
}

function getDefaultUserDataDir() {
  return process.platform === 'darwin'
      ? `/Users/${os.userInfo().username}/Library/Application\ Support/Google/Chrome/`
      : `C:\\Users\\${os.userInfo().username}\\AppData\\Local\\Google\\Chrome\\User Data`;
}

let env = {
  outputDir: options.outputDir,
  configs: {
    defaultTimeout: 60 * 1000,
    defaultCheckupDelay: 30,
    testSources: {},
    profilerTool: 'none',
    iterationAccount: 1,
  },

  timings: {
    page_start: 0,
    page_end: 0,
  },

  states: {
    url: "",
    connected: false,
    iteration: 0,
    metrics: "",
  },

  runtime: {
    browser: null,
    page: null,
    pageFrameIndex: null,
    platform: {
      shortcutModifierKey: process.platform === 'darwin' ? 'Meta' : 'Control',
      chromePath: null,
      userDataDir: null,
      profile: null,
    },
  },

  measurements: {
    measuring: {},
    results: {},
  },
};

const default_workflow= [
  Workflow.startBrowser,
  Workflow.openPage,
  Workflow.operatePage,
  Workflow.closeBrowser,
];

async function run() {
  // Configure
  await readConfigs(env);
  await setupEnv(env);

  // Start SEP/VTUNE
  if(env.configs.profilerTool === "SEP") {
    await startSEP(env);
  } else if (env.configs.profilerTool === "VTUNE") {
    await startVTUNE(env, process.pid);
  } else {
    // do nothing.
  }

  for (let i = 1; i <= env.configs.iterationAccount; i++) {
    // Start Workflow
    for (let func of default_workflow) {
      await func(env);
    }
    if(i !== env.configs.iterationAccount) {
      await delaySecond(env, 20);
    }
  }

   // Stop SEP/VTUNE
   if(env.configs.profilerTool === "SEP") {
    await stopSEP(env);
  } else if (env.configs.profilerTool === "VTUNE") {
    await stopVTUNE(env);
  } else {
    // do nothing.
  }

  await saveResult(env, options.outputFile);
}

run();

process.on('uncaughtException', onError);
process.on('unhandledRejection', onError);

function onError(err) {
  let errStr = String(err);
  if (errStr.indexOf('Protocol error') >= 0 ||
      errStr.indexOf('already paired') >= 0 ||
      errStr.indexOf('user data directory is already in use') >= 0) {
    console.error("\x1b[31m", "\n Existing browser process(es) infect the automation process. Please exit them all.\n", '\x1b[0m');
    process.exitCode = 1;
  }
  console.log('');
  console.dir(err);
  process.exit();
}