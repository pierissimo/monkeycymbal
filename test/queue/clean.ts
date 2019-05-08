import should from 'should';
import setup from '../support/setup';
import Channel from '../../src/lib/Channel';
import Queue from '../../src/lib/Queue';

describe('clean', () => {
  let client;
  let queue;
  let channel;

  beforeEach(async () => {
    ({ client } = await setup());
    channel = new Channel(client, 'myTopic');
  });

  afterEach(async () => {
    await client.close();
  });

  it('checks clean does not change an empty queue', async () => {
    queue = new Queue(client, 'myTopic_queue');
    await queue.initialize();
    should(await queue.size()).be.equal(0);
    should(await queue.total()).be.equal(0);
    await queue.clean();
    should(await queue.size()).be.equal(0);
    should(await queue.total()).be.equal(0);
  });

  it('check only ACKed messages are deleted', async () => {
    queue = new Queue(client, 'myTopic_queue');
    await queue.initialize();
    should(await channel.publish('Hello, World!')).be.ok();
    await queue.clean();
    should(await queue.size()).be.equal(1);
    should(await queue.total()).be.equal(1);

    const msg = await queue.get();
    should(msg._id).be.ok();
    should(msg.payload).be.equal('Hello, World!');
    should(await queue.size()).be.equal(0);
    should(await queue.total()).be.equal(1);

    await queue.clean();
    should(await queue.size()).be.equal(0);
    should(await queue.total()).be.equal(1);

    should(await queue.ack(msg.ack)).be.ok();
    should(await queue.size()).be.equal(0);
    should(await queue.total()).be.equal(1);

    await queue.clean();
    should(await queue.size()).be.equal(0);
    should(await queue.total()).be.equal(0);
  });
});
