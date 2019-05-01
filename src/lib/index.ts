import uuid = require('uuid/v4');
import { Collection, MongoClient } from 'mongodb';
import merge = require('lodash/merge');
import bluebird = require('bluebird');

function now() {
  return new Date();
}

function nowPlusSecs(secs) {
  return new Date(Date.now() + secs * 1000);
}

interface IOptions {
  deadQueueName?: string;
  visibility?: number;
  delay?: number;
  maxRetries?: number;
  expireAfterSeconds?: number | boolean;
}

interface IDynamicOptions {
  delay?: number;
  visibility?: number;
}

const ONE_WEEK = 60 * 60 * 24 * 7;

const DEFAULT_OPTS = {
  visibility: 30,
  delay: 0,
  maxRetries: 5,
  expireAfterSeconds: ONE_WEEK
};

// the Queue object itself
export default class MongoDbQueue {
  connectionUrl?: string;
  isConnected: boolean;

  queueName: string;
  client: MongoClient;
  collection: Collection;
  deadQueueCollection: Collection;
  options: IOptions;

  constructor(mongoDb: MongoClient | string, queueName, opts?: IOptions) {
    this.queueName = queueName;
    this.options = merge({}, DEFAULT_OPTS, opts);

    if (typeof mongoDb === 'string') {
      this.connectionUrl = mongoDb;
    } else {
      this.client = mongoDb;
    }

    if (!this.options.deadQueueName) {
      delete this.options.maxRetries;
    }
  }

  async connect() {
    if (this.isConnected) return this.client;

    if (!this.client) {
      this.client = await MongoClient.connect(this.connectionUrl);
    }

    if (!this.collection) {
      this.collection = this.client.db().collection(this.queueName);
    }

    if (!this.deadQueueCollection && this.options.deadQueueName) {
      this.deadQueueCollection = this.client.db().collection(this.options.deadQueueName);
    }

    if (!this.isConnected) {
      await this.client.connect();
      this.isConnected = this.client.isConnected();
    }

    return this.client;
  }

  // ----------------------------------------------------------------------

  async createIndexes() {
    await this.connect();
    const indexPromises = [
      this.collection.createIndex({ deletedAt: 1, visible: 1 }, { background: true }),
      this.collection.createIndex({ ack: 1 }, { unique: true, sparse: true, background: true })
    ];
    if (this.options.expireAfterSeconds && typeof this.options.expireAfterSeconds === 'number') {
      indexPromises.push(
        this.collection.createIndex(
          { deletedAt: 1 },
          { expireAfterSeconds: this.options.expireAfterSeconds, background: true }
        )
      );
    }

    return bluebird.all(indexPromises);
  }

  // ----------------------------------------------------------------------

  async add(payload, opts: IDynamicOptions = {}) {
    await this.connect();
    const delay = opts.delay || this.options.delay;
    const visible = delay ? nowPlusSecs(delay) : now();

    if (payload instanceof Array) {
      // Insert many
      if (payload.length === 0) {
        const errMsg = 'Queue.add(): Array payload length must be greater than 0';
        throw new Error(errMsg);
      }
      const messages = payload.map(payload => {
        return {
          visible,
          payload
        };
      });
      const result = await this.collection.insertMany(messages);

      // These need to be converted because they're in a weird format.
      const insertedIds = [];
      for (const key of Object.keys(result.insertedIds)) {
        const numericKey = +key;
        insertedIds[numericKey] = `${result.insertedIds[key]}`;
      }

      return insertedIds;
    }
    // insert one
    const result = await this.collection.insertOne({
      visible,
      payload
    });
    return result.insertedId;
  }

  // ----------------------------------------------------------------------

  async get(opts: IDynamicOptions = {}) {
    await this.connect();
    const visibility = opts.visibility || this.options.visibility;

    const query = {
      deleted: null,
      visible: { $lte: now() }
    };

    const sort = {
      _id: 1
    };

    const update = {
      $inc: { tries: 1 },
      $set: {
        ack: uuid(),
        visible: nowPlusSecs(visibility)
      }
    };

    const result = await this.collection.findOneAndUpdate(query, update, { sort, returnOriginal: false });
    const msg = result.value;

    if (!msg) {
      // @ts-ignore
      return;
    }

    // if we have a deadQueue, then check the tries, else don't
    if (this.options.deadQueueName) {
      // check the tries
      if (msg.tries > this.options.maxRetries) {
        // So:
        // 1) add this message to the deadQueue
        // 2) ack this message from the regular queue
        // 3) call ourself to return a new message (if exists)
        await this.deadQueueCollection.insertOne(msg);
        await this.ack(msg.ack);
        return await this.get(opts);
      }
    }

    return msg;
  }

  // ----------------------------------------------------------------------

  async ping(ack, opts: IDynamicOptions = {}) {
    await this.connect();
    const visibility = opts.visibility || this.options.visibility;

    const query = {
      ack,
      visible: { $gt: now() },
      deleted: null
    };

    const update = {
      $set: {
        visible: nowPlusSecs(visibility)
      }
    };

    const msg = await this.collection.findOneAndUpdate(query, update, { returnOriginal: false });
    if (!msg.value) {
      throw new Error(`Queue.ping(): Unidentified ack  : ${ack}`);
    }

    return `${msg.value._id}`;
  }

  // ----------------------------------------------------------------------

  async ack(ack) {
    await this.connect();
    const query = {
      ack,
      visible: { $gt: now() },
      deleted: null
    };

    const update = {
      $set: {
        deleted: now()
      }
    };

    const msg = await this.collection.findOneAndUpdate(query, update, { returnOriginal: false });
    if (!msg.value) {
      throw new Error(`Queue.ack(): Unidentified ack : ${ack}`);
    }

    return `${msg.value._id}`;
  }
  // ----------------------------------------------------------------------

  async nack(ack, opts: IDynamicOptions = {}) {
    await this.connect();
    const delay = opts.delay || this.options.delay;

    const query = {
      ack,
      visible: { $gt: now() },
      deleted: null
    };

    const update = {
      $set: {
        visible: nowPlusSecs(delay)
      },
      $unset: {
        ack: ''
      }
    };

    const msg = await this.collection.findOneAndUpdate(query, update, { returnOriginal: false });
    if (!msg.value) {
      throw new Error(`Queue.nack(): Unidentified ack : ${ack}`);
    }

    return `${msg.value._id}`;
  }

  // ----------------------------------------------------------------------

  async clean() {
    await this.connect();
    const query = {
      deleted: { $exists: true }
    };

    return await this.collection.deleteMany(query);
  }

  // ----------------------------------------------------------------------

  async total() {
    await this.connect();
    return await this.collection.countDocuments();
  }

  // ----------------------------------------------------------------------

  async size() {
    await this.connect();
    const query = {
      deleted: null,
      visible: { $lte: now() }
    };

    return await this.collection.countDocuments(query);
  }

  // ----------------------------------------------------------------------

  async inFlight() {
    await this.connect();
    const query = {
      ack: { $exists: true },
      visible: { $gt: now() },
      deleted: null
    };

    return await this.collection.countDocuments(query);
  }

  // ----------------------------------------------------------------------

  async done() {
    await this.connect();
    const query = {
      deleted: { $exists: true }
    };

    return await this.collection.countDocuments(query);
  }
}

// ----------------------------------------------------------------------

module.exports = MongoDbQueue;
