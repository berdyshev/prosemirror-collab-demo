const express = require('express');
const path = require('path');
const db = require('sqlite');
const port = process.env.PORT || 5000;

const routing = require('./routing');

const app = express();
app.use(express.static(path.join(__dirname, '../public')));
app.use(express.json());
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

app.use('/collab', routing);

initDB().then(() => {
  app.listen(port, () => console.log(`Running at http://localhost:${port}`));
});
