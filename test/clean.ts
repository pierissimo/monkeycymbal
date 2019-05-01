import setup from './support/setup';
import MongoDbQueue from '../src/lib/index';

describe('clean', () => {
  let client;
  let queue;

  beforeEach(async () => {
    ({ client } = await setup());
  });

  afterEach(async () => {
    await client.close();
  });

  it('checks clean does not change an empty queue', async () => {
    queue = new MongoDbQueue(client, 'clean-1');
    expect(await queue.size()).toEqual(0);
    expect(await queue.total()).toEqual(0);
    await queue.clean();
    expect(await queue.size()).toEqual(0);
    expect(await queue.total()).toEqual(0);
  });

  it('check only ACKed messages are deleted', async () => {
    queue = new MongoDbQueue(client, 'clean-2');
    expect(await queue.add('Hello, World!')).toBeDefined();
    await queue.clean();
    expect(await queue.size()).toEqual(1);
    expect(await queue.total()).toEqual(1);

    const msg = await queue.get();
    expect(msg._id).toBeDefined();
    expect(msg.payload).toEqual('Hello, World!');
    expect(await queue.size()).toEqual(0);
    expect(await queue.total()).toEqual(1);

    await queue.clean();
    expect(await queue.size()).toEqual(0);
    expect(await queue.total()).toEqual(1);

    expect(await queue.ack(msg.ack)).toBeDefined();
    expect(await queue.size()).toEqual(0);
    expect(await queue.total()).toEqual(1);

    await queue.clean();
    expect(await queue.size()).toEqual(0);
    expect(await queue.total()).toEqual(0);
  });
});
