import should from 'should';
import bluebird from 'bluebird';
import setup from '../support/setup';
import Queue from '../../src/lib/Queue';

describe('dead queue', () => {
  let client;

  beforeEach(async () => {
    ({ client } = await setup());
  });

  afterEach(async () => {
    await client.close();
  });

  it('checks that a single message going over 5 tries appears on dead-queue', async () => {
    const deadQueue = new Queue(client, 'deadQueue');
    const queue = new Queue(client, 'queue', {
      visibility: 0.1,
      deadQueue
    });
    let origId;
    let msg;

    origId = await queue.add('Hello, World!');
    should(origId).be.ok();

    // First expiration
    msg = (await queue.get())[0];
    should(msg).be.ok();
    should(msg._id.toString()).be.equal(origId.toString());
    await bluebird.delay(150);

    // Second expiration
    msg = (await queue.get())[0];
    should(msg).be.ok();
    should(msg._id.toString()).be.equal(origId.toString());
    await bluebird.delay(150);

    // Third expiration
    msg = (await queue.get())[0];
    should(msg).be.ok();
    should(msg._id.toString()).be.equal(origId.toString());
    await bluebird.delay(150);

    // Fourth expiration
    msg = (await queue.get())[0];
    should(msg).be.ok();
    should(msg._id.toString()).be.equal(origId.toString());
    await bluebird.delay(150);

    // Fifth expiration
    msg = (await queue.get())[0];
    should(msg).be.ok();
    should(msg._id.toString()).be.equal(origId.toString());
    await bluebird.delay(150);

    // Message should now be on the dead queue
    msg = (await queue.get())[0];
    should(msg).not.be.ok();

    // ... where we should be able to get it
    msg = await deadQueue.collection.findOne({});
    should(msg).be.ok();
    should(msg._id.toString()).be.equal(origId.toString());
    should(msg.payload).be.equal('Hello, World!');
    should(msg.tries).be.equal(6);
  });

  it('checks two messages, with first going over 3 tries', async () => {
    const deadQueue = new Queue(client, 'deadQueue');
    const queue = new Queue(client, 'queue', {
      visibility: 0.1,
      deadQueue,
      maxRetries: 3
    });
    let msg;
    let origId;
    let origId2;

    origId = await queue.add('Hello, World!');
    origId2 = await queue.add('Part II');

    // First expiration, returning first message
    msg = (await queue.get())[0];
    should(msg).be.ok();
    should(msg._id.toString()).be.equal(origId.toString());
    await bluebird.delay(150);

    // Second expiration
    msg = (await queue.get())[0];
    should(msg).be.ok();
    should(msg._id.toString()).be.equal(origId.toString());
    await bluebird.delay(150);

    // Third expiration
    msg = (await queue.get())[0];
    should(msg).be.ok();
    should(msg._id.toString()).be.equal(origId.toString());
    await bluebird.delay(150);

    // Should get second message now
    msg = (await queue.get())[0];
    should(msg).be.ok();
    should(msg._id.toString()).be.equal(origId2.toString());

    // Should get first message from deadQueue now
    msg = await deadQueue.collection.findOne({});
    should(msg).be.ok();
    should(msg._id.toString()).be.equal(origId.toString());
    should(msg.payload).be.equal('Hello, World!');
    should(msg.tries).be.equal(4);
  });

  it('should initialize a deadQueue by passing a queue name', async () => {
    const queue = new Queue(client, 'queue', {
      deadQueue: 'deadQueue'
    });

    await queue.initialize();
    should(queue.deadQueue).be.instanceOf(Queue);
  });
});
