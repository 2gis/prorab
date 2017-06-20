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
        let payload = JSON.parse(event.data.payload);
        payload.type = event.data.type;
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

function getFunctionalParameter(func: () => void, paramName: string): string {
  return URL.createObjectURL(new Blob([
    'options["' + paramName, '"] = ', func.toString()
  ], {
      type: 'application/javascript'
    })
  );
}

declare var __webpack_modules__: { [key: string]: string };
function makeWebpackImports(imports: { [key: string]: string }): string[] {
  if (typeof __webpack_modules__ === 'undefined') {
    return [];
  }

  let procImports = [
    'var mod; var imported = {}; ' 
      + 'var resolver = function (moduleId) { return imports[imported[moduleId]]; };'
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
  for (let i in options) {
    if (typeof options[i] == 'function') {
      options[i] = getFunctionalParameter(options[i], i);
    }
  }

  worker.postMessage({
    type: 'init',
    options: options
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
    let payload = data.payload;
    if (controlObject.messageListeners[data.type]) {
      payload.type = data.type;
      controlObject.messageListeners[data.type](payload);
    }
  };

  return controlObject;
} 
