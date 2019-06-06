import should from 'should';
import times = require('lodash/times');
import Sinon = require('sinon');
import bluebird = require('bluebird');
import setup from '../support/setup';
import Queue from '../../src/lib/Queue';
// import Queue from '../../src/lib/Queue';

const sinon = Sinon.createSandbox();

describe('subscribe', () => {
  let client;
  let queue;

  beforeEach(async () => {
    ({ client } = await setup());
  });

  afterEach(async () => {
    await queue.pause();
    await client.close();
    sinon.restore();
  });

  it('with a concurrency of 10, it should process 50 messages in 5 batches', function(done) {
    this.timeout(10000);

    (async () => {
      let processed = 0;
      queue = new Queue(client, 'default', { concurrency: 10, pollInterval: 1 });
      await queue.subscribe(() => 'myResult');
      queue.on('completed', () => {
        processed += 1;
        if (processed === 50) {
          should(queue.get.callCount).be.equal(5);
          done();
        }
      });
      sinon.spy(queue, 'get');

      await bluebird.map(times(50), () => queue.add('Hello, World!'));
    })();
  });

  it('with a concurrency of 10, it should process 10 messages in 1 batches', function(done) {
    this.timeout(10000);

    (async () => {
      let processed = 0;
      queue = new Queue(client, 'default', { concurrency: 10, pollInterval: 1 });
      queue = await queue.subscribe(() => 'myResult');
      queue.on('completed', () => {
        processed += 1;
        if (processed === 10) {
          should(queue.get.callCount).be.equal(1);
          done();
        }
      });
      sinon.spy(queue, 'get');

      await bluebird.map(times(10), () => queue.add('Hello, World!'));
    })();
  });

  it('should process first messages with higher priority', done => {
    (async () => {
      let processed = 0;
      queue = new Queue(client, 'default', { concurrency: 1, pollInterval: 0.05 });
      await queue.subscribe(() => 'myResult', 'default');

      queue.on('completed', msg => {
        processed += 1;
        if (processed <= 3) {
          should(msg.priority).be.equal(3);
        } else {
          should(msg.priority).be.equal(1);
        }
        if (processed === 10) done();
      });
      sinon.spy(queue, 'get');

      await bluebird.map(times(10), index => {
        const priority = index <= 2 ? 3 : 1;
        return queue.add('Hello, World!', { priority });
      });
    })();
  });
});
