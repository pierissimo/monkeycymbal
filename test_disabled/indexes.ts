import setup from '../test/support/setup';
import MongoDbQueue from '../src/lib';

describe('indexes', () => {
  let client;
  let queue;

  beforeEach(async () => {
    ({ client } = await setup());
  });

  afterEach(async () => {
    await client.close();
  });

  it('checks if indexes are created without error', async () => {
    queue = new MongoDbQueue(client, 'indexes');
    const indexNames = await queue.createIndexes();
    expect(Array.isArray(indexNames)).toBeTruthy();
    expect(indexNames).toHaveLength(3);
    expect(indexNames[0]).toBe('deletedAt_1_visible_1');
    expect(indexNames[1]).toBe('ack_1');
    expect(indexNames[2]).toBe('deletedAt_1');
  });

  it('doesnt create the deletedAt index if the expireAfterSeconds option is false', async () => {
    queue = new MongoDbQueue(client, 'indexes', { expireAfterSeconds: false });
    const indexNames = await queue.createIndexes();
    expect(Array.isArray(indexNames)).toBeTruthy();
    expect(indexNames).toHaveLength(2);
    expect(indexNames[0]).toBe('deletedAt_1_visible_1');
    expect(indexNames[1]).toBe('ack_1');
  });
});
