import bluebird from 'bluebird';
import setup from '../test/support/setup';
import MongoDbQueue from '../src/lib';

describe('dead queue', () => {
  let client;

  beforeEach(async () => {
    ({ client } = await setup());
  });

  afterEach(async () => {
    await client.close();
  });

  it('checks that a single message going over 5 tries appears on dead-queue', async () => {
    const queue = new MongoDbQueue(client, 'deadQueue_queue-1', {
      visibility: 0.1,
      deadQueueName: 'deadQueue_dead-queue-1'
    });
    let origId;
    let msg;

    origId = await queue.add('Hello, World!');
    expect(origId).toBeDefined();

    // First expiration
    msg = await queue.get();
    expect(msg).toBeDefined();
    expect(msg._id.toString()).toEqual(origId.toString());
    await bluebird.delay(150);

    // Second expiration
    msg = await queue.get();
    expect(msg).toBeDefined();
    expect(msg._id.toString()).toEqual(origId.toString());
    await bluebird.delay(150);

    // Third expiration
    msg = await queue.get();
    expect(msg).toBeDefined();
    expect(msg._id.toString()).toEqual(origId.toString());
    await bluebird.delay(150);

    // Fourth expiration
    msg = await queue.get();
    expect(msg).toBeDefined();
    expect(msg._id.toString()).toEqual(origId.toString());
    await bluebird.delay(150);

    // Fifth expiration
    msg = await queue.get();
    expect(msg).toBeDefined();
    expect(msg._id.toString()).toEqual(origId.toString());
    await bluebird.delay(150);

    // Message should now be on the dead queue
    msg = await queue.get();
    expect(msg).toBeUndefined();

    // ... where we should be able to get it
    msg = await queue.deadQueueCollection.findOne({});
    expect(msg).toBeDefined();
    expect(msg._id.toString()).toEqual(origId.toString());
    expect(msg.payload).toEqual('Hello, World!');
    expect(msg.tries).toEqual(6);
  });

  it('checks two messages, with first going over 3 tries', async () => {
    const queue = new MongoDbQueue(client, 'deadQueue_queue-2', {
      visibility: 0.1,
      deadQueueName: 'deadQueue_dead-queue-2',
      maxRetries: 3
    });
    let msg;
    let origId;
    let origId2;

    origId = await queue.add('Hello, World!');
    origId2 = await queue.add('Part II');

    // First expiration, returning first message
    msg = await queue.get();
    expect(msg).toBeDefined();
    expect(msg._id.toString()).toEqual(origId.toString());
    await bluebird.delay(150);

    // Second expiration
    msg = await queue.get();
    expect(msg).toBeDefined();
    expect(msg._id.toString()).toEqual(origId.toString());
    await bluebird.delay(150);

    // Third expiration
    msg = await queue.get();
    expect(msg).toBeDefined();
    expect(msg._id.toString()).toEqual(origId.toString());
    await bluebird.delay(150);

    // Should get second message now
    msg = await queue.get();
    expect(msg).toBeDefined();
    expect(msg._id.toString()).toEqual(origId2.toString());

    // Should get first message from deadQueue now
    msg = await queue.deadQueueCollection.findOne({});
    expect(msg).toBeDefined();
    expect(msg._id.toString()).toEqual(origId.toString());
    expect(msg.payload).toEqual('Hello, World!');
    expect(msg.tries).toEqual(4);
  });
});
