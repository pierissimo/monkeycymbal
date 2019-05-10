import bluebird from 'bluebird';
import should from 'should';
import setup from '../support/setup';
import Queue from '../../src/lib/Queue';

describe('delay', function() {
  let client;

  beforeEach(async () => {
    ({ client } = await setup());
  });

  afterEach(async () => {
    await client.close();
  });

  it('checks if messages in a delayed queue are returned after the delay', async () => {
    const queue = new Queue(client, 'delay', { delay: 0.2 });
    let msg;

    const origId = await queue.add('Hello, World!');
    should(origId).be.ok();

    // This message should not be there yet
    msg = (await queue.get())[0];
    should(msg).not.be.ok();
    await bluebird.delay(250);

    // Now it should be there
    msg = (await queue.get())[0];
    should(msg).be.ok();
    should(msg._id.toString()).be.equal(origId.toString());
    await queue.ack(msg.ack);

    // No more messages, but also no errors
    msg = (await queue.get())[0];
    should(msg).not.be.ok();
  });

  it('checks if a per-message delay overrides the default delay', async () => {
    const queue = new Queue(client, 'delay');
    let msg;

    const origId = await queue.add('I am delayed by 0.2 seconds', { delay: 0.2 });
    should(origId).be.ok();

    // This message should not be there yet
    msg = (await queue.get())[0];
    should(msg).not.be.ok();
    await bluebird.delay(250);

    // Now it should be there
    msg = (await queue.get())[0];
    should(msg).be.ok();
    should(msg._id.toString()).be.equal(origId.toString());
    await queue.ack(msg.ack);

    // No more messages, but also no errors
    msg = (await queue.get())[0];
    should(msg).not.be.ok();
  });
});
