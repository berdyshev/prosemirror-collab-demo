/* global Handlebars */
import api from './api';
import EditorConnection from './editor';
import { Reporter } from './reporter';

const report = new Reporter();

const state = (window.appGlobalState = {
  user: sessionStorage.getItem('user'),
  articles: [],
  currentArticle: null
});

if (!state.user) {
  const userId = window.prompt('Enter your user ID', 1);
  signIn(userId).then((user) => {
    state.user = user;
    return initApp(user);
  });
} else {
  state.user = JSON.parse(state.user);
  initApp(state.user);
}

async function initApp(user) {
  document.getElementById('welcome').innerHTML = `Welcome ${user.name}`;
  api.defaults.headers['Auth'] = user.token;

  const response = await api.get('/collab/articles');
  state.articles = response.data;
  showDocList();
}

async function signIn(userId) {
  const response = await api.post('/auth', { id: userId });
  sessionStorage.setItem('user', JSON.stringify(response.data));
  return response.data;
}

let connection = null;

async function initEditor() {
  if (connection) connection.close();
  connection = window.connection = new EditorConnection(report, state);
  await connection.start();
}

const docListTemplate = Handlebars.compile(
  document.getElementById('doclist-template').innerHTML
);
const docListEl = document.getElementById('doclist');
function showDocList() {
  docListEl.innerHTML = docListTemplate(state);
  docListEl.classList.remove('hidden');
}

const docInfoTemplate = Handlebars.compile(
  document.getElementById('docinfo-template').innerHTML
);
const docInfo = document.getElementById('docinfo');
function updateDocInfo() {
  const article = state.articles.find((a) => a.id === state.currentArticle);
  docInfo.innerHTML = docInfoTemplate(article);
  docInfo.classList.remove('hidden');
}

document.addEventListener('click', async (e) => {
  if (e.target.nodeName == 'LI' && e.target.classList.contains('doc-item')) {
    document.getElementById('doclist').classList.add('hidden');
    state.currentArticle = parseInt(e.target.getAttribute('data-name'), 10);
    updateDocInfo();
    initEditor();
  } else if (e.target.nodeName === 'BUTTON' && e.target.id === 'create-doc') {
    document.getElementById('doclist').classList.add('hidden');
    await newDocument(state);
    updateDocInfo();
    initEditor();
  } else if (e.target.nodeName === 'BUTTON' && e.target.id === 'changedoc') {
    docInfo.classList.add('hidden');
    showDocList();
  }
});

async function newDocument(state) {
  let name = prompt('Name the new document', '');
  if (name) {
    const response = await api.post('/collab/articles', { name });
    state.articles.push(response.data);
    state.currentArticle = response.data.id;
  }
}
