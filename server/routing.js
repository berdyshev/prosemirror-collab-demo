const express = require('express');
const db = require('sqlite');
const { Step } = require('prosemirror-transform');

const Waiting = require('./waiting');
const Articles = require('./articles');
const { getInstance } = require('./instance');
const { schema } = require('./schema');

const router = express.Router();

router.use(async (req, res, next) => {
  const token = req.header('Auth');
  if (token) {
    const user = await db.get('SELECT * FROM users WHERE token = ?', token);
    if (user) {
      req.user = user;
      res.set('X-Welcome', user.name);
      next();
      return;
    }
  }
  res.status(403).send('You are not authorized!');
});

router.get('/articles', async (req, res) => {
  const articles = await Articles.list();
  res.json(articles);
});

router.post('/articles', async (req, res) => {
  const article = await Articles.create(req.body.name, req.body.content);
  res.json(article);
});

router.get('/articles/:id', async (req, res) => {
  const instance = await getInstance(req.params.id, req.user);
  res.json({
    doc: instance.article.content.toJSON(),
    version: instance.article.version,
    users: instance.userCount
  });
});

router.get('/events/:id', async (req, res) => {
  const version = nonNegInteger(req.query.version);
  const user = req.user;
  user.cursor = nonNegInteger(req.query.cursor);
  const instance = await getInstance(req.params.id, user);
  const data = instance.getEvents(version, user);

  if (data === false) {
    const err = new Error('History no longer available');
    err.status = 410;
    throw err;
  }
  // If the server version is greater than the given version,
  // return the data immediately.
  if (data.steps.length) {
    res.json(formatEventsResponse(instance, data));
  }
  // If the server version matches the given version,
  // wait until a new version is published to return the event data.
  let wait = new Waiting(res, instance, user, () => {
    wait.send(
      formatEventsResponse(instance, instance.getEvents(version, user))
    );
  });
  instance.waiting.push(wait);
  res.on('close', () => wait.abort());
});

router.post('/events/:id', async (req, res) => {
  const data = req.body;
  const version = nonNegInteger(data.version);
  const steps = data.steps.map((s) => Step.fromJSON(schema, s));
  const instance = await getInstance(req.params.id, req.user);
  const result = instance.addEvents(version, req.user, steps);
  if (!result) {
    const err = new Error('Version not current');
    err.status = 409;
    throw err;
  } else res.json(result);
});

function formatEventsResponse(inst, data) {
  return {
    version: inst.article.version,
    steps: data.steps.map((s) => s.toJSON()),
    clientIDs: data.steps.map((step) => step.clientID),
    users: data.users,
    cursors: data.cursors
  };
}

function nonNegInteger(str) {
  let num = Number(str);
  if (!isNaN(num) && Math.floor(num) == num && num >= 0) return num;
  let err = new Error('Not a non-negative integer: ' + str);
  err.status = 400;
  throw err;
}

module.exports = router;
