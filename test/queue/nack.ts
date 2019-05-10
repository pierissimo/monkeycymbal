import bluebird from 'bluebird';
import should from 'should';
import setup from '../support/setup';
import Queue from '../../src/lib/Queue';

describe('nack', () => {
  let client;
  let queue;

  beforeEach(async () => {
    ({ client } = await setup());
    queue = new Queue(client, 'nack');
  });

  afterEach(async () => {
    await client.close();
  });

  it('checks nack functionality', async () => {
    should(await queue.add('Hello, World!')).be.ok();
    let msg = (await queue.get())[0];
    should(msg._id).be.ok();

    // nack msg -> put it back into queue
    should(await queue.nack(msg.ack)).be.ok();

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
    msg = (await queue.get())[0];
    should(msg._id).be.ok();

    // now ack it
    should(await queue.ack(msg.ack)).be.ok();
  });

  it('checks nack with delay functionality', async () => {
    should(await queue.add('Hello, World!')).be.ok();
    let msg = (await queue.get())[0];
    should(msg._id).be.ok();

    // nack msg -> put it back into queue
    should(await queue.nack(msg.ack, { delay: 0.2 })).be.ok();

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
    should((await queue.get(msg.ack))[0]).not.be.ok();
    await bluebird.delay(200);

    // Now, fetching it again should work
    msg = (await queue.get())[0];
    should(msg._id).be.ok();

    // now ack it
    should(await queue.ack(msg.ack)).be.ok();
  });
});
