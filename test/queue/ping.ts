import should from 'should';
import bluebird from 'bluebird';
import setup from '../support/setup';
import Queue from '../../src/lib/Queue';

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
    queue = new Queue(client, 'ping-1', { visibility: 0.2 });
    should((await queue.add('Hello, World!'))[0]).be.ok();

    // Should get message back
    const msg = (await queue.get())[0];
    should(msg._id).be.ok();
    await bluebird.delay(100);

    // Ping it
    should(await queue.ping(msg.ack)).be.ok();
    await bluebird.delay(100);

    // ACK it
    should(await queue.ack(msg.ack)).be.ok();

    // Queue should now be empty
    should((await queue.get())[0]).not.be.ok();
  });

  it("makes sure an acked message can't be pinged again", async () => {
    queue = new Queue(client, 'ping-2', { visibility: 0.2 });
    should((await queue.add('Hello, World!'))[0]).be.ok();

    // Get it back
    const msg = (await queue.get())[0];
    should(msg._id).be.ok();

    // ACK it
    should(await queue.ack(msg.ack)).be.ok();

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
    queue = new Queue(client, 'ping-3', { visibility: 0.2 });
    should((await queue.add('Hello, World!'))[0]).be.ok();

    // Get it back
    let msg = (await queue.get())[0];
    should(msg._id).be.ok();
    await bluebird.delay(100);

    // ping it with a longer visibility
    should(await queue.ping(msg.ack, { visibility: 0.4 })).be.ok();
    // wait longer than queue visibility, but shorter than msg visibility
    await bluebird.delay(300);

    // Should not get a message
    should((await queue.get())[0]).not.be.ok();
    await bluebird.delay(150);

    // Should be available now
    msg = (await queue.get())[0];
    should(msg).be.ok();

    // And done.
    should(await queue.ack(msg.ack)).be.ok();
  });
});
