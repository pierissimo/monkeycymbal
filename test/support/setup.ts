import {MongoClient} from "mongodb";

process.env.MONGODB_URL = 'mongodb://localhost:27017/mongodb-queue';

export default async () => {
  const client = await new MongoClient(process.env.MONGODB_URL).connect();
  // Setting db name = null ensures the library uses the name given in the URI
  const db = client.db(null);
  await db.dropDatabase();
  return { client, db };
};
