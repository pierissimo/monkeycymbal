/*
import uuid = require('uuid/v4');
import { Collection, MongoClient, ObjectId } from 'mongodb';
import merge = require('lodash/merge');
import pick = require('lodash/pick');
import times = require('lodash/times');
import bluebird = require('bluebird');
import debug = require('debug');

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
  concurrency?: number;
  pollInterval?: number;
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
  expireAfterSeconds: ONE_WEEK,
  concurrency: 10,
  pollInterval: 0.05
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

  private pingIntervals: object = {};
  private busyConsumers: number = 0;

  private intervals: [any];

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
        const errMsg = 'Queue.publish(): Array payload length must be greater than 0';
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

    const result = await this.collection.findOneAndUpdate(query, update, {
      sort,
      returnOriginal: false
    });
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
        // 1) publish this message to the deadQueue
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

    const msg = await this.collection.findOneAndUpdate(query, update, {
      returnOriginal: false
    });
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

    const msg = await this.collection.findOneAndUpdate(query, update, {
      returnOriginal: false
    });
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

    const msg = await this.collection.findOneAndUpdate(query, update, {
      returnOriginal: false
    });
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

  async waitingCount() {
    await this.connect();
    const query = {
      deleted: null,
      visible: { $lte: now() }
    };

    return await this.collection.countDocuments(query);
  }

  // ----------------------------------------------------------------------

  async inFlightCount() {
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

  async subscribe(messageHandler) {
    await this.connect();
    return this.startConsuming(messageHandler);
  }

  async startConsuming(messageHandler) {
    const handler = this.wrapHandler(messageHandler);
    times(this.options.concurrency, () => {
      const interval = setInterval(async () => {
        if (this.busyConsumers >= this.options.concurrency) {
          return null;
        }

        const msg = await this.get();
        await handler(msg);
      }, this.options.pollInterval);

      this.intervals.push(interval);
    });
  }

  wrapHandler(handler) {
    return async (msg): Promise<any> => {
      // this.debug(`msg._id: ${msg._id}`);
      // this.debug(`msg.ack: ${msg.ack}`);
      // this.debug(`msg.payload: ${msg.payload}`);
      // this.debug(`msg.tries: ${msg.tries}`);
      // this.debug(`busyConsumers: ${this.busyConsumers}`);
      this.busyConsumers += 1;
      try {
        if (!msg.tries || msg.tries === 1) {
          await this.markAsStarted(msg);
        }
        await this.startPinger(msg);
        const result = await handler(msg);
        // this.debug(`msg.result=${result}`);
        await this.stopPinger(msg);
        return this.handleSuccess(msg, result);
      } catch (msgErr) {
        await this.stopPinger(msg);
        return this.handleError(msg, msgErr);
      } finally {
        this.busyConsumers = this.busyConsumers - 1;
      }
    };
  }

  markAsStarted(msg) {
    return this.collection.findOneAndUpdate({ _id: msg._id }, { $set: { startedAt: new Date() } });
  }

  async handleSuccess(msg, result) {
    await this.ack(msg);
    // this.debug(`Success - msg._id: ${msg._id}`);
    return this.collection.findOneAndUpdate({ _id: msg._id }, { $set: { result, success: true } });
  }

  handleError(msg, error) {
    const serializedError = pick(error, Object.getOwnPropertyNames(error));
    // this.debug(`Error - msg._id: ${msg._id}, error:`, serializedError);
    const errorItem = {
      date: new Date(),
      error: serializedError
    };

    return this.collection.findOneAndUpdate({ _id: msg._id }, { $push: { errors: errorItem } });
  }

  startPinger(msg) {
    this.pingIntervals[msg._id] = setInterval(() => {
      try {
        const id = this.ping(msg.ack);
        return id;
      } catch (err) {
        // this.debug(`error while pinging msg with id: ${msg._id}: %O`, err);
      }
    }, 1000);
  }

  stopPinger(msg) {
    const interval = this.pingIntervals[msg._id];
    clearInterval(interval);
  }
}

// ----------------------------------------------------------------------

module.exports = MongoDbQueue;
*/
