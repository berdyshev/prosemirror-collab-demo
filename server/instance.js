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
    this.users = Object.create(null);
    this.userCount = 0;
    this.waiting = [];

    this.collecting = null;
  }

  stop() {
    if (this.collecting != null) clearInterval(this.collecting);
  }

  addEvents(version, user, steps) {
    this.checkVersion(version);
    if (this.article.version != version) return false;
    let doc = this.article.content,
      maps = [];
    for (let i = 0; i < steps.length; i++) {
      steps[i].clientID = user.id;
      let result = steps[i].apply(doc);
      doc = result.doc;
      maps.push(steps[i].getMap());
    }
    this.article.content = doc;
    this.article.version += steps.length;
    this.steps = this.steps.concat(steps);
    if (this.steps.length > MAX_STEP_HISTORY)
      this.steps = this.steps.slice(this.steps.length - MAX_STEP_HISTORY);

    this.sendUpdates();
    this.scheduleSave();
    return { version: this.article.version, cursors: this.getCursors(user) };
  }

  sendUpdates() {
    while (this.waiting.length) this.waiting.pop().finish();
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

  // : (Number, Number)
  // Get events between a given document version and
  // the current document version.
  getEvents(version, user) {
    this.checkVersion(version);
    let startIndex = this.steps.length - (this.article.version - version);
    if (startIndex < 0) return false;

    return {
      steps: this.steps.slice(startIndex),
      users: this.userCount,
      cursors: this.getCursors(user)
    };
  }

  getCursors(user) {
    return Object.values(this.users)
      .filter((u) => u.id !== user.id)
      .map((u) => ({
        position: u.cursor,
        user: { id: u.id, name: u.name }
      }));
  }

  collectUsers() {
    const oldUserCount = this.userCount;
    this.users = Object.create(null);
    this.userCount = 0;
    this.collecting = null;
    this.waiting.forEach(({ user }) => this._registerUser(user));
    if (this.userCount != oldUserCount) {
      this.sendUpdates();
    }
  }

  registerUser(user) {
    if (!(user.id in this.users)) {
      this._registerUser(user);
      this.sendUpdates();
    } else if (user.cursor && user.cursor !== this.users[user.id].cursor) {
      this.users[user.id].cursor = user.cursor;
    }
  }

  _registerUser(user) {
    if (!(user.id in this.users)) {
      this.users[user.id] = user;
      this.userCount++;
      if (this.collecting == null)
        this.collecting = setTimeout(() => this.collectUsers(), 5000);
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

async function getInstance(id, user) {
  let inst = instances[id];
  if (!inst) {
    inst = await newInstance(id);
  }
  if (user) {
    inst.registerUser(user);
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
