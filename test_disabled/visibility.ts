import bluebird from 'bluebird';
import setup from '../test/support/setup';
import MongoDbQueue from '../src/lib';

describe('visibility', () => {
  let client;
  let queue;

  beforeEach(async () => {
    ({ client } = await setup());
    queue = new MongoDbQueue(client, 'visibility', { visibility: 1 });
  });

  afterEach(async () => {
    await client.close();
  });

  it('checks is message is back in queue after visibility runs out', async () => {
    expect(await queue.publish('Hello, World!')).toBeDefined();
    expect(await queue.get()).toBeDefined();

    // wait a bit so the message goes back into the queue
    await bluebird.delay(1500);

    // Fetch it again
    const msg = await queue.get();
    expect(msg._id).toBeDefined();

    // ACK it
    await queue.ack(msg.ack);

    expect(await queue.get()).toBeUndefined();
  });

  it("checks that a late ack doesn't remove the msg", async () => {
    expect(await queue.publish('Hello, World!')).toBeDefined();
    let msg = await queue.get();
    const oldAck = msg.ack;
    expect(msg.ack).toBeDefined();

    // let it time out
    await bluebird.delay(1500);
    try {
      await queue.ack(oldAck);
      throw new Error('Successfully acked timed out message');
    } catch (e) {
      if (e.message === 'assert.fail()') {
        throw e;
      }
      // else ok
    }

    // fetch again, ack should now be different
    msg = await queue.get();
    expect(msg.ack).not.toBe(oldAck);

    // and finalize
    await queue.ack(msg.ack);
    expect(await queue.get()).toBeUndefined();
  });

  it('checks if message visibility overrides queue visibility', async () => {
    expect(await queue.publish('Hello, World!')).toBeDefined();
    let msg = await queue.get({ visibility: 0.3 });
    expect(msg._id).toBeDefined();

    // Wait for the regular visibility to run out
    await bluebird.delay(200);

    // This should not return anything
    msg = await queue.get();
    expect(msg).toBeUndefined();

    // wait a bit so the message goes back into the queue
    await bluebird.delay(200);

    // Now it should be there again
    msg = await queue.get();
    expect(msg._id).toBeDefined();

    // ACK it
    await queue.ack(msg.ack);

    expect(await queue.get()).toBeUndefined();
  });
});
