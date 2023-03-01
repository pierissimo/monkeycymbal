import should from 'should';
import { MongoClient } from 'mongodb';
import setup from '../support/setup';
import Queue from '../../src/lib/Queue';

describe('indexes', () => {
  let client: MongoClient;
  let queue: Queue

  beforeEach(async () => {
    ({ client } = await setup());
  });

  afterEach(async () => {
    await client.close();
  });

  it('checks if indexes are created without error', async () => {
    queue = new Queue(client, 'indexes', { expireAfterSeconds: 7200 });
    await queue.initialize();
    const indexNames = await queue.createIndexes();
    should(Array.isArray(indexNames)).be.True();
    should(indexNames).have.lengthOf(5);
    should(indexNames[0]).be.equal('deletedAt_1_visible_1');
    should(indexNames[1]).be.equal('deletedAt_1_createdAt_1_visible_1');
    should(indexNames[2]).be.equal('deletedAt_1_priority_-1_createdAt_1_visible_1');
    should(indexNames[3]).be.equal('ack_1');
    should(indexNames[4]).be.equal('deletedAt_1');
  });

  it('doesnt create the deletedAt index if the expireAfterSeconds option is false', async () => {
    queue = new Queue(client, 'indexes', { expireAfterSeconds: false });
    await queue.initialize();
    const indexNames = await queue.createIndexes();
    should(Array.isArray(indexNames)).be.true();
    should(indexNames).have.lengthOf(4);
    should(indexNames[0]).be.equal('deletedAt_1_visible_1');
    should(indexNames[1]).be.equal('deletedAt_1_createdAt_1_visible_1');
    should(indexNames[2]).be.equal('deletedAt_1_priority_-1_createdAt_1_visible_1');
    should(indexNames[3]).be.equal('ack_1');
  });
});
