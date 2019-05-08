import mongodb = require('mongodb');

process.env.MONGODB_URL = 'mongodb://localhost:27017/mongodb-queue';
process.env.DEBUG = 'mongdb-promise-queue*';

export default async () => {
  const client = await mongodb.MongoClient.connect(process.env.MONGODB_URL, { useNewUrlParser: true });
  // Setting db name = null ensures the library uses the name given in the URI
  const db = client.db(null);
  await db.dropDatabase();
  return { client, db };
};
