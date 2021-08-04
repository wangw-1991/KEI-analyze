const {InfoMessage} = require('./utils.js');

function delayMs(env, ms) {
  // InfoMessage(env, `delay ${ms} milliseconds`);
  return new Promise(resolve => setTimeout(resolve, ms));
}

function delaySecond(env, seconds) {
  InfoMessage(env, `delay ${seconds} seconds`);
  return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

module.exports = {
  delayMs: delayMs,
  delaySecond: delaySecond,
};
