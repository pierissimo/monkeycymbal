import uuid = require('uuid/v4');
import pick = require('lodash/pick');
import times = require('lodash/times');
import merge = require('lodash/merge');
import bluebird = require('bluebird');
import { MongoClient, Collection } from 'mongodb';
import Debug = require('debug');
const debug = Debug('mongodb-promise-queue:queue');
// const debug = console.log;

const DEFAULT_OPTS = {
  visibility: 30,
  concurrency: 1,
  pollInterval: 0.05
};

export interface ISubscriptionOptions {
  visibility?: number;
  delay?: number;
  maxRetries?: number;
  expireAfterSeconds?: number | boolean;
  concurrency?: number;
  pollInterval?: number;
}

function now() {
  return new Date();
}

function nowPlusSecs(secs) {
  return new Date(Date.now() + secs * 1000);
}

export default class Queue {
  private status: 'idle' | 'started' | 'stopped';
  private pingIntervals: object = {};
  private busyConsumers: number = 0;
  private intervalHandles: any[] = [];
  private handler: Function;
  private collection: Collection;
  private options: ISubscriptionOptions;
  private collectionName: string;

  constructor(
    private client: MongoClient,
    private topic: string,
    private queueName: string,
    opts: ISubscriptionOptions = {}
  ) {
    this.options = merge({}, DEFAULT_OPTS, opts);
    this.collectionName = `${this.topic}_${this.queueName}`;
    this.collection = this.client.db().collection(this.collectionName);
  }

  async initialize() {
    await this.client.db().createCollection(this.collectionName);
    await this.createIndexes();
  }

  public async subscribe(messageHandler) {
    debug('subscribe');
    this.status = 'started';
    await this.initialize();
    this.handler = this.wrapHandler(messageHandler);

    const interval = setInterval(async () => {
      if (this.status !== 'started') return;

      const idleConsumers = this.options.concurrency - this.busyConsumers;
      debug(`subscribe: ${idleConsumers} idle consumers found on a pool of ${this.options.concurrency}`);

      if (!idleConsumers) {
        debug('subscribe: no consumers free, skipping');
        return null;
      }

      const messages = await this.getMany(idleConsumers);
      if (!messages.length) return null;
      // this.busyConsumers += messages.length;
      await bluebird.map(messages, msg => this.handler(msg));
    }, this.options.pollInterval * 1000);

    this.intervalHandles.push(interval);

    return this;
  }

  public async subscribeOld(messageHandler) {
    await this.initialize();
    this.handler = this.wrapHandler(messageHandler);
    times(this.options.concurrency, () => {
      const interval = setInterval(async () => {
        if (this.busyConsumers >= this.options.concurrency) {
          return null;
        }

        const msg = await this.get();
        if (!msg) return null;
        await this.handler(msg);
      }, this.options.pollInterval);

      this.intervalHandles.push(interval);
    });

    return this;
  }

  public subscribeWithChangeStream() {
    const pipeline = [
      /*{ $match: { 'fullDocument.username': 'alice' } },
      { $addFields: { newField: 'this is an added field!' } }*/
    ];

    const changeStream = this.collection.watch(pipeline);
    changeStream.on('change', (next, ...rest) => {
      debug(next, rest);
    });
  }

  public stop() {
    this.status = 'stopped';
    this.intervalHandles.forEach(clearInterval);
    this.intervalHandles = [];

    return this;
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
        // await this.startPinger(msg);
        const result = await handler(msg);
        // this.debug(`msg.result=${result}`);
        // await this.stopPinger(msg);
        return this.handleSuccess(msg, result);
      } catch (msgErr) {
        // await this.stopPinger(msg);
        return this.handleError(msg, msgErr);
      } finally {
        this.busyConsumers -= 1;
      }
    };
  }

  markAsStarted(msg) {
    return this.collection.findOneAndUpdate({ _id: msg._id }, { $set: { startedAt: new Date() } });
  }

  async handleSuccess(msg, result) {
    // this.debug(`Success - msg._id: ${msg._id}`);
    return this.ack(msg.ack, result);

    // return this.collection.findOneAndUpdate({ _id: msg._id }, { $set: { result, success: true } });
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
        throw err;
      }
    }, 1000);
  }

  stopPinger(msg) {
    const interval = this.pingIntervals[msg._id];
    clearInterval(interval);
  }

  async getMany(count, opts: ISubscriptionOptions = {}) {
    const visibility = opts.visibility || this.options.visibility;

    const query = {
      deletedAt: null,
      visible: { $lte: now() }
    };

    const sort = {
      _id: 1
    };

    const messages = await bluebird.map(times(count), async () => {
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

      return msg;
    });

    return messages.filter(m => m);

    // if we have a deadQueue, then check the tries, else don't
    /*if (this.options.deadQueueName) {
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
    }*/
  }

  async get(opts: ISubscriptionOptions = {}) {
    const visibility = opts.visibility || this.options.visibility;

    const query = {
      deletedAt: null,
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
    /*if (this.options.deadQueueName) {
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
    }*/

    return msg;
  }

  // ----------------------------------------------------------------------

  async ping(ack, opts: ISubscriptionOptions = {}) {
    /*await this.connect();*/
    const visibility = opts.visibility || this.options.visibility;

    const query = {
      ack,
      visible: { $gt: now() },
      deletedAt: null
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

  async ack(ack, result?: any) {
    /*await this.connect();*/
    const query = {
      ack,
      visible: { $gt: now() },
      deletedAt: null
    };

    const update = {
      $set: {
        deletedAt: now(),
        result
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

  async nack(ack, opts: ISubscriptionOptions = {}) {
    /*await this.connect();*/
    const delay = opts.delay || this.options.delay;

    const query = {
      ack,
      visible: { $gt: now() },
      deletedAt: null
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
    /*await this.connect();*/
    const query = {
      deletedAt: { $exists: true }
    };

    return await this.collection.deleteMany(query);
  }

  // ----------------------------------------------------------------------

  async total() {
    /*await this.connect();*/
    return await this.collection.countDocuments();
  }

  // ----------------------------------------------------------------------

  async size() {
    /*await this.connect();*/
    const query = {
      deletedAt: null,
      visible: { $lte: now() }
    };

    return await this.collection.countDocuments(query);
  }

  // ----------------------------------------------------------------------

  async inFlight() {
    /*await this.connect();*/
    const query = {
      ack: { $exists: true },
      visible: { $gt: now() },
      deletedAt: null
    };

    return await this.collection.countDocuments(query);
  }

  // ----------------------------------------------------------------------

  async done() {
    /*await this.connect();*/
    const query = {
      deletedAt: { $exists: true }
    };

    return await this.collection.countDocuments(query);
  }

  async createIndexes() {
    /*await this.connect();*/
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
}
