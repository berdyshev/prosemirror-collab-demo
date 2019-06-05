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
    this.state = null;
    this.backOff = 0;
    this.view = null;
    this.dispatch = this.dispatch.bind(this);
    this.container = document.getElementById('editor');

    this.channelName = `private-collab-${globalState.currentArticle}`;
    this.channel = globalState.pusher.subscribe(this.channelName);
  }

  // All state changes go through this
  async dispatch(action) {
    console.group('dispatch');
    console.log('action', action);

    let newEditState = null;
    if (action.type == 'loaded') {
      // info.users.textContent = userString(action.users); // FIXME ewww
      newEditState = EditorState.create({
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
    } else if (action.type == 'transaction') {
      newEditState = this.state.apply(action.transaction);
    }
    console.log('next state', newEditState);

    if (newEditState) {
      if (
        !this.state ||
        this.state.selection.head !== newEditState.selection.head
      ) {
        this.channel.trigger(`client-cursor`, {
          position: newEditState.selection.head,
          user: this.globalState.user
        });
      }

      const sendable = this.sendable(newEditState);
      this.state = newEditState;
      if (sendable) {
        this.send(newEditState, sendable);
      }
    }

    // Sync the editor with this.state
    if (this.state) {
      if (this.view) this.view.updateState(this.state);
      else
        this.setView(
          new EditorView(this.container, {
            state: this.state,
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

    this.channel.bind('changes', (data) => {
      const tr = receiveTransaction(
        this.state,
        data.steps.map((j) => Step.fromJSON(schema, j)),
        data.clientIDs
      );
      this.dispatch({
        type: 'transaction',
        transaction: tr
      });
    });
    this.channel.bind('client-cursor', (cursorData) => {
      const transaction = this.state.tr;
      transaction.setMeta(cursor, { type: 'receive', cursor: cursorData });
      this.dispatch({ type: 'transaction', transaction });
    });
  }

  sendable(editState) {
    let steps = sendableSteps(editState);
    if (steps) {
      return { steps };
    }
  }

  // Send the given steps to the server
  async send(editState, { steps, ...other }) {
    try {
      let data = {
        version: getVersion(editState),
        steps: steps ? steps.steps.map((s) => s.toJSON()) : [],
        clientID: steps ? steps.clientID : 0,
        // pass connection socket_id on order to not receive own updates.
        socketId: this.globalState.pusher.connection.socket_id,
        ...other
      };
      await this.run({
        url: `/collab/events/${this.globalState.currentArticle}`,
        method: 'POST',
        data
      });
    } catch (err) {
      if (err.status == 409) {
        // The client's document conflicts with the server's version.
        // Poll for changes and then try again.
        console.error('Bad version');
      } else if (badVersion(err)) {
        this.report.failure(err.message);
      }
      return;
    }
    this.report.success();
    let tr = steps
      ? receiveTransaction(
          this.state,
          steps.steps,
          repeat(steps.clientID, steps.steps.length)
        )
      : this.state.tr;
    this.dispatch({
      type: 'transaction',
      transaction: tr
    });
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
}

export default EditorConnection;
