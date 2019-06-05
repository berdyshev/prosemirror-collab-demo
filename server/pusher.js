const Pusher = require('pusher');

const pusher = new Pusher({
  appId: '797302',
  key: 'b0e58f4fefd9168716aa',
  secret: 'eb42622415b56a09514a',
  cluster: 'eu',
  useTLS: true
});

module.exports = pusher;
