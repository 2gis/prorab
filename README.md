## Prorab: web worker abstraction library

**Prorab** is a small library providing thin abstraction layer on web worker interface to make easier creation of and interaction with web workers. It's written in typescript entirely, but compiled javascript version is also included.

### Workflow

First, create some function, that will be executed inside web worker global scope, like this:

```
let workerFunc = function () {
  // This is a web worker global scope!
  
  console.log('Hello from worker!');
  
  this.registerMsgHandler('ping', (payload: any) => {
  
    console.log('received ping with ', payload);
    
    this.send({
      type: 'pong',
      payload: { some: 'data' }
    });
    
  });
};

```

Second, import worker creator function:

```
import { createWorker } from 'prorab';
```

Third, create your worker and add some message handling to it:

```
let control = createWorker(workerFunc, {})
  .registerMsgHandler('pong', (pl: any) => {
    console.log('Received PONG!', pl);
  });
```

Here you go, the worker is already up and running. Push some messages to it and see if it responses well:

```
control.send({
  type: 'ping',
  payload: {
    some: 'input'
  }
});
```

`send` function on both ends is a function that initiates a message to another end. It has an only object parameter with fields `type` and `payload`:
- `type` must be a string. It is and identifier of message type, that also is passed to `registerMsgHandler` first parameter.
- `payload` may be any serializable value.

Likewise, `registerMsgHandler` function on both ends is a receiver function, its second parameter is a callback function, which receives `payload` as its only parameter.

### Passing options into worker

Second parameter in `createWorker` is a hash map of some values to be transferred into worker global scope. See example below:

```
let workerFunc = function () {
  setTimeout(() => console.log('Hey, we\'ve got some options!', this.options), 0);
};

let control = createWorker(workerFunc, {
  opt1: 'value1'
});

```

Options are located in `this.options`, but only in next tick. You should not rely on any option in worker function itself, but you can use the `setTimeout(() => {}, 0)` trick if you really need. Previous example will output something like:
```
Hey, we've got some options! Object { "opt1": "value1" }
```

Options can be any serializable object. This means it should not contain things like:
- Circular references,
- Native code members,
- References to DOM nodes,
- References to internal APIs like localStorage, XMLHttpRequest, etc.

Also, it has basic support of passing functions inside a worker, with some limitations:
- Function should not depend on any context (actually, it may depend, but it just will not work as expected),
- Functional properties in nested objects will produce error as they are not handled explicitly. So only first-level members are handled correctly.

More advanced example:

```
let workerFunc = function () {
  setTimeout(() => {
    console.log('Hey, we\'ve got some functional options! They output: ', this.options.double(5)); // Will output "10"
  }, 0);
};

let control = createWorker(workerFunc, {
  double: (i) => i * 2,
  nested: {
    triple: (i) => i * 3 // Warning! This will throw an exception!
  }
});

```

### Sharing webpack modules to worker

When used within webpack, **Prorab** uses third parameter in `createWorker` to pass hash map of raw webpack module ids to pass into worker. Not every module may be successfully shared with worker, in particular:
- If module is not precompiled, it will not work unless it consists of a single source file,
- If module is precompiled, but it depends on some other modules via `require`, it will not work,
- If module depends on some binary nodejs extensions or is a binary module itself, it will not work,
- If module depends on any internal APIs that are not supported inside web workers, it will not work.

Module IDs should be resolved with `require.resolve`. Hash map keys are names to place module into when passsing to global worker scope, values are modules IDs. See an example of passing `axios` library into worker:

```
  // Axios should be aliased in webpack config, or it won't work:
  ...
  resolve: {
    alias: {
      'axios': path.resolve(__dirname, '..', 'node_modules/axios/dist/axios.min.js')
    }
  }
  ...
```

```
let workerFunc = function () {
  setTimeout(() => {
    this.imports.axiosInWorker('http://localhost:3000')
      .then((e: any) => { console.log('Axios got reply: ', e); })
      .catch((_e: any) => { debugger; });
  }, 0);
};

let control = createWorker(workerFunc, {}, {
  'axiosInWorker': require.resolve('axios')
});
```

Webpack module will be accessible with `this.imports` in global worker scope. Like options, imported modules should not be used in current tick.
