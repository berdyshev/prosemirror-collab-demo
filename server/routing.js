const express = require('express');
const db = require('sqlite');
const { Step } = require('prosemirror-transform');

const pusher = require('./pusher');
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
  } else {
    res.json(result);
    pusher.trigger(
      `private-collab-${instance.article.id}`,
      'changes',
      formatEventsResponse(instance, steps),
      data.socketId
    );
  }
});

function formatEventsResponse(inst, steps) {
  return {
    version: inst.article.version,
    steps: steps.map((s) => s.toJSON()),
    clientIDs: steps.map((step) => step.clientID)
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
