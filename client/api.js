import axios from 'axios';

const client = axios.create();
client.defaults.headers['Content-Type'] = 'application/json';

export default client;
