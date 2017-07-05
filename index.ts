export interface WorkerControlObject {
  worker: Worker;
  messageListeners: { [key: string]: Function };
  registerMsgHandler: (eventType: string, handler: Function) => WorkerControlObject;
  dropMsgHandler: (eventType: string) => WorkerControlObject;
  send: ({ type, payload }: { type: string, payload: any }) => WorkerControlObject;
}

export type WorkerCreator = (
  mainFunc: () => void,
  options: { [key: string]: any },
  webpackImports?: { [key: string]: string }
) => WorkerControlObject;

export type GlobalSend = ({ type, payload }: { type: string, payload?: any }) => void;

function workerInit() {
  this.msgHandlers = {};
  this.options = {};
  this.imports = {};

  this.registerMsgHandler = (handlerName: string, handler: (payload: { [key: string]: any }) => void) => {
    if (!this.msgHandlers[handlerName]) {
      this.msgHandlers[handlerName] = handler;
    }
  };

  this.dropMsgHandler = (handlerName: string) => {
    delete this.msgHandlers[handlerName];
  };

  this.send = (message: any) => {
    this.postMessage(JSON.stringify(message));
  };

  self.onmessage = (event) => {
    switch (event.data.type) {
      case 'init':
        for (let i in event.data.options) {
          let elem = event.data.options[i];
          if (elem && elem.substr && elem.substr(0, 4) == 'blob') {
            importScripts(elem);
          } else {
            this.options[i] = elem;
          }
        }
        break;
      default:
        let payload = JSON.parse(event.data.payload) || {};
        if (this.msgHandlers[event.data.type]) {
          this.msgHandlers[event.data.type](payload);
        }
    }
  }
}

function getMainFunc(func: () => void, umdImports: string[]): string {
  return URL.createObjectURL(new Blob([
    '(', workerInit.toString(), ')();',
    '(', func.toString(), ')();'
  ].concat(umdImports), {
      type: 'application/javascript'
    })
  );
}

// Replace calls to functions in current context to allow multiple functions to be passed inside.
function replaceContext(funcStr: string, context: string[]) {
  return context.reduce((acc, val) => {
    return acc.replace(new RegExp(val + '\\s*\\(', 'g'), 'options.' + val + '(')
      .replace('function options.', 'function '); // declarations should not be replaced
  }, funcStr);
}

function prepareOptions(options: { [key: string]: any }) {
  let prepared: { [key: string]: string } = {};
  for (let i in options) {
    if (typeof options[i] == 'function') { // Explicitly handle functions in first-level
      prepared[i] = URL.createObjectURL(new Blob(
        ['options["' + i + '"] = ', replaceContext(options[i].toString(), Object.keys(options))],
        { type: 'application/javascript' }
      ));
    } else {
      prepared[i] = options[i];
    }
  }

  return prepared;
}

declare var __webpack_modules__: { [key: string]: string };
function makeWebpackImports(imports: { [key: string]: string }): string[] {
  if (typeof __webpack_modules__ === 'undefined') {
    return [];
  }

  let procImports = [
    'var mod; var imported = {}; '
    + 'var resolver = function (moduleId) { if (!imports[imported[moduleId]]) { '
    + 'throw new Error("Import " + moduleId + " (mapped to " + imported[moduleId] + ") cannot be found. You may try to '
    + 'reorder your imports, to load all dependencies before any dependent imports '
    + 'to fix this."); } return imports[imported[moduleId]]; };'
    + 'resolver.d = function(target, member, value) { setTimeout(function() { target[member] = value(); }, 0); };'
  ];

  for (let i in imports) {
    procImports.push(
      'var mod = {exports: {}}; (' + __webpack_modules__[imports[i]]
      + ')(mod, mod.exports, resolver); '
      + 'imports["' + i + '"] = mod.exports; '
      + 'imported[' + imports[i] + '] = "' + i + '";'
    );
  }

  return procImports;
}

export const createWorker: WorkerCreator = (mainFunc, options, webpackImports) => {
  let worker = new Worker(getMainFunc(mainFunc, makeWebpackImports(webpackImports || {})));
  worker.postMessage({
    type: 'init',
    options: prepareOptions(options)
  });

  let controlObject: WorkerControlObject = {
    worker,
    messageListeners: {},

    registerMsgHandler: (eventType, handler) => {
      if (!controlObject.messageListeners[eventType]) {
        controlObject.messageListeners[eventType] = handler;
      }
      return controlObject;
    },

    dropMsgHandler: (eventType) => {
      delete controlObject.messageListeners[eventType];
      return controlObject;
    },

    send: ({ type, payload }) => {
      worker.postMessage({
        type,
        payload: JSON.stringify(payload)
      });
      return controlObject;
    }
  };

  worker.onmessage = function (e) {
    let data = JSON.parse(e.data);
    let payload = data.payload || {};
    if (controlObject.messageListeners[data.type]) {
      controlObject.messageListeners[data.type](payload);
    }
  };

  return controlObject;
} 
