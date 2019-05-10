import should from 'should';
import bluebird from 'bluebird';
import setup from '../support/setup';
import Queue from '../../src/lib/Queue';

describe('events', () => {
  let client;
  let queue;

  beforeEach(async () => {
    ({ client } = await setup());
  });

  afterEach(async () => {
    await queue.stop();
    await client.close();
  });

  it('listen to `added` event', done => {
    queue = new Queue(client, 'queue');
    queue.on('added', async msgId => {
      should(msgId).be.ok();
      const msg = await queue.collection.findOne({ _id: msgId });
      should(msg.payload).be.equal(payload);
      done();
    });
    const payload = 'Hello world';
    queue.add(payload);
  });

  it('listen to `active` then `completed` event', done => {
    queue = new Queue(client, 'queue');
    let isActive = false;
    queue.on('active', msg => {
      should(msg).be.ok();
      should(msg.payload).be.equal(payload);
      isActive = true;
    });
    queue.on('completed', msg => {
      should(msg).be.ok();
      should(msg.payload).be.equal(payload);
      should(msg.result).be.equal('result');
      should(isActive).be.True();
      done();
    });
    const payload = 'Hello world';
    queue.add(payload);
    queue.subscribe(() => 'result');
  });

  it('listen to `error` event', done => {
    queue = new Queue(client, 'queue');
    queue.on('error', msg => {
      should(msg).be.ok();
      should(msg.payload).be.equal(payload);
      should(msg.errors[0].error.message).be.equal('Bad error');
      done();
    });
    const payload = 'Hello world';
    queue.add(payload);
    queue.subscribe(() => {
      throw new Error('Bad error');
    });
  });

  it('listen to `died` event', done => {
    queue = new Queue(client, 'queue', { visibility: 0.08, maxRetries: 1 });
    queue.on('dead', msg => {
      should(msg).be.ok();
      should(msg.payload).be.equal(payload);
      should(msg.errors[0].error.message).be.equal('operation timed out');
      done();
    });
    const payload = 'Hello world';
    queue.add(payload);
    queue.subscribe(async () => {
      await bluebird.delay(900);
    });
  });
});
