const handler = require('serve-handler');
const http = require('http');
const { handleCollabRequest } = require('./server');

function maybeCollab(req, resp) {
  let url = req.url,
    backend = url.replace(/\/collab-backend\b/, '');
  if (backend != url) {
    req.url = backend;
    if (handleCollabRequest(req, resp)) return true;
    req.url = url;
  }
  return false;
}

const server = http.createServer((request, response) => {
  return (
    maybeCollab(request, response) ||
    // You pass two more arguments for config and middleware
    // More details here: https://github.com/zeit/serve-handler#options
    handler(request, response, {
      public: 'public',
      directoryListing: false
    })
  );
});

server.listen(8080, () => {
  console.log('Running at http://localhost:8080');
});
