import bluebird from 'bluebird';
import should from 'should';
import setup from '../support/setup';
import Queue from '../../src/lib/Queue';

describe('visibility', () => {
  let client;
  let queue;

  beforeEach(async () => {
    ({ client } = await setup());
    queue = new Queue(client, 'visibility', { visibility: 0.1 });
  });

  afterEach(async () => {
    await client.close();
  });

  it('checks is message is back in queue after visibility runs out', async () => {
    should(await queue.add('Hello, World!')).be.ok();
    should((await queue.get())[0]).be.ok();

    // wait a bit so the message goes back into the queue
    await bluebird.delay(150);

    // Fetch it again
    const msg = (await queue.get())[0];
    should(msg._id).be.ok();

    // ACK it
    await queue.ack(msg.ack);

    should((await queue.get())[0]).not.be.ok();
  });

  it("checks that a late ack doesn't remove the msg", async () => {
    should(await queue.add('Hello, World!')).be.ok();
    let msg = (await queue.get())[0];
    const oldAck = msg.ack;
    should(msg.ack).be.ok();

    // let it time out
    await bluebird.delay(150);
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
    msg = (await queue.get())[0];
    should(msg.ack).not.be.equal(oldAck);

    // and finalize
    await queue.ack(msg.ack);
    should((await queue.get())[0]).not.be.ok();
  });

  it('checks if message visibility overrides queue visibility', async () => {
    should(await queue.add('Hello, World!')).be.ok();
    let msg = (await queue.get(1, { visibility: 0.3 }))[0];
    should(msg._id).be.ok();

    // Wait for the regular visibility to run out
    await bluebird.delay(200);

    // This should not return anything
    msg = (await queue.get())[0];
    should(msg).not.be.ok();

    // wait a bit so the message goes back into the queue
    await bluebird.delay(200);

    // Now it should be there again
    msg = (await queue.get())[0];
    should(msg._id).be.ok();

    // ACK it
    await queue.ack(msg.ack);

    should((await queue.get())[0]).not.be.ok();
  });
});
