class Waiting {
  constructor(res, inst, user, finish) {
    this.res = res;
    this.inst = inst;
    this.user = user;
    this.finish = finish;
    this.done = false;
    res.setTimeout(1000 * 60 * 5, () => {
      this.abort();
      this.send({});
    });
  }

  abort() {
    let found = this.inst.waiting.indexOf(this);
    if (found > -1) this.inst.waiting.splice(found, 1);
  }

  send(output) {
    if (this.done) return;
    this.res.json(output);
    this.done = true;
  }
}

module.exports = Waiting;
