import axios from 'axios';
import { exampleSetup, buildMenuItems } from 'prosemirror-example-setup';
import { Step } from 'prosemirror-transform';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { history } from 'prosemirror-history';
import {
  collab,
  receiveTransaction,
  sendableSteps,
  getVersion
} from 'prosemirror-collab';

import { schema } from './schema';
import api from './api';
import cursor from './cursor';

const menu = buildMenuItems(schema);

class EditorError extends Error {
  constructor(code, message) {
    super(message);
    this.status = code;
  }
}

function badVersion(err) {
  return err.status == 400 && /invalid version/i.test(err.message);
}

function repeat(val, n) {
  let result = [];
  for (let i = 0; i < n; i++) result.push(val);
  return result;
}

class State {
  constructor(edit, comm) {
    this.edit = edit;
    this.comm = comm;
  }
}

class EditorConnection {
  constructor(report, globalState) {
    this.report = report;
    this.globalState = globalState;
    this.state = new State(null, 'start');
    this.backOff = 0;
    this.view = null;
    this.dispatch = this.dispatch.bind(this);
    this.container = document.getElementById('editor');
  }

  // All state changes go through this
  async dispatch(action) {
    console.group('dispatch');
    console.log('action', action);
    let newEditState = null;
    if (action.type == 'loaded') {
      // info.users.textContent = userString(action.users); // FIXME ewww
      let editState = EditorState.create({
        doc: action.doc,
        plugins: exampleSetup({
          schema,
          history: false,
          menuContent: menu.fullMenu
        }).concat([
          history({ preserveItems: true }),
          collab({ version: action.version }),
          cursor
        ])
      });
      this.state = new State(editState, 'poll');
      this.poll();
    } else if (action.type == 'restart') {
      this.state = new State(null, 'start');
      this.start();
    } else if (action.type == 'poll') {
      this.state = new State(this.state.edit, 'poll');
      this.poll();
    } else if (action.type == 'recover') {
      if (action.error.status && action.error.status < 500) {
        this.report.failure(action.error);
        this.state = new State(null, null);
      } else {
        this.state = new State(this.state.edit, 'recover');
        this.recover(action.error);
      }
    } else if (action.type == 'transaction') {
      newEditState = this.state.edit.apply(action.transaction);
    }
    console.log('next state', this.state.comm, newEditState);

    if (newEditState) {
      let sendable;
      if (newEditState.doc.content.size > 40000) {
        if (this.state.comm != 'detached')
          this.report.failure('Document too big. Detached.');
        this.state = new State(newEditState, 'detached');
      } else if (
        (this.state.comm == 'poll' || action.requestDone) &&
        (sendable = this.sendable(newEditState))
      ) {
        this.closeRequest();
        this.state = new State(newEditState, 'send');
        this.send(newEditState, sendable);
      } else if (action.requestDone) {
        this.state = new State(newEditState, 'poll');
        this.poll();
      } else {
        this.state = new State(newEditState, this.state.comm);
      }
    }

    // Sync the editor with this.state.edit
    if (this.state.edit) {
      if (this.view) this.view.updateState(this.state.edit);
      else
        this.setView(
          new EditorView(this.container, {
            state: this.state.edit,
            dispatchTransaction: (transaction) =>
              this.dispatch({ type: 'transaction', transaction })
          })
        );
    } else this.setView(null);

    console.groupEnd('dispatch');
  }

  // Load the document from the server and start up
  async start() {
    let data;
    try {
      ({ data } = await this.run({
        url: `/collab/articles/${this.globalState.currentArticle}`
      }));
    } catch (err) {
      this.report.failure(err.message);
      return;
    }
    this.report.success();
    this.backOff = 0;
    this.dispatch({
      type: 'loaded',
      doc: schema.nodeFromJSON(data.doc),
      version: data.version,
      users: data.users
    });
  }

  // Send a request for events that have happened since the version
  // of the document that the client knows about. This request waits
  // for a new version of the document to be created if the client
  // is already up-to-date.
  async poll() {
    let response;
    try {
      response = await this.run({
        url: `/collab/events/${this.globalState.currentArticle}`,
        method: 'GET',
        params: {
          version: getVersion(this.state.edit),
          cursor: this.state.edit.selection.head
        }
      });
    } catch (err) {
      if (axios.isCancel(err)) {
        // do nothing, just return and continue processing.
      } else if (err.status == 410 || badVersion(err)) {
        // Too far behind. Revert to server state
        this.report.failure(err.message);
        this.dispatch({ type: 'restart' });
      } else if (err) {
        this.dispatch({ type: 'recover', error: err.message });
      }
      return;
    }
    this.report.success();
    this.backOff = 0;
    if (response && response.data.steps && response.data.steps.length) {
      let tr = receiveTransaction(
        this.state.edit,
        response.data.steps.map((j) => Step.fromJSON(schema, j)),
        response.data.clientIDs
      );
      tr.setMeta(cursor, {
        type: 'receive',
        userCursors: response.data.cursors
      });
      this.dispatch({
        type: 'transaction',
        transaction: tr,
        requestDone: true
      });
    } else {
      this.poll();
    }
    // info.users.textContent = userString(data.users);
  }

  sendable(editState) {
    let steps = sendableSteps(editState);
    if (steps) {
      return { steps };
    }
  }

  // Send the given steps to the server
  async send(editState, { steps, ...other }) {
    let response;
    try {
      let data = {
        version: getVersion(editState),
        steps: steps ? steps.steps.map((s) => s.toJSON()) : [],
        clientID: steps ? steps.clientID : 0,
        ...other
      };
      response = await this.run({
        url: `/collab/events/${this.globalState.currentArticle}`,
        method: 'POST',
        data
      });
    } catch (err) {
      if (err.status == 409) {
        // The client's document conflicts with the server's version.
        // Poll for changes and then try again.
        this.backOff = 0;
        this.dispatch({ type: 'poll' });
      } else if (badVersion(err)) {
        this.report.failure(err.message);
        this.dispatch({ type: 'restart' });
      } else {
        this.dispatch({ type: 'recover', error: err });
      }
      return;
    }
    this.report.success();
    this.backOff = 0;
    let tr = steps
      ? receiveTransaction(
          this.state.edit,
          steps.steps,
          repeat(steps.clientID, steps.steps.length)
        )
      : this.state.edit.tr;
    if (response.data.cursors) {
      tr.setMeta(cursor, {
        type: 'receive',
        userCursors: response.data.cursors
      });
    }
    this.dispatch({
      type: 'transaction',
      transaction: tr,
      requestDone: true
    });
  }

  // Try to recover from an error
  async recover(err) {
    let newBackOff = this.backOff ? Math.min(this.backOff * 2, 6e4) : 200;
    if (newBackOff > 1000 && this.backOff < 1000) this.report.delay(err);
    this.backOff = newBackOff;
    setTimeout(() => {
      if (this.state.comm == 'recover') {
        this.dispatch({ type: 'poll' });
      }
    }, this.backOff);
  }

  closeRequest() {
    if (this.cancelRequest) {
      this.cancelRequest();
    }
  }

  async run(config) {
    const cancelToken = new axios.CancelToken((c) => {
      this.cancelRequest = c;
    });
    try {
      return await api.request({ ...config, cancelToken });
    } catch (err) {
      if (!axios.isCancel(err)) {
        console.error('request error', err);
        if (err.response) {
          throw new EditorError(
            err.status,
            (err.response.data && err.response.data.error) || err.message
          );
        }
      }
      throw err;
    }
  }

  close() {
    this.closeRequest();
    this.setView(null);
  }

  setView(view) {
    if (this.view) {
      this.container.classList.add('hidden');
      this.view.destroy();
    } else {
      this.container.classList.remove('hidden');
    }
    this.view = window.view = view;
  }
}

export default EditorConnection;
