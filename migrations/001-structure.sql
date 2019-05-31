-- Up
CREATE TABLE users
(
  id INTEGER PRIMARY KEY,
  name TEXT,
  token TEXT
);

CREATE TABLE articles
(
  id INTEGER PRIMARY KEY,
  name TEXT,
  content TEXT,
  version TEXT
);

INSERT INTO users
VALUES
  (1, 'Artem Berdyshev', 'f2c9ed7b-02d1-4022-8a1d-6a47f664a648'),
  (2, 'John Doe', '60d7ccdd-e0ca-4502-9c61-d5e283c78a49');

INSERT INTO articles
VALUES
  (1, 'example', '{"type":"doc", "content":[{"type":"paragraph","content":[{"type":"text","text":"There is nothing here yet. "},{"type":"text","marks":[{"type":"em"}],"text":"Add something!"}]}]}', 1);
-- Down
DROP TABLE articles;
DROP TABLE users;
