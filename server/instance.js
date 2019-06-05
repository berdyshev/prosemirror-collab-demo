const Articles = require('./articles');

const MAX_STEP_HISTORY = 10000;
const instances = Object.create(null);
let instanceCount = 0;
let maxCount = 20;
let saveEvery = 1e4;

// A collaborative editing document instance.
class Instance {
  constructor(article) {
    this.article = article;
    this.steps = [];
    this.lastActive = Date.now();
  }

  stop() {}

  addEvents(version, user, steps) {
    this.checkVersion(version);
    if (this.article.version != version) return false;
    let doc = this.article.content;
    for (let i = 0; i < steps.length; i++) {
      steps[i].clientID = user.id;
      let result = steps[i].apply(doc);
      doc = result.doc;
    }
    this.article.content = doc;
    this.article.version += steps.length;
    this.steps = this.steps.concat(steps);
    if (this.steps.length > MAX_STEP_HISTORY)
      this.steps = this.steps.slice(this.steps.length - MAX_STEP_HISTORY);

    // this.sendUpdates();
    this.scheduleSave();
    return { version: this.article.version };
  }

  // : (Number)
  // Check if a document version number relates to an existing
  // document version.
  checkVersion(version) {
    if (version < 0 || version > this.article.version) {
      let err = new Error('Invalid version ' + version);
      err.status = 400;
      throw err;
    }
  }

  scheduleSave() {
    if (this.saveTimeout != null) return;
    this.saveTimeout = setTimeout(() => {
      this.saveTimeout = null;
      this.article.save();
    }, saveEvery);
  }
}

async function getInstance(id) {
  let inst = instances[id];
  if (!inst) {
    inst = await newInstance(id);
  }
  inst.lastActive = Date.now();
  return inst;
}
exports.getInstance = getInstance;

async function newInstance(id) {
  const article = await Articles.get(id);

  if (++instanceCount > maxCount) {
    let oldest = null;
    for (let id in instances) {
      let inst = instances[id];
      if (!oldest || inst.lastActive < oldest.lastActive) oldest = inst;
    }
    instances[oldest.id].stop();
    delete instances[oldest.id];
    --instanceCount;
  }
  return (instances[id] = new Instance(article));
}
