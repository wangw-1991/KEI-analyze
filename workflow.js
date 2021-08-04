const {delaySecond, delayMs} = require('./delay.js');
const {markStart, markEnd} = require('./markers.js');
const {getProjRoot, InfoMessage} = require('./utils.js');
const {startProfile, stopProfile} = require('./profiler.js');
const path = require('path');

const x = require('./puppeteer-driver.js');
for (i in x) {
  global[i] = x[i];
}

const Workflow = {
  startBrowser: startBrowser,

  openPage: async function (env) {
    await gotoUrl(env, "https://lightroom.adobe.com/");
    await delaySecond(env, 10);
  },

  operatePage: async function (env) {
    await clickXPath(env, `//*[@id="4bea3ad3eae303c9075ace2430936db9"]/div[1]`);
    await delaySecond(env, 15);
    await markStart(env, "enter-editing");
    await clickXPath(env, `//*[@id="ze-taskbar-adjust"]`);
    await waitForXPath(env, `//*[@id="develop"]/div/div[1]/canvas`);
    await markEnd(env, "enter-editing");
    await delaySecond(env, 5);
  },

  closeBrowser: closeBrowser,
}

module.exports = {
  Workflow: Workflow
}
