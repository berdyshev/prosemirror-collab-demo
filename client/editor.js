import axios from 'axios';
import { exampleSetup, buildMenuItems } from 'prosemirror-example-setup';
import { Step, Transform } from 'prosemirror-transform';
import { EditorState, Transaction } from 'prosemirror-state';
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

Pusher.logToConsole = process.env.NODE_ENV !== 'production';

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

class EditorConnection {
  constructor(report, globalState) {
    this.report = report;
    this.globalState = globalState;
    this.view = null;
    this.dispatch = this.dispatch.bind(this);
    this.container = document.getElementById('editor');

    this.channelName = `private-collab-${globalState.currentArticle}`;
    this.channel = globalState.pusher.subscribe(this.channelName);

    this.sendChanges = this.debounce((state) => {
      this.applyNewState(state);
    }, 250);
    this.sendCursor = this.debounce((data) => {
      this.channel.trigger(`client-cursor`, data);
    }, 250);
  }

  // All state changes go through this
  dispatch(action) {
    if (action.type == 'transaction') {
      if (
        !action.prevState ||
        action.prevState.selection.head !== action.state.selection.head
      ) {
        this.sendCursor({
          position: action.state.selection.head,
          user: this.globalState.user
        });
      }
    } else if (action.type === 'update') {
      this.sendChanges(action.state);
    }
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

    const state = EditorState.create({
      doc: schema.nodeFromJSON(data.doc),
      plugins: exampleSetup({
        schema,
        history: false,
        menuContent: menu.fullMenu
      }).concat([
        history({ preserveItems: true }),
        collab({ version: data.version }),
        cursor
      ])
    });
    this.setView(
      new EditorView(this.container, {
        state,
        dispatchTransaction: this.dispatchTransaction.bind(this)
      })
    );

    this.channel.bind('client-changes', (data) => {
      const steps = data.steps.map((j) => Step.fromJSON(schema, j));
      this.applySteps(steps, steps.map((s) => s.clientID));
    });
    this.channel.bind('client-cursor', (cursorData) => {
      const transaction = this.view.state.tr;
      transaction.setMeta(cursor, { type: 'receive', cursor: cursorData });
      this.view.dispatch(transaction);
    });
  }

  dispatchTransaction(transaction) {
    const prevState = this.view.state;
    const newState = this.view.state.apply(transaction);
    this.view.updateState(newState);

    this.dispatch({
      type: 'transaction',
      state: newState,
      prevState,
      transaction
    });

    if (transaction.docChanged) {
      this.dispatch({
        type: 'update',
        state: newState,
        prevState,
        transaction
      });
    }
  }

  // Send the given steps to the server
  applyNewState(editState) {
    const sendable = sendableSteps(editState);

    if (sendable) {
      let data = {
        version: getVersion(editState),
        steps: sendable.steps.map((s) => {
          s.clientID = sendable.clientID || 0;
          return s.toJSON();
        }),
        clientID: sendable.clientID || 0,
        user: this.globalState.user.id
      };
      this.channel.trigger(`client-changes`, data);

      this.applySteps(
        sendable.steps,
        repeat(sendable.clientID, sendable.steps.length)
      );
    }
  }

  applySteps(steps, clientIDs) {
    this.view.dispatch(receiveTransaction(this.view.state, steps, clientIDs));
  }

  closeRequest() {
    if (this.cancelRequest) {
      this.cancelRequest();
    }
  }

  async run(config) {
    // const cancelToken = new axios.CancelToken((c) => {
    //   this.cancelRequest = c;
    // });
    try {
      return await api.request(config);
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
    this.globalState.pusher.unsubscribe(this.channelName);
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

  debounce(fn, delay) {
    let timeout;
    return function(...args) {
      if (timeout) {
        clearTimeout(timeout);
      }
      timeout = setTimeout(() => {
        fn(...args);
        timeout = null;
      }, delay);
    };
  }
}

export default EditorConnection;
