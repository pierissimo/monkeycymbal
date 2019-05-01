import setup from './support/setup';
import MongoDbQueue from '../src/lib/index';

describe('default', () => {
  let client;
  let queue;

  beforeEach(async () => {
    ({ client } = await setup());
    queue = new MongoDbQueue(client, 'default');
  });

  afterEach(async () => {
    await client.close();
  });

  it('checks default functionality', async () => {
    expect(await queue.add('Hello, World!')).toBeDefined();
    const msg = await queue.get();
    expect(typeof msg._id.toString()).toBe('string');
    expect(typeof msg.ack).toBe('string');
    expect(typeof msg.tries).toBe('number');
    expect(msg.tries).toBe(1);
    expect(msg.payload).toBe('Hello, World!');

    expect(await queue.ack(msg.ack)).toBeDefined();

    // Try to ack twice
    try {
      await queue.ack(msg.ack);
      throw new Error('Message was successfully ACKed twice');
    } catch (e) {
      if (e.message === 'assert.fail()') {
        throw e;
      }
      // else ok
    }
  });
});
