import should from 'should';
import times = require('lodash/times');
import Sinon = require('sinon');
import bluebird = require('bluebird');
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
    await queue.stop();
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
        { concurrency: 10, pollInterval: 1 }
      );
      sinon.spy(queue, 'getMany');

      await bluebird.map(times(50), () => channel.publish('Hello, World!'));
    })();
  });

  it('with a concurrency of 10, it should process 10 messages in 1 batches', function(done) {
    this.timeout(10000);

    (async () => {
      let processed = 0;
      queue = await channel.subscribe(
        () => {
          process.nextTick(async () => {
            processed += 1;
            if (processed === 10) {
              should(queue.getMany.callCount).be.equal(1);
              done();
            }
          });

          return 'myResult';
        },
        'default',
        { concurrency: 10, pollInterval: 1 }
      );

      sinon.spy(queue, 'getMany');

      await bluebird.map(times(10), () => channel.publish('Hello, World!'));
    })();
  });
});
