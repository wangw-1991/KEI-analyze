const {delaySecond, delayMs} = require('./delay.js');
const {markStart, markEnd} = require('./markers.js');
const {getProjRoot, InfoMessage} = require('./utils.js');
const {startProfile, stopProfile} = require('./profiler.js');
const path = require('path');

const x = require('./puppeteer-driver.js');
for (i in x) {
  global[i] = x[i];
}

const traceCategories = [
  'toplevel',
  'sequence_manager',
  'blink',
  'cc',
  'netlog',
  'latencyInfo',

  'v8',
  'v8.execute',
  'disabled-by-default-v8.stack_trace',
  // 'disabled-by-default-v8.compile',
  // 'disabled-by-default-v8.cpu_profiler',
  // 'disabled-by-default-v8.ic_stats',
  'disabled-by-default-v8.runtime',
  // 'disabled-by-default-v8.runtime_stats',
  // 'disabled-by-default-v8.runtime_stats_sampling',

  'devtools', 
  'devtools.timeline',
];

const Workflow = {
  startBrowser: startBrowser,

  openPage: async function (env) {
    await gotoUrl(env, "https://lightroom.adobe.com/");
    await delaySecond(env, 30);
    await delaySecond(env, 5);
  },

  operatePage: async function (env) {
    await clickXPath(env, `//*[@id="4bea3ad3eae303c9075ace2430936db9"]/div[1]`); 
    await delaySecond(env, 5);
    await markStart(env, "enter-editing");
    await clickXPath(env, `//*[@id="ze-taskbar-adjust"]`);
    await waitForXPath(env, `//*[@id="develop"]/div/div[1]/canvas`);
    await markEnd(env, "enter-editing");
    await delaySecond(env, 5);
  },

  logIn: async function (env) {
    await markStart(env, "log_in");
    await clickXPathWaitNavigation(env, '//button[@aria-label="Continue"]');
    await Promise.all([
      waitForStyle(env, '//*[@id="59f3c5910f3393a57511349897c37356"]/div[1]', 'background-image', 'lightroom.adobe.com/v2c/catalogs'),
      waitForStyle(env, '//*[@id="1692b804e5bb44dd644932df471a49e7"]/div[1]', 'background-image', 'lightroom.adobe.com/v2c/catalogs'),
    ]);
    await markEnd(env, "log_in");
    await delaySecond(env, 5);
  },

  closeBrowser: closeBrowser,
}

module.exports = {
  Workflow: Workflow
}
