const path = require('path');
const util = require('util');
const fs = require('fs');
const writeFile = util.promisify(fs.writeFile);
const dateTime = require('date-and-time');
const child_process = require('child_process');
const os = require('os');

function fileUrl(name) {
  return path.join(__dirname, name);
}

function getProjRoot() {
  const rootDir = path.resolve(__dirname, './');
  return rootDir;
}

async function saveResult(env, filename) {
  await writeFile(filename, JSON.stringify(env.measurements.results, undefined, 4), 'utf8');
}

function getTimeStamp(date) {
  date = date || new Date;
  return dateTime.format(date, 'YYYY-MM-DD_HH-mm-ss_SSS');
}

async function InfoMessage(env, message, toScreen = true, toLogs = false) {
  let timeStamp = getTimeStamp();
  if (toLogs) {
    // Write message to file.
  } else {
    console.log(`${timeStamp}: ${message}`);
  }
}

async function ErrorMessage(env, message, toScreen = true, toLogs = false) {
  let timeStamp = getTimeStamp();
  if (toLogs) {
    // Write message to file.
  } else {
    console.error(`${timeStamp}: ${message}`);
  }
}

async function spawnWithLogfile(cmd, logFileName, envObj, timeout) {
  envObj = envObj || {};
  return new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(logFileName);
    let newProc;
    let onError = false;

    function writeData(data) {
      stream.write(data);
      if (envObj.DEBUG_MODE || onError) {
        console.log(`${data}`);
      }
    }

    writeData(`${cmd}\n`);
    writeData(`Environment: ${JSON.stringify(envObj, undefined, 4)}\n`);
    writeData('\n');

    if (typeof cmd === 'string') {
      newProc = child_process.spawn(cmd.split(' ')[0], cmd.split(' ').slice(1), {env:envObj});
    } else if (Array.isArray(cmd)) {
      newProc = child_process.spawn(cmd[0], cmd.slice(1));
    } else {
      console.log('Unknown command type for spawnWithLogfile(), specify a string or an array');
    }

    if (timeout) {
      setTimeout(() => {
        newProc.kill('SIGKILL');
        stream.end();
        reject(`spawnWithLogfile timed out in ${timeout} seconds`);
      }, timeout * 1000);
    }

    newProc.stdout.on('data', writeData);
    newProc.stderr.on('data', (data) => {
      onError = true;
      writeData(data);
      newProc.kill("SIGKILL");
    });
    newProc.on('close', function (code) {
      stream.end();
      code = onError ? 1 : code;
      resolve(code);
    });
  });
}

function getRootDir() {
  return path.parse(process.cwd()).root;
}

function getUserHomeDir() {
  let root = getRootDir();
  let usersDir = path.resolve(root, "Users");
  return path.resolve(usersDir, os.userInfo().username);
}

module.exports = {
  fileUrl: fileUrl,
  getProjRoot: getProjRoot,
  saveResult: saveResult,
  getTimeStamp: getTimeStamp,
  InfoMessage: InfoMessage,
  ErrorMessage: ErrorMessage,
  spawnWithLogfile: spawnWithLogfile,
  getRootDir: getRootDir,
  getUserHomeDir: getUserHomeDir,
};

