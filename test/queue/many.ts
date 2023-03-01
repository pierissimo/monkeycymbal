import should from 'should';
import setup from '../support/setup';
import Queue from '../../src/lib/Queue';

const TOTAL = 250;

describe('many', function () {
  this.retries(3);
  let client;
  let queue;

  beforeEach(async () => {
    ({ client } = await setup());
  });

  afterEach(async () => {
    await client.close();
  });

  it('checks if many messages can be inserted at once and gotten back', async () => {
    queue = new Queue(client, 'many-1');
    const messagesToQueue = [];
    for (let i = 0; i < TOTAL; i += 1) {
      messagesToQueue.push(`no=${i}`);
    }

    const messageIds = await queue.add(messagesToQueue);
    should(messageIds.length).be.equal(TOTAL);
    const messages = [];
    let message;
    while ((message = (await queue.get())[0])) {
      messages.push(message);
    }

    // Should have received all messages now
    should(messages.length).be.equal(TOTAL);

    // ACK them
    for (message of messages) {
      await queue.ack(message.ack);
    }
  });

  it('checks if many messages can be inserted one after another and gotten back', async () => {
    queue = new Queue(client, 'many-2');
    const messageIds = [];
    for (let i = 0; i < TOTAL; i += 1) {
      messageIds.push(await queue.add(`no=${i}`));
    }
    should(messageIds.length).be.equal(TOTAL);

    const messages = [];
    let message;
    while ((message = (await queue.get())[0])) {
      messages.push(message);
    }

    // Should have received all messages now
    should(messages.length).be.equal(TOTAL);

    // ACK them
    for (message of messages) {
      await queue.ack(message.ack);
    }
  });

  it('should not be possible to add zero messages', async () => {
    queue = new Queue(client, 'many-3');
    try {
      await queue.add([]);
      throw new Error('Successfully added zero messages');
    } catch (e) {
      if (e.message === 'assert.fail()') {
        throw e;
      }
      // else ok
    }
  });
});
