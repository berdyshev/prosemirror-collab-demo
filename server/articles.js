const db = require('sqlite');
const { schema } = require('./schema');

const demoContent = schema.node('doc', null, [
  schema.node('paragraph', null, [
    schema.text(
      'This is a collaborative test document. Start editing to make it more interesting!'
    )
  ])
]);

class Article {
  constructor({ id, name, content, version }) {
    this.id = id;
    this.name = name;
    this.content = schema.nodeFromJSON(JSON.parse(content));
    this.version = parseInt(version, 10);
  }

  save() {
    Articles.save(this.id, {
      content: JSON.stringify(this.content.toJSON()),
      version: this.version
    });
  }
}

const Articles = {
  async list() {
    return await db.all('SELECT id, name, version FROM articles');
  },

  async get(id) {
    const article = await db.get('SELECT * FROM articles WHERE id = ?', id);
    return article ? new Article(article) : null;
  },

  async save(id, { content, version }) {
    await db.run(
      'UPDATE articles SET content = ?, version = ? WHERE id = ?',
      content,
      version,
      id
    );
  },

  async create(name, content = demoContent.toJSON()) {
    const result = await db.run(
      'INSERT INTO articles (name, content, version) VALUES (?, ?, 0)',
      name,
      JSON.stringify(content)
    );
    return this.get(result.lastID);
  }
};

module.exports = Articles;
