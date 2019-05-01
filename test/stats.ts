import bluebird from 'bluebird';
import setup from './support/setup';
import MongoDbQueue from '../src/lib/index';

describe('stats', () => {
  let client;

  beforeEach(async () => {
    ({ client } = await setup());
  });

  afterEach(async () => {
    await client.close();
  });

  it('checks stats for a single message added, received and acked are correct', async () => {
    const queue = new MongoDbQueue(client, 'stats-1');

    // Initial state
    expect(await queue.total()).toBe(0);
    expect(await queue.size()).toBe(0);
    expect(await queue.inFlight()).toBe(0);
    expect(await queue.done()).toBe(0);

    // Adds a message
    expect(await queue.add('Hello, World!')).toBeDefined();
    expect(await queue.total()).toBe(1);
    expect(await queue.size()).toBe(1);
    expect(await queue.inFlight()).toBe(0);
    expect(await queue.done()).toBe(0);

    // Fetch it so it's now in flight
    const msg = await queue.get();
    expect(msg._id).toBeDefined();
    expect(await queue.total()).toBe(1);
    expect(await queue.size()).toBe(0);
    expect(await queue.inFlight()).toBe(1);
    expect(await queue.done()).toBe(0);

    // Ack it so it's done
    expect(await queue.ack(msg.ack)).toBeDefined();
    expect(await queue.total()).toBe(1);
    expect(await queue.size()).toBe(0);
    expect(await queue.inFlight()).toBe(0);
    expect(await queue.done()).toBe(1);

    // And clear it so it's not even done any more
    await queue.clean();
    expect(await queue.total()).toBe(0);
    expect(await queue.size()).toBe(0);
    expect(await queue.inFlight()).toBe(0);
    expect(await queue.done()).toBe(0);
  });

  it('checks stats for a single message added, received, timed out, received, pinged and acked are correct', async () => {
    const queue = new MongoDbQueue(client, 'stats-1', { visibility: 0.2 });
    let msg;

    // Initial state
    expect(await queue.total()).toBe(0);
    expect(await queue.size()).toBe(0);
    expect(await queue.inFlight()).toBe(0);
    expect(await queue.done()).toBe(0);

    // Adds a message
    expect(await queue.add('Hello, World!')).toBeDefined();
    expect(await queue.total()).toBe(1);
    expect(await queue.size()).toBe(1);
    expect(await queue.inFlight()).toBe(0);
    expect(await queue.done()).toBe(0);

    // Fetch it so it's now in flight
    msg = await queue.get();
    expect(msg._id).toBeDefined();
    expect(await queue.total()).toBe(1);
    expect(await queue.size()).toBe(0);
    expect(await queue.inFlight()).toBe(1);
    expect(await queue.done()).toBe(0);

    // Let it time out
    await bluebird.delay(2500);
    expect(await queue.total()).toBe(1);
    expect(await queue.size()).toBe(1);
    expect(await queue.inFlight()).toBe(0);
    expect(await queue.done()).toBe(0);

    // Fetch it again
    msg = await queue.get();
    expect(msg._id).toBeDefined();
    expect(await queue.total()).toBe(1);
    expect(await queue.size()).toBe(0);
    expect(await queue.inFlight()).toBe(1);
    expect(await queue.done()).toBe(0);

    // wait a bit then ping it
    await bluebird.delay(100);
    expect(await queue.ping(msg.ack)).toBeDefined();
    expect(await queue.total()).toBe(1);
    expect(await queue.size()).toBe(0);
    expect(await queue.inFlight()).toBe(1);
    expect(await queue.done()).toBe(0);

    // wait again, should still be in flight
    await bluebird.delay(100);
    expect(await queue.total()).toBe(1);
    expect(await queue.size()).toBe(0);
    expect(await queue.inFlight()).toBe(1);
    expect(await queue.done()).toBe(0);

    // NACK it so it's available again
    expect(await queue.nack(msg.ack)).toBeDefined();
    expect(await queue.total()).toBe(1);
    expect(await queue.size()).toBe(1);
    expect(await queue.inFlight()).toBe(0);
    expect(await queue.done()).toBe(0);

    // Fetch it again
    msg = await queue.get();
    expect(msg._id).toBeDefined();
    expect(await queue.total()).toBe(1);
    expect(await queue.size()).toBe(0);
    expect(await queue.inFlight()).toBe(1);
    expect(await queue.done()).toBe(0);

    // Ack it so it's done
    expect(await queue.ack(msg.ack)).toBeDefined();
    expect(await queue.total()).toBe(1);
    expect(await queue.size()).toBe(0);
    expect(await queue.inFlight()).toBe(0);
    expect(await queue.done()).toBe(1);

    // And clear it so it's not even done any more
    await queue.clean();
    expect(await queue.total()).toBe(0);
    expect(await queue.size()).toBe(0);
    expect(await queue.inFlight()).toBe(0);
    expect(await queue.done()).toBe(0);
  });
});
