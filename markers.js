const stats = require("stats-lite");
const {InfoMessage} = require('./utils.js');

async function markValue(env, label, timeValue) {
  await markStart(env, label, 0);
  await markEnd(env, label, {time: timeValue});
}

async function markStart(env, label, time) {
  InfoMessage(env, `markStart: ${label}`);
  const measuring = env.measurements.measuring;
  if (!measuring[label]) {
    measuring[label] = {};
  }
  if (typeof time === 'number') {
    measuring[label].start = time
  } else {
    measuring[label].start = Date.now();
  }
  measuring[label].name = label;
}

function updateStats(env, label) {
  let product = 1, sum = 0, rolls = [];
  const count = env.measurements.results[label].rawData.length;
  let max = 0, min = 10000000000000000;
  env.measurements.results[label].rawData.forEach((value) => {
    product *= value.duration;
    sum += value.duration;
    rolls.push(value.duration);
    min = Math.min(min, value.duration);
    max = Math.max(max, value.duration);
  });
  const mean = sum / count;
  env.measurements.results[label].stats = {
    geoMean: Math.pow(product, 1 / count),
    arithmeticMean: mean,
    stdev: stats.stdev(rolls),
    stdevPercent: (stats.stdev(rolls) / mean),
    variance: stats.variance(rolls),
    median: stats.median(rolls),
    max: max,
    min: min,
  };
}

async function markEnd(env, label, options) {
  InfoMessage(env, `markEnd: ${label}`);
  const measuring = env.measurements.measuring;
  if (!measuring[label]) {
    measuring[label] = {};
  }
  if (options && options.time) {
    measuring[label].end = options.time;
  } else {
    measuring[label].end = Date.now();
  }
  measuring[label].name = label;
  if (options && options.scale) {
    measuring[label].scale = options.scale;
    measuring[label].duration = (measuring[label].end - measuring[label].start) * options.scale;
  } else {
    measuring[label].scale = 1;
    measuring[label].duration = measuring[label].end - measuring[label].start;
  }

  if (!env.measurements.results[label]) {
    env.measurements.results[label] = {
      name: label,
      rawData: [],
      stats: {},
    };
  }
  InfoMessage(env, 'Saving measurement with label: ' + label);
  InfoMessage(env, JSON.stringify(measuring[label]));
  env.measurements.results[label].rawData.push(measuring[label]);
  measuring[label] = {};

  // Update stats
  updateStats(env, label);
}

module.exports = {
  markStart: markStart,
  markEnd: markEnd,
  markValue: markValue,
  updateStats: updateStats,
};
