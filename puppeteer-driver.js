const puppeteer = require('puppeteer-core');
const { JSHandle } = require('puppeteer-core/lib/cjs/puppeteer/common/JSHandle.js');
const {delaySecond, delayMs} = require('./delay.js');
const {markStart, markEnd} = require('./markers.js');
const {startProfile, stopProfile} = require('./profiler.js');
const {getTimeStamp, InfoMessage} = require('./utils.js');
const path = require('path');
const fs = require('fs');
const util = require('util');
const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);

JSHandle.prototype.getEventListeners = function() {
  return this._client.send('DOMDebugger.getEventListeners', {
    objectId: this._remoteObject.objectId
  });
};

async function startBrowser(env) {
  InfoMessage(env, `User user data path is ${env.runtime.platform.userDataDir}`);
  await modifyExitTypeToNormal(env);
  const args_filter = [ "--disable-extensions", "--headless", "about:blank"];
  let browserArgs = puppeteer.defaultArgs().filter(arg => {
    for (let key in args_filter) {
      if (arg === undefined || arg == args_filter[key])
        return false;
    }
    return true;
  });

  browserArgs = []; // Clear puppeteer args to prevent bot detection on Google account login
  browserArgs.push('--start-maximized');
  browserArgs.push('--disable-extensions=false');
  browserArgs.push('--lang=en-US');
  // browserArgs.push('--force-renderer-accessibility');
  browserArgs.push(`--user-data-dir=${env.runtime.platform.userDataDir}`);
  if (env.runtime.platform.profile) {
    browserArgs.push(`--profile-directory=${env.runtime.platform.profile}`);
  }
  // browserArgs.push('chrome-search://local-ntp/local-ntp.html');
  if (env.configs.proxy) {
    browserArgs.push(`--proxy-server="http=${env.configs.proxy};https=${env.configs.proxy}"`);
  }
  if (env.configs.profilerTool === "VTUNE") {
    browserArgs.push('--no-sandbox');
    browserArgs.push('--enable-vtune-support');
  }

  // browserArgs.push('--disable-session-crashed-bubble');
  InfoMessage(env, `These are the arguments to the browser: ${browserArgs.toString()}`);
  InfoMessage(env, `Chrome path: ${env.runtime.platform.chromePath}`);
  const browser = await puppeteer.launch({
    executablePath: env.runtime.platform.chromePath,
    headless: false,
    defaultViewport: null,
    userDataDir: env.runtime.platform.userDataDir,
    pipe: true,
    product: "chrome",
    ignoreDefaultArgs: true,
    args: browserArgs
  });
  await browser.isConnected();
  let targets = await browser.targets();
  let page = null;
  for (let i = 0; i < targets.length; i++) {
    if (targets[i].type() == "page") {
      page = await targets[i].page();
    }
  }

  env.runtime.browser = browser;
  env.runtime.browserArgs = browserArgs;
  env.runtime.page = page;
  await delaySecond(env, 5);
}

async function closeBrowser(env) {
  InfoMessage(env, 'closeBrowser');
  await env.runtime.browser.close();
}

async function modifyExitTypeToNormal(env) {
  InfoMessage(env, 'modifyExitTypeToNormal');
  let filePath = path.resolve(env.runtime.platform.userDataDir, env.runtime.platform.profile);
  filePath = path.resolve(filePath, 'Preferences');
  if (!fs.existsSync(filePath)) {
    throw new Error(`Can't find Preferences file using the path: ${filePath}`);
  }
  const bytes = await readFile(filePath);
  configs = JSON.parse(bytes);
  configs.profile.exit_type = "Normal";
  await writeFile(filePath, JSON.stringify(configs, undefined, 4), 'utf8');
  InfoMessage(env, "Change exit_type to normal successfully.");
}

async function newTab(env) {
  InfoMessage(env, 'newTab');
  const page = await env.runtime.browser.newPage();
  env.runtime.page = page;
  await page.bringToFront();
}

async function closeTab(env) {
  if (env.runtime.page) {
    const pageTitle = await env.runtime.page.title();
    await env.runtime.page.close();
    InfoMessage(env, `closeTab: close tab with title "${pageTitle}"`);
  }
  env.runtime.page = undefined;
}

async function selectPageFrameIndex(env, index) {
  InfoMessage(env, `selectPageFrameIndex: ${index}`);
  env.runtime.pageFrameIndex = index;
}

async function evaluateInPage(env, pageFunction) {
  InfoMessage(env, 'evaluateInPage');
  const result = await env.runtime.page.evaluate(pageFunction);
  return result;
}

async function getPageTitle(env) {
  InfoMessage(env, 'getPageTitle');
  let pageTitle = await env.runtime.page.title();
  return pageTitle;
}

async function findTabByTitle(env, title, appendCondition = null) {
  InfoMessage(env, `findTabByTitle: ${title}`);
  const pages = await env.runtime.browser.pages();
  for (const page of pages) {
    let pageTitle = await page.title();
    if (pageTitle.indexOf(title) >= 0 && (!appendCondition || pageTitle.indexOf(appendCondition) >= 0)) {
      env.runtime.page = page;
      await page.bringToFront();
      InfoMessage(env, `findTabByTitle: Tab with title "${title}" is found`);
      return true;
    }
  }
  throw new Error(`findTabByTitle: Tab with title "${title}" isn't found`);
}

async function findTabByUrl(env, url, appendCondition = null) {
  InfoMessage(env, `findTabByUrl: ${url}`);
  const pages = await env.runtime.browser.pages();
  for (const page of pages) {
    const pageUrl = await page.url();
    if (pageUrl.indexOf(url) >= 0 && (!appendCondition || pageUrl.indexOf(appendCondition) >= 0)) {
      env.runtime.page = page;
      await page.bringToFront();
      InfoMessage(env, `findTabByUrl: Tab with Url "${url}" is found`);
      return true;
    }
  }
  throw new Error(`findTabByUrl: Tab with Url "${url}" isn't found`);
}

async function clickXpathWaitNewTabNavigation(env, str, options) {
  InfoMessage(env, 'clickXpathWaitNewTabNavigation');
  let beforehandles = await env.runtime.browser.pages();
  let afterhandles = null;
  await clickXPath(env, str, options);
  await waitForCondition(env, async function() {
    afterhandles = await env.runtime.browser.pages();
    if (afterhandles.length == beforehandles.length + 1) {
      return true
    } else {
      return false;
    }
  });
  for (let handle of afterhandles) {
    if (beforehandles.indexOf(handle) < 0) {
      env.runtime.page = handle;
      await handle.bringToFront();
      break;
    }
  }
  await env.runtime.page.waitForFunction(async function() {
    return (document.readyState === "interactive" || document.readyState === "complete" );
  }, {timeout: env.configs.defaultTimeout});
}

async function gotoUrlDCL(env, url) {
  InfoMessage(env, `gotoUrlDCL: ${url}`);
  await env.runtime.page.goto(url, {
    timeout: env.configs.defaultTimeout,
    waitUntil: 'domcontentloaded',
  });
  await env.runtime.page.bringToFront();
}

async function gotoUrl(env, url) {
  InfoMessage(env, `gotoUrl: ${url}`);
  await env.runtime.page.goto(url, {
    timeout: env.configs.defaultTimeout,
  });
  await env.runtime.page.bringToFront();
}

async function waitForXPath(env, str, options) {
  InfoMessage(env, `waitForXPath: ${str}`);
  const timeout = options && options.timeout ? options.timeout : env.configs.defaultTimeout;
  const target = await env.runtime.page.waitForXPath(str, {timeout: timeout});
  return target;
}

async function findFrameXPath(env, str) {
  InfoMessage(env, `findFrameXPath: ${str}`);
  const frame = getFrame(env);
  const target = await frame.$x(str);
  return target;
}

async function waitForFrameXPath(env, str, options) {
  InfoMessage(env, `waitForFrameXPath: ${str}`);
  const timeout = options && options.timeout ? options.timeout : env.configs.defaultTimeout;
  const frame = getFrame(env);
  const target = await frame.waitForXPath(str, {timeout: timeout});
  return target;
}

async function waitForXpathClickable(env, str) {
  InfoMessage(env, `waitForXpathClickable: ${str}`);
  const target = await waitForXPath(env, str);
  await waitForCondition(env, async function() {
    const result = await target.getEventListeners();
    for (let i in result.listeners) {
      if (result.listeners[i].type === 'click') {
        InfoMessage(env, `The element ${str} is clickable.`);
        return true;
      }
    }
    return false;
  });
}

async function waitForFrameXpathClickable(env, str) {
  InfoMessage(env, `waitForFrameXpathClickable: ${str}`);
  const target = await waitForFrameXPath(env, str);
  await waitForCondition(env, async function() {
    const result = await target.getEventListeners();
    for (let i in result.listeners) {
      if (result.listeners[i].type === 'click') {
        InfoMessage(env, `The element ${str} in frame is clickable.`);
        return true;
      }
    }
    return false;
  });
}

async function waitForFrame(env, frameIndex) {
  InfoMessage(env, `waitForFrame: ${frameIndex}`);
  let result = await waitForCondition(env, async function() {
    const frames = await env.runtime.page.frames();
    for (let frame of frames) {
      const frameName = await frame.name();
      if(frameName && frameIndex.indexOf(frameName) >= 0) {
        return frameName;
      }
    }
    return null;
  });
  return result;
}

function getFrame(env) {
  const frames = env.runtime.page.frames();
  for (let frame of frames) {
    if(frame.name() === env.runtime.pageFrameIndex) {
      return frame;
    }
  }
}

async function waitForFrameFunction(env, func, options, ...args) {
  InfoMessage(env, 'waitForFrameFunction');
  const frame = getFrame(env);
  options = options || {timeout: env.configs.defaultTimeout};
  const target = await frame.waitForFunction(func, options, ...args);
  return target;
}

async function waitForXPathDisappear(env, str) {
  InfoMessage(env, `waitForXPathDisappear: ${str}`);
  await waitForCondition(env, async function() {
    const targets = await env.runtime.page.$x(str, {timeout: 0});
    if (targets && targets.length) {
      return null; // Keep waiting
    } else {
      return true;
    }
  });
}

async function clickXPath(env, str, options) {
  InfoMessage(env, `clickXPath: ${str}`);
  const button = options && options.button ? options.button : 'left';
  const delay = options && options.delay ? options.delay : 100;
  const clickCount = options && options.clickCount ? options.clickCount : 1;
  const target = await waitForXPath(env, str);
  await target.click({button: button, clickCount: clickCount, delay: delay});

  // Safe Click
  // await target.evaluate(node => {
  //   node.click();
  // });
}

async function clickFrameXPath(env, str, options) {
  InfoMessage(env, `clickFrameXPath: ${str}`);
  const button = options && options.button ? options.button : 'left';
  const delay = options && options.delay ? options.delay : 100;
  const clickCount = options && options.clickCount ? options.clickCount : 1;
  const target = await waitForFrameXPath(env, str);
  await target.click({button: button, clickCount: clickCount, delay: delay});
}

async function clickXPathWaitNavigation(env, str) {
  InfoMessage(env, `clickXPathWaitNavigation: ${str}`);
  const target = await waitForXPath(env, str);

  await Promise.all([
    env.runtime.page.waitForNavigation({timeout: env.configs.defaultTimeout}),
    target.click()
  ]);
}

async function getStyleValue(env, elementXpath, propertyName) {
  InfoMessage(env, `getStyleValue: ${propertyName}`);
  let element = await waitForXPath(env, elementXpath);
  let style = await element.getProperty('style');
  let property = await style.getProperty(propertyName);
  let propertyValue = await property.jsonValue();
  return propertyValue;
}

async function waitForStyle(env, elementXpath, propertyName, propertyValue) {
  InfoMessage(env, `waitForStyle: wait ${propertyName} become ${propertyValue}`);
  await waitForCondition(env, async function() {
    let property = await getStyleValue(env, elementXpath, propertyName);
    return (property.indexOf(propertyValue) != -1);
  });
}

async function getStyleValueInFrame(env, elementXpath, propertyName) {
  InfoMessage(env, `getStyleValueInFrame: ${propertyName}`);
  let element = await waitForFrameXPath(env, elementXpath);
  let style = await element.getProperty('style');
  let property= await style.getProperty(propertyName);
  let propertyValue = await property.jsonValue();
  return propertyValue;
}

async function waitForStyleInFrame(env, elementXpath, propertyName, propertyValue) {
  InfoMessage(env, `waitForStyleInFrame: wait ${propertyName} become ${propertyValue}`);
  await waitForCondition(env, async function() {
    let property = await getStyleValueInFrame(env, elementXpath, propertyName);
    return (property.indexOf(propertyValue) != -1);
  });
}

async function getElementsCount(env, xpath) {
  InfoMessage(env, `getElementsCount: ${xpath}`);
  const targets = await env.runtime.page.$x(xpath);
  return targets.length;
}

async function getFrameElementsCount(env, xpath) {
  InfoMessage(env, `getFrameElementsCount: ${xpath}`);
  const frame = getFrame(env);
  const targets = await frame.$x(xpath);
  return targets.length;
}

async function waitForElementsCount(env, xpath, count, timeout = 60000) {
  InfoMessage(env, `waitForElementsCount: xpath is ${xpath}, count is ${count}`);
  let found = 0;
  let time = 0;
  while (found < count) {
    if(time > timeout) {
      throw new Error('waitForElementsCount time out');
    }
    found = await getElementsCount(env, xpath);
    time = time + env.configs.defaultCheckupDelay;
    await delayMs(env, env.configs.defaultCheckupDelay);
  }
}

async function getElementTextContent(env, elem) {
  let result = await elem.evaluate((node) => {
    return node.textContent;
  });
  return result;
}

async function getInputElementValue(env, elem) {
  let result = await elem.evaluate((node) => {
    return node.value;
  });
  return result;
}

async function inputText(env, text, options) {
  InfoMessage(env, 'inputText');
  const delayTime = options && options.delay ? options.delay : 100;
  await env.runtime.page.keyboard.type(text, {delay: delayTime});
}

async function pressKey(env, key, options) {
  InfoMessage(env, `pressKey: ${key}`);
  const delayTime = options && options.delay ? options.delay : 100;
  await env.runtime.page.keyboard.press(key, {delay: delayTime});
}

async function pressShortcutKey(env, keyToPress) {
  InfoMessage(env, `pressShortcutKey: ${keyToPress}`);
  const mod = env.runtime.platform.shortcutModifierKey;
  const page = env.runtime.page;

  await page.keyboard.down(mod, page);
  await page.keyboard.press(keyToPress, page);
  await page.keyboard.up(mod, page);
}

// example: pressKeyWithMod(env, "/", ["Alt, "Shift"]);
async function pressKeyWithMod(env, key, modArray) {
  InfoMessage(env, 'pressKeyWithMod');
  const page = env.runtime.page;

  for (let i = 0; i < modArray.length; i++) {
    await page.keyboard.down(modArray[i]);
  }

  await page.keyboard.press(key, { delay:100 });

  for (let i = modArray.length - 1; i >= 0; i--) {
    await page.keyboard.up(modArray[i]);
  }
}

async function holdKey(env, key) {
  InfoMessage(env, `holdKey: ${key}`);
  await env.runtime.page.keyboard.down(key);
}

async function unholdKey(env, key) {
  InfoMessage(env, `unholdKey: ${key}`);
  await env.runtime.page.keyboard.up(key);
}

async function selectAll(env) {
  InfoMessage(env, 'selectAll');
  const page = env.runtime.page;
  const mod = env.runtime.platform.shortcutModifierKey;

  await page.keyboard.down(mod);
  await page.keyboard.press('a');
  await page.keyboard.up(mod);
}

async function copyClipboard(env) {
  InfoMessage(env, 'copyClipboard');
  const page = env.runtime.page;
  const mod = env.runtime.platform.shortcutModifierKey;

  if (process.platform === 'darwin') {
    await page.keyboard.down('Control', page);
    await page.keyboard.press('Insert', page);
    await page.keyboard.up('Control', page);

    // // The clipboard API does not allow you to copy, unless the tab is focused.
    // await page.bringToFront();
    // let u = new URL(page.url());
    // await env.runtime.browser.defaultBrowserContext().overridePermissions(
    //     u.origin, ['clipboard-read', 'clipboard-write']);
    // await page.evaluate(() => {
    //   // Copy the selected content to the clipboard
    //   document.execCommand('copy');
    // });
  } else {
    await page.keyboard.down(mod, page);
    await page.keyboard.press('c', page);
    await page.keyboard.up(mod, page);
  }
}

async function pasteClipboard(env) {
  InfoMessage(env, 'pasteClipboard');
  const page = env.runtime.page;

  if (process.platform === 'darwin') {
    await page.keyboard.down('Shift', page);
    await page.keyboard.press('Insert', page);
    await page.keyboard.up('Shift', page);

    // // The clipboard API does not allow you to copy, unless the tab is focused.
    // await page.bringToFront();
    // let u = new URL(page.url());
    // await env.runtime.browser.defaultBrowserContext().overridePermissions(
    //     u.origin, ['clipboard-read', 'clipboard-write']);
    // let str = await page.evaluate(() => {
    //   document.execCommand('paste');
    //   // Obtain the content of the clipboard as a string
    //   return navigator.clipboard.readText();
    // });
    // InfoMessage(env, str);
  } else {
    const mod = env.runtime.platform.shortcutModifierKey;
    await page.keyboard.down(mod, page);
    await page.keyboard.press('v', page);
    await page.keyboard.up(mod, page);
    // await page.keyboard.press("Meta", {text: "v"});
  }
}

async function uploadFile(env, elementXpath, filePath) {
  const getFileChooserStart = Date.now();
  const[fileChooser] = await Promise.all([
    env.runtime.page.waitForFileChooser(),
    clickXPath(env, elementXpath),
  ]);
  const getFileChooserEnd = Date.now();
  const uploadFileStart = Date.now();
  await fileChooser.accept([filePath]);
  return {getFileChooserStart: getFileChooserStart, getFileChooserEnd: getFileChooserEnd, uploadFileStart: uploadFileStart};
}

async function uploadFileInFrame(env, elementXpath, filePath) {
  const getFileChooserStart = Date.now();
  const[fileChooser] = await Promise.all([
    env.runtime.page.waitForFileChooser(),
    clickFrameXPath(env, elementXpath),
  ]);
  const getFileChooserEnd = Date.now();
  const uploadFileStart = Date.now();
  await fileChooser.accept([filePath]);
  return {getFileChooserStart: getFileChooserStart, getFileChooserEnd: getFileChooserEnd, uploadFileStart: uploadFileStart};
}

async function waitForCondition(env, callback, timeout = 60000) {
  let time = 0;
  while (true) {
    if (time > timeout) {
      throw new Error('waitForCondition time out');
    }
    const result = await callback();
    if (result) {
      return result;
    }
    time = time + env.configs.defaultCheckupDelay;
    await delayMs(env, env.configs.defaultCheckupDelay);
  }
}

async function screenshot(env, options) {
  InfoMessage(env, 'screenshot');
  const page = env.runtime.page;
  await page.screenshot(options);
}

async function startTracing(env, file, traceCategories, captureScreenshots) {
  InfoMessage(env, 'startTracing');
  file = file || 'tracing.json';
  await env.runtime.page.tracing.start({
    path: file,
    screenshots: captureScreenshots,
    categories: traceCategories,
  });
}

async function stopTracing(env) {
  InfoMessage(env, 'stopTracing');
  await env.runtime.page.tracing.stop();
}

module.exports = {
  startBrowser: startBrowser,
  closeBrowser: closeBrowser,

  newTab: newTab,
  closeTab: closeTab,
  selectPageFrameIndex: selectPageFrameIndex,
  evaluateInPage: evaluateInPage,
  getPageTitle: getPageTitle,
  findTabByTitle: findTabByTitle,
  findTabByUrl: findTabByUrl,
  clickXpathWaitNewTabNavigation: clickXpathWaitNewTabNavigation,
  gotoUrlDCL: gotoUrlDCL,
  gotoUrl: gotoUrl,

  waitForXPath: waitForXPath,
  findFrameXPath: findFrameXPath,
  waitForFrameXPath: waitForFrameXPath,
  waitForXpathClickable: waitForXpathClickable,
  waitForFrameXpathClickable: waitForFrameXpathClickable,
  waitForFrame: waitForFrame,
  getFrame: getFrame,
  waitForFrameFunction: waitForFrameFunction,
  waitForXPathDisappear: waitForXPathDisappear,
  clickXPath: clickXPath,
  clickFrameXPath: clickFrameXPath,
  clickXPathWaitNavigation: clickXPathWaitNavigation,

  getStyleValue: getStyleValue,
  waitForStyle: waitForStyle,
  getStyleValueInFrame: getStyleValueInFrame,
  waitForStyleInFrame: waitForStyleInFrame,
  getElementsCount: getElementsCount,
  getFrameElementsCount: getFrameElementsCount,
  waitForElementsCount: waitForElementsCount,
  getElementTextContent: getElementTextContent,
  getInputElementValue: getInputElementValue,

  inputText: inputText,
  pressKey: pressKey,
  pressShortcutKey: pressShortcutKey,
  pressKeyWithMod: pressKeyWithMod,
  holdKey: holdKey,
  unholdKey: unholdKey,
  selectAll: selectAll,
  copyClipboard: copyClipboard,
  pasteClipboard: pasteClipboard,

  uploadFile: uploadFile,
  uploadFileInFrame: uploadFileInFrame,

  waitForCondition: waitForCondition,
  screenshot: screenshot,
  startTracing: startTracing,
  stopTracing: stopTracing,
};
