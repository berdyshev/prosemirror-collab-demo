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
  const welcomeEl = document.getElementById('welcome');
  welcomeEl.innerText = `Welcome ${user.name}`;
  welcomeEl.classList.remove('hidden');
  api.defaults.headers['Auth'] = user.token;

  const response = await api.get('/collab/articles');
  state.articles = response.data;
  showDocList();
}

// Authenticate user by ID.
async function signIn(userId) {
  const response = await api.post('/auth', { id: userId });
  sessionStorage.setItem('user', JSON.stringify(response.data));
  return response.data;
}

let connection = null;

// init editor for the selected document.
async function initEditor() {
  if (connection) connection.close();
  connection = window.connection = new EditorConnection(report, state);
  await connection.start();
}

// Rendering of the list of the articles to select one for editing.
const docListTemplate = Handlebars.compile(
  document.getElementById('doclist-template').innerHTML
);
const docListEl = document.getElementById('doclist');
function showDocList() {
  docListEl.innerHTML = docListTemplate(state);
  docListEl.classList.remove('hidden');
}

// Rendering of the selected document value and Change Doc button.
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
    // Handler to open an exisiting document (article) from the list.
    document.getElementById('doclist').classList.add('hidden');
    state.currentArticle = parseInt(e.target.getAttribute('data-name'), 10);
    updateDocInfo();
    initEditor();
  } else if (e.target.nodeName === 'BUTTON' && e.target.id === 'create-doc') {
    // Handler to create new document by entering it's name in the prompt dialog.
    document.getElementById('doclist').classList.add('hidden');
    await newDocument(state);
    updateDocInfo();
    initEditor();
  } else if (e.target.nodeName === 'BUTTON' && e.target.id === 'changedoc') {
    // handler to open document selector — list with existing articles.
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
