import should from 'should';
import times = require('lodash/times');
import Sinon = require('sinon');
import setup from '../support/setup';
import Channel from '../../src/lib/Channel';
// import Queue from '../../src/lib/Queue';

const sinon = Sinon.createSandbox();

describe('subscribe', () => {
  let client;
  let queue;
  let channel;

  beforeEach(async () => {
    ({ client } = await setup());
    channel = new Channel(client, 'myTopic');
  });

  afterEach(async () => {
    queue.stop();
    await client.close();
    sinon.restore();
  });

  it('with a concurrency of 10, it should process 50 messages in 5 batches', function(done) {
    this.timeout(10000);

    (async () => {
      let processed = 0;
      queue = await channel.subscribe(
        () => {
          process.nextTick(async () => {
            processed += 1;
            if (processed === 50) {
              should(queue.getMany.callCount).be.equal(5);
              done();
            }
          });

          return 'myResult';
        },
        'default',
        { concurrency: 10, pollInterval: 0.5 }
      );
      sinon.spy(queue, 'getMany');

      times(50, () => channel.publish('Hello, World!'));
    })();
  });

  it('with a concurrency of 100, it should process 100 messages in 1 batches', function(done) {
    this.timeout(10000);

    (async () => {
      let processed = 0;
      queue = await channel.subscribe(
        () => {
          process.nextTick(async () => {
            processed += 1;
            if (processed === 100) {
              should(queue.getMany.callCount).be.equal(1);
              done();
            }
          });

          return 'myResult';
        },
        'default',
        { concurrency: 100, pollInterval: 1 }
      );
      sinon.spy(queue, 'getMany');

      times(100, () => channel.publish('Hello, World!'));
    })();
  });
});
