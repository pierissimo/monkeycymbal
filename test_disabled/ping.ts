import bluebird from 'bluebird';
import setup from '../test/support/setup';
import MongoDbQueue from '../src/lib';

describe('ping', () => {
  let client;
  let queue;

  beforeEach(async () => {
    ({ client } = await setup());
  });

  afterEach(async () => {
    await client.close();
  });

  it('checks if a retrieved message with a ping can still be acked', async () => {
    queue = new MongoDbQueue(client, 'ping-1', { visibility: 0.2 });
    expect(await queue.publish('Hello, World!')).toBeDefined();

    // Should get message back
    const msg = await queue.get();
    expect(msg._id).toBeDefined();
    await bluebird.delay(100);

    // Ping it
    expect(await queue.ping(msg.ack)).toBeDefined();
    await bluebird.delay(100);

    // ACK it
    expect(await queue.ack(msg.ack)).toBeDefined();

    // Queue should now be empty
    expect(await queue.get()).toBeUndefined();
  });

  it("makes sure an acked message can't be pinged again", async () => {
    queue = new MongoDbQueue(client, 'ping-2', { visibility: 0.2 });
    expect(await queue.publish('Hello, World!')).toBeDefined();

    // Get it back
    const msg = await queue.get();
    expect(msg._id).toBeDefined();

    // ACK it
    expect(await queue.ack(msg.ack)).toBeDefined();

    // Should not be possible
    try {
      await queue.ping(msg.ack);
      throw new Error('Successfully acked an already acked message');
    } catch (e) {
      if (e.message === 'assert.fail()') {
        throw e;
      }
      // else ok
    }
  });

  it('makes sure ping options override queue options', async () => {
    queue = new MongoDbQueue(client, 'ping-3', { visibility: 0.2 });
    expect(await queue.publish('Hello, World!')).toBeDefined();

    // Get it back
    let msg = await queue.get();
    expect(msg._id).toBeDefined();
    await bluebird.delay(100);

    // ping it with a longer visibility
    expect(await queue.ping(msg.ack, { visibility: 0.4 })).toBeDefined();
    // wait longer than queue visibility, but shorter than msg visibility
    await bluebird.delay(300);

    // Should not get a message
    expect(await queue.get()).toBeUndefined();
    await bluebird.delay(150);

    // Should be available now
    msg = await queue.get();
    expect(msg).toBeDefined();

    // And done.
    expect(await queue.ack(msg.ack)).toBeDefined();
  });
});
