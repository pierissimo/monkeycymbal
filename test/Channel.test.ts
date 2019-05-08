import should from 'should';
import { MongoClient, ObjectId } from 'mongodb';
import setup from './support/setup';
import Channel from '../src/lib/Channel';

describe('Channel', () => {
  let client;

  beforeEach(async () => {
    ({ client } = await setup());
  });

  afterEach(async () => {
    await client.close();
  });

  describe('instantiate', () => {
    it('should initialise correctly', async () => {
      const options = { delay: 1, visibility: 2 };
      const channel = new Channel(client, 'myTopic', options);
      should(channel.options).be.deepEqual(options);
      should(channel.topic).be.equal('myTopic');
      should(channel.client).be.instanceOf(MongoClient);
    });
  });

  describe('#connect', () => {
    it('should connect by passing a connection url', async () => {
      const channel = new Channel(process.env.MONGODB_URL, 'myTopic');
      const client = await channel.connect();
      should(client.isConnected()).be.True();
      should(channel.isConnected).be.True();
      should(client).be.instanceOf(MongoClient);
    });

    it('should connect by passing a mongodb client', async () => {
      const channel = new Channel(client, 'myTopic');
      const mClient = await channel.connect();
      should(mClient.isConnected()).be.True();
      should(channel.isConnected).be.True();
      should(mClient).be.instanceOf(MongoClient);
    });
  });

  describe('#publish', () => {
    it('should put a message in the queue', async () => {
      await client.db().createCollection('myTopic_myQueue');
      const channel = new Channel(client, 'myTopic');
      const msg = { test: 1 };
      const response = await channel.publish(msg);
      const item = await client
        .db()
        .collection('myTopic_myQueue')
        .findOne();

      should(response[0]).be.instanceOf(ObjectId);
      should(item._id.toString()).be.equal(response[0].toString());
      should(item.payload).be.deepEqual(msg);
    });
  });
});
