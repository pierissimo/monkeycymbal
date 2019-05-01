import mongodb from 'mongodb';

const baseConnectionString = 'mongodb://localhost:27017/mongodb-queue';

export default async function() {
  const client = await mongodb.MongoClient.connect(baseConnectionString, { useNewUrlParser: true });
  // Setting db name = null ensures the library uses the name given in the URI
  const db = client.db(null);
  // let's empty out some collections to make sure there are no messages
  const collections = [
    'default',
    'delay',
    'multi',
    'visibility',
    'clean-1',
    'clean-2',
    'ping-1',
    'ping-2',
    'ping-3',
    'stats-1',
    'stats-2',
    'init',
    'indexes',
    'many-1',
    'many-2',
    'many-3',
    'nack',
    'deadQueue_queue-1',
    'deadQueue_dead-queue-1',
    'deadQueue_queue-2',
    'deadQueue_dead-queue-2'
  ];
  for (const collection of collections) {
    // @ts-ignore
    await db.collection(collection).deleteMany();
  }
  return { client, db };
}
