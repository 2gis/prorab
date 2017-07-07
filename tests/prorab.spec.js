var assert = require('assert');
var prorab = require('../dist/index.min.js');
var createWorker = prorab.createWorker;

describe('Prorab worker manager', () => {
  it('Creates basic worker & allows simple communication', (done) => {
    let workerFun = function () {
      registerMsgHandler('ping', () => send({ type: 'pong' }));
    };
    
    let ctrl = createWorker(workerFun, {}, {})
        .registerMsgHandler('pong', () => done());

    ctrl.send({ type: 'ping' });
  });

  it('Allows payload in messages', (done) => {
    let workerFun = function () {
      registerMsgHandler('ping', (payload) => send({
        type: 'pong',
        payload: { from: 'worker', original: payload }
      }));
    };
    
    let ctrl = createWorker(workerFun, {}, {})
        .registerMsgHandler('pong', (payload) => {
          assert.deepEqual(payload, {
            from: 'worker',
            original: {
              from: 'mainthread'
            }
          });
          done();
        });

    ctrl.send({ type: 'ping', payload: { from: 'mainthread' } });
  });

  it('Allows functions in payload', (done) => {
    let workerFun = function () {
      registerMsgHandler('ping', (payload) => send({
        type: 'pong',
        payload: { result: options.fun(7) }
      }));
    };
    
    let ctrl = createWorker(workerFun, {
      fun: (i) => i*i 
    }, {})
        .registerMsgHandler('pong', (payload) => {
          assert.equal(49, payload.result);
          done();
        });

    ctrl.send({ type: 'ping', payload: { from: 'mainthread' } });
  });
});
