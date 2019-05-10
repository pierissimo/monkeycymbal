import bluebird from 'bluebird';
import should from 'should';
import setup from '../support/setup';
import Queue from '../../src/lib/Queue';

describe('stats', () => {
  let client;

  beforeEach(async () => {
    ({ client } = await setup());
  });

  afterEach(async () => {
    await client.close();
  });

  it('checks stats for a single message added, received and acked are correct', async () => {
    const queue = new Queue(client, 'stats-1');

    // Initial state
    should(await queue.total()).be.equal(0);
    should(await queue.size()).be.equal(0);
    should(await queue.inFlight()).be.equal(0);
    should(await queue.done()).be.equal(0);

    // Adds a message
    should(await queue.add('Hello, World!')).be.ok();
    should(await queue.total()).be.equal(1);
    should(await queue.size()).be.equal(1);
    should(await queue.inFlight()).be.equal(0);
    should(await queue.done()).be.equal(0);

    // Fetch it so it's now in flight
    const msg = (await queue.get())[0];
    should(msg._id).be.ok();
    should(await queue.total()).be.equal(1);
    should(await queue.size()).be.equal(0);
    should(await queue.inFlight()).be.equal(1);
    should(await queue.done()).be.equal(0);

    // Ack it so it's done
    should(await queue.ack(msg.ack)).be.ok();
    should(await queue.total()).be.equal(1);
    should(await queue.size()).be.equal(0);
    should(await queue.inFlight()).be.equal(0);
    should(await queue.done()).be.equal(1);

    // And clear it so it's not even done any more
    await queue.clean();
    should(await queue.total()).be.equal(0);
    should(await queue.size()).be.equal(0);
    should(await queue.inFlight()).be.equal(0);
    should(await queue.done()).be.equal(0);
  });

  it('checks stats for a single message added, received, timed out, received, pinged and acked are correct', async () => {
    const queue = new Queue(client, 'stats-1', { visibility: 0.2 });
    let msg;

    // Initial state
    should(await queue.total()).be.equal(0);
    should(await queue.size()).be.equal(0);
    should(await queue.inFlight()).be.equal(0);
    should(await queue.done()).be.equal(0);

    // Adds a message
    should(await queue.add('Hello, World!')).be.ok();
    should(await queue.total()).be.equal(1);
    should(await queue.size()).be.equal(1);
    should(await queue.inFlight()).be.equal(0);
    should(await queue.done()).be.equal(0);

    // Fetch it so it's now in flight
    msg = (await queue.get())[0];
    should(msg._id).be.ok();
    should(await queue.total()).be.equal(1);
    should(await queue.size()).be.equal(0);
    should(await queue.inFlight()).be.equal(1);
    should(await queue.done()).be.equal(0);

    // Let it time out
    await bluebird.delay(250);
    should(await queue.total()).be.equal(1);
    should(await queue.size()).be.equal(1);
    should(await queue.inFlight()).be.equal(0);
    should(await queue.done()).be.equal(0);

    // Fetch it again
    msg = (await queue.get())[0];
    should(msg._id).be.ok();
    should(await queue.total()).be.equal(1);
    should(await queue.size()).be.equal(0);
    should(await queue.inFlight()).be.equal(1);
    should(await queue.done()).be.equal(0);

    // wait a bit then ping it
    await bluebird.delay(100);
    should(await queue.ping(msg.ack)).be.ok();
    should(await queue.total()).be.equal(1);
    should(await queue.size()).be.equal(0);
    should(await queue.inFlight()).be.equal(1);
    should(await queue.done()).be.equal(0);

    // wait again, should still be in flight
    await bluebird.delay(100);
    should(await queue.total()).be.equal(1);
    should(await queue.size()).be.equal(0);
    should(await queue.inFlight()).be.equal(1);
    should(await queue.done()).be.equal(0);

    // NACK it so it's available again
    should(await queue.nack(msg.ack)).be.ok();
    should(await queue.total()).be.equal(1);
    should(await queue.size()).be.equal(1);
    should(await queue.inFlight()).be.equal(0);
    should(await queue.done()).be.equal(0);

    // Fetch it again
    msg = (await queue.get())[0];
    should(msg._id).be.ok();
    should(await queue.total()).be.equal(1);
    should(await queue.size()).be.equal(0);
    should(await queue.inFlight()).be.equal(1);
    should(await queue.done()).be.equal(0);

    // Ack it so it's done
    should(await queue.ack(msg.ack)).be.ok();
    should(await queue.total()).be.equal(1);
    should(await queue.size()).be.equal(0);
    should(await queue.inFlight()).be.equal(0);
    should(await queue.done()).be.equal(1);

    // And clear it so it's not even done any more
    await queue.clean();
    should(await queue.total()).be.equal(0);
    should(await queue.size()).be.equal(0);
    should(await queue.inFlight()).be.equal(0);
    should(await queue.done()).be.equal(0);
  });
});
