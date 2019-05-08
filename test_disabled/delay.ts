import bluebird from 'bluebird';
import setup from '../test/support/setup';
import MongoDbQueue from '../src/lib';

describe('delay', function() {
  let client;

  beforeEach(async () => {
    ({ client } = await setup());
  });

  afterEach(async () => {
    await client.close();
  });

  it('checks if messages in a delayed queue are returned after the delay', async () => {
    const queue = new MongoDbQueue(client, 'delay', { delay: 0.2 });
    let msg;

    const origId = await queue.add('Hello, World!');
    expect(origId).toBeDefined();

    // This message should not be there yet
    msg = await queue.get();
    expect(msg).toBeUndefined();
    await bluebird.delay(250);

    // Now it should be there
    msg = await queue.get();
    expect(msg).toBeDefined();
    expect(msg._id.toString()).toBe(origId.toString());
    await queue.ack(msg.ack);

    // No more messages, but also no errors
    msg = await queue.get();
    expect(msg).toBeUndefined();
  });

  it('checks if a per-message delay overrides the default delay', async () => {
    const queue = new MongoDbQueue(client, 'delay');
    let msg;

    const origId = await queue.add('I am delayed by 0.2 seconds', { delay: 0.2 });
    expect(origId).toBeDefined();

    // This message should not be there yet
    msg = await queue.get();
    expect(msg).toBeUndefined();
    await bluebird.delay(250);

    // Now it should be there
    msg = await queue.get();
    expect(msg).toBeDefined();
    expect(msg._id.toString()).toBe(origId.toString());
    await queue.ack(msg.ack);

    // No more messages, but also no errors
    msg = await queue.get();
    expect(msg).toBeUndefined();
  });
});
