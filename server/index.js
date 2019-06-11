const express = require('express');
const path = require('path');
const db = require('sqlite');
const port = process.env.PORT || 5000;

const pusher = require('./pusher');
const routing = require('./routing');

const app = express();
app.use(express.static(path.join(__dirname, '../public')));
app.use(express.json());
app.use(express.urlencoded());
app.use((err, req, res, next) => {
  res.status(err.status || 500).send({ error: err.message });
});

async function initDB() {
  await db.open(path.join(__dirname, '../database.sqlite'));
  await db.migrate({ force: process.env.NODE_ENV === 'development' && 'last' });
}

app.get('/', (req, res) =>
  res.sendFile(path.join(__dirname + '../public/index.html'))
);

app.post('/auth', async (req, res) => {
  const user = await db.get('SELECT * FROM users WHERE id = ?', req.body.id);
  res.json(user);
});

app.post('/pusher/auth', async (req, res) => {
  const { socket_id: socketId, channel_name: channel, token } = req.body;
  if (token) {
    const user = await db.get('SELECT * from users WHERE token = ?', token);
    const userData = {
      user_id: user.id,
      user_info: {
        name: user.name
      }
    };
    const auth = pusher.authenticate(socketId, channel, userData);
    res.send(auth);
  }
  res.status(403).send();
});

app.post('/pusher/webhook', async (req, res) => {
  const { name, event, body, channel } = req.body;
  if (
    name === 'client_event' &&
    event === 'client-changes' &&
    channel.startsWith('private-collab-')
  ) {
    const [, articleId] = channel.split('private-collab-');
    if (articleId) {
      const user = await db.get('SELECT * FROM users WHERE id = ?', body.user);
      await addNewEventsToInstance(articleId, body, user);
    }
  }
});

app.use('/collab', routing);

initDB().then(() => {
  app.listen(port, () => console.log(`Running at http://localhost:${port}`));
});
