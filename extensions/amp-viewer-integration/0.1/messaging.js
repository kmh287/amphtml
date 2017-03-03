/**
 * Copyright 2016 The AMP HTML Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */


import {listen} from '../../../src/event-helper';
import {dev} from '../../../src/log';

const TAG = 'amp-viewer-messaging';
const APP = '__AMPHTML__';

/**
 * @enum {string}
 */
const MessageType = {
  REQUEST: 'q',
  RESPONSE: 's',
};

/**
 * @typedef {{
 *   app: string,
 *   type: string,
 *   requestid: number,
 *   name: string,
 *   data: *,
 *   rsvp: (boolean|undefined),
 *   error: (string|undefined),
 * }}
 */
export let Message;

/**
 * @typedef {function(string, *, boolean):(!Promise<*>|undefined)}
 */
export let RequestHandler;

/**
 * @fileoverview This class is a de-facto implementation of MessagePort
 * from Channel Messaging API:
 * https://developer.mozilla.org/en-US/docs/Web/API/Channel_Messaging_API
 */
export class WindowPortEmulator {
  /**
   * @param {!Window} win
   * @param {string} origin
   */
  constructor(win, origin) {
    /** @const {!Window} */
    this.win = win;
    /** @private {string} */
    this.origin_ = origin;
  }

  /**
   * @param {string} eventType
   * @param {function(!Event):undefined} handler
   */
  addEventListener(eventType, handler) {
    listen(this.win, 'message', e => {
      if (e.origin == this.origin_ &&
          e.source == this.win.parent && e.data.app == APP) {
        handler(e);
      }
    });
  }

  /**
   * @param {Object} data
   */
  postMessage(data) {
    this.win.parent./*OK*/postMessage(data, this.origin_);
  }
  start() {
  }
}

/**
 * @fileoverview This is used in amp-viewer-integration.js for the
 * communication protocol between AMP and the viewer. In the comments, I will
 * refer to the communication as a conversation between me and Bob. The
 * messaging protocol should support both sides, but at this point I'm the
 * ampdoc and Bob is the viewer.
 */
export class Messaging {

  /**
   * Conversation (messaging protocol) between me and Bob.
   * @param {!Window} win
   * @param {!MessagePort|!WindowPortEmulator} port
   */
  constructor(win, port) {
    /** @const {!Window} */
    this.win = win;
    /** @const @private {!MessagePort|!WindowPortEmulator} */
    this.port_ = port;
    /** @private {!number} */
    this.requestIdCounter_ = 0;
    /** @private {!Object<number, {resolve: function(*), reject: function(!Error)}>} */
    this.waitingForResponse_ = {};
    /**
     * A map from message names to request handlers.
     * @private {!Object<string, !RequestHandler>}
     */
    this.messageHandlers_ = {};

    /** @private {?RequestHandler} */
    this.defaultHandler_ = null;

    this.port_.addEventListener('message', this.handleMessage_.bind(this));
    this.port_.start();
  }

  /**
   * Registers a method that will handle requests sent to the specified
   * message name.
   * @param {string} messageName The name of the message to handle.
   * @param {!RequestHandler} requestHandler
   */
  registerHandler(messageName, requestHandler) {
    this.messageHandlers_[messageName] = requestHandler;
  }

  /**
   * Unregisters the handler for the specified message name.
   * @param {string} messageName The name of the message to unregister.
   */
  unregisterHandler(messageName) {
    delete this.messageHandlers_[messageName];
  }

  /**
   * @param {?RequestHandler} requestHandler
   */
  setDefaultHandler(requestHandler) {
    this.defaultHandler_ = requestHandler;
  }

  /**
   * Bob sent me a message. I need to decide if it's a new request or
   * a response to a previous 'conversation' we were having.
   * @param {!Event} event
   * @private
   */
  handleMessage_(event) {
    dev().fine(TAG, 'AMPDOC got a message:', event.type, event.data);
    /** @type {Message} */
    const message = event.data;
    if (message.type == MessageType.REQUEST) {
      this.handleRequest_(message);
    } else if (message.type == MessageType.RESPONSE) {
      this.handleResponse_(message);
    }
  }

  /**
   * I'm sending Bob a new outgoing request.
   * @param {string} messageName
   * @param {*} messageData
   * @param {boolean} awaitResponse
   * @return {!Promise<*>|undefined}
   */
  sendRequest(messageName, messageData, awaitResponse) {
    dev().fine(TAG, 'sendRequest, event name: ', messageName);
    const requestId = ++this.requestIdCounter_;
    let promise = undefined;
    if (awaitResponse) {
      promise = new Promise((resolve, reject) => {
        this.waitingForResponse_[requestId] = {resolve, reject};
      });
    }
    this.sendMessage_({
      app: APP,
      requestid: requestId,
      type: MessageType.REQUEST,
      name: messageName,
      data: messageData,
      rsvp: awaitResponse,
    });
    return promise;
  }

  /**
   * I'm responding to a request that Bob made earlier.
   * @param {number} requestId
   * @param {string} messageName
   * @param {*} messageData
   * @private
   */
  sendResponse_(requestId, messageName, messageData) {
    dev().fine(TAG, 'sendResponse_');
    this.sendMessage_({
      app: APP,
      requestid: requestId,
      type: MessageType.RESPONSE,
      name: messageName,
      data: messageData,
    });
  }

  /**
   * @param {number} requestId
   * @param {string} messageName
   * @param {*} reason !Error most of time, string sometimes, * rarely.
   * @private
   */
  sendResponseError_(requestId, messageName, reason) {
    const errString = this.errorToString_(reason);
    this.logError_(
      TAG + ': sendResponseError_, Message name: ' + messageName, errString);
    this.sendMessage_({
      app: APP,
      requestid: requestId,
      type: MessageType.RESPONSE,
      name: messageName,
      data: null,
      error: errString,
    });
  }

  /**
   * @param {Message} message
   * @private
   */
  sendMessage_(message) {
    this.port_./*OK*/postMessage(message);
  }

  /**
   * I'm handing an incoming request from Bob. I'll either respond normally
   * (ex: "got it Bob!") or with an error (ex: "I didn't get a word of what
   * you said!").
   * @param {Message} message
   * @private
   */
  handleRequest_(message) {
    dev().fine(TAG, 'handleRequest_', message);

    let handler = this.messageHandlers_[message.name];
    if (!handler) {
      handler = this.defaultHandler_;
    }
    if (!handler) {
      throw new Error(
        'Cannot handle request because handshake is not yet confirmed!');
    }

    const promise = handler(message.name, message.data, !!message.rsvp);
    if (message.rsvp) {
      const requestId = message.requestid;
      if (!promise) {
        this.sendResponseError_(
          requestId, message.name, new Error('no response'));
        dev().assert(promise,
          'expected response but none given: ' + message.name);
      }
      promise.then(data => {
        this.sendResponse_(requestId, message.name, data);
      }, reason => {
        this.sendResponseError_(requestId, message.name, reason);
      });
    }
  }

  /**
   * I sent out a request to Bob. He responded. And now I'm handling that
   * response.
   * @param {Message} message
   * @private
   */
  handleResponse_(message) {
    dev().fine(TAG, 'handleResponse_');
    const requestId = message.requestid;
    const pending = this.waitingForResponse_[requestId];
    if (pending) {
      delete this.waitingForResponse_[requestId];
      if (message.error) {
        this.logError_(TAG + ': handleResponse_ error: ', message.error);
        pending.reject(
          new Error(`Request ${message.name} failed: ${message.error}`));
      } else {
        pending.resolve(message.data);
      }
    }
  }

  /**
   * @param {string} state
   * @param {!Error|string} opt_data
   * @private
   */
  logError_(state, opt_data) {
    let stateStr = 'amp-messaging-error-logger: ' + state;
    const dataStr = ' data: ' + this.errorToString_(opt_data);
    stateStr += dataStr;
    this.win['viewerState'] = stateStr;
  };

  /**
   * @param {*} err !Error most of time, string sometimes, * rarely.
   * @return {string}
   * @private
   */
  errorToString_(err) {
    return err ?
      (err.message ? err.message : String(err)) :
      'unknown error';
  }
}
