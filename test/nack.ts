import bluebird from 'bluebird';
import setup from './support/setup';
import MongoDbQueue from '../src/lib/index';

describe('nack', () => {
  let client;
  let queue;

  beforeEach(async () => {
    ({ client } = await setup());
    queue = new MongoDbQueue(client, 'nack');
  });

  afterEach(async () => {
    await client.close();
  });

  it('checks nack functionality', async () => {
    expect(await queue.add('Hello, World!')).toBeDefined();
    let msg = await queue.get();
    expect(msg._id).toBeDefined();

    // nack msg -> put it back into queue
    expect(await queue.nack(msg.ack)).toBeDefined();

    // ACKing it should not work now
    try {
      await queue.ack(msg.ack);
      throw new Error('Message was successfully ACKed after being NACKed');
    } catch (e) {
      if (e.message === 'assert.fail()') {
        throw e;
      }
      // else ok
    }
    // NACKing it should not work now
    try {
      await queue.nack(msg.ack);
      throw new Error('Message was successfully NACKed after being NACKed');
    } catch (e) {
      if (e.message === 'assert.fail()') {
        throw e;
      }
      // else ok
    }

    // But fetching it again should work now
    msg = await queue.get();
    expect(msg._id).toBeDefined();

    // now ack it
    expect(await queue.ack(msg.ack)).toBeDefined();
  });

  it('checks nack with delay functionality', async () => {
    expect(await queue.add('Hello, World!')).toBeDefined();
    let msg = await queue.get();
    expect(msg._id).toBeDefined();

    // nack msg -> put it back into queue
    expect(await queue.nack(msg.ack, { delay: 0.2 })).toBeDefined();

    // ACKing it should not work now
    try {
      await queue.ack(msg.ack);
      throw new Error('Message was successfully ACKed after being NACKed');
    } catch (e) {
      if (e.message === 'assert.fail()') {
        throw e;
      }
      // else ok
    }
    // NACKing it should not work now
    try {
      await queue.nack(msg.ack);
      throw new Error('Message was successfully NACKed after being NACKed');
    } catch (e) {
      if (e.message === 'assert.fail()') {
        throw e;
      }
      // else ok
    }
    // getting should not work now
    expect(await queue.get(msg.ack)).toBeUndefined();
    await bluebird.delay(200);

    // Now, fetching it again should work
    msg = await queue.get();
    expect(msg._id).toBeDefined();

    // now ack it
    expect(await queue.ack(msg.ack)).toBeDefined();
  });
});
