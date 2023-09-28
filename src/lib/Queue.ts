import uuid = require('uuid/v4');
import pick = require('lodash/pick');
import times = require('lodash/times');
import merge = require('lodash/merge');
import bluebird = require('bluebird');
import assert = require('assert');
import { MongoClient, Collection, Sort } from 'mongodb';
import { EventEmitter } from 'eventemitter3';
import Debug = require('debug');
import DateHelper from './DateHelper';
import { IAddMessageOptions, IMessage } from './types';

const debug = Debug('mongodb-promise-queue:queue');

// const debug = console.log;

const DEFAULT_OPTS = {
  visibility: 30,
  concurrency: 1,
  pollInterval: 0.1,
  maxRetries: 5
};

export interface ISubscriptionOptions {
  visibility?: number;
  delay?: number;
  maxRetries?: number;
  expireAfterSeconds?: number | boolean;
  concurrency?: number;
  pollInterval?: number;
  deadQueue?: string | Queue;
}

enum MessageEvent {
  added = 'added',
  active = 'active',
  completed = 'completed',
  error = 'error',
  dead = 'dead'
}

export default class Queue extends EventEmitter {
  private initializePromise: Promise<void>;
  private connectionUrl?: string;
  client: MongoClient;
  private status: 'idle' | 'started' | 'stopped';
  private busyConsumers: number = 0;
  private intervalHandles: any[] = [];
  private handler: Function;
  public collection: Collection<IMessage>;
  private options: ISubscriptionOptions;
  private collectionName: string;
  public deadQueue?: Queue;

  constructor(mongoDb: MongoClient | string, private queueName: string, opts: ISubscriptionOptions = {}) {
    super();
    assert.ok(queueName, 'QueueName is required');
    this.options = merge({}, DEFAULT_OPTS, opts);
    this.collectionName = this.queueName;

    if (typeof mongoDb === 'string') {
      this.connectionUrl = mongoDb;
    } else {
      this.client = mongoDb;
    }
  }

  public async initialize() {
    if (typeof this.initializePromise !== 'undefined') return this.initializePromise;
    this.initializePromise = new Promise(async resolve => {
      if (!this.client) {
        this.client = await new MongoClient(this.connectionUrl).connect();
      }

      this.collection = this.client.db().collection(this.collectionName);
      const collectionExist = await this.doesCollectionExist(this.collectionName);
      if (!collectionExist) {
        await this.client.db().createCollection(this.collectionName);
      }

      if (this.options.deadQueue) {
        if (typeof this.options.deadQueue === 'string') {
          this.deadQueue = new Queue(this.client, this.options.deadQueue);
        } else if (this.options.deadQueue instanceof Queue) {
          this.deadQueue = this.options.deadQueue;
        } else {
          throw new Error('Invalid deadQueue configuration');
        }
      }
      await this.createIndexes();
      resolve();
    });

    return this.initializePromise;
  }

  public async add(payload, opts: IAddMessageOptions = {}) {
    await this.initialize();
    assert.ok(this.client, '');
    const delay = opts.delay || this.options.delay;
    const priority = opts.priority || 1;

    const createdAt = new Date();
    const visible = delay ? DateHelper.nowPlusSecs(delay) : DateHelper.now();
    const collection = this.client.db().collection(this.collectionName);

    const payloadArray = payload instanceof Array ? payload : [payload];
    // Insert many
    if (payloadArray.length === 0) {
      const errMsg = 'Queue.publish(): Array payload length must be greater than 0';
      throw new Error(errMsg);
    }
    const messages = payloadArray.map(payload => ({
      visible,
      createdAt,
      priority,
      payload
    }));
    const result = await collection.insertMany(messages);

    // These need to be converted because they're in a weird format.
    return Object.keys(result.insertedIds).reduce((acc, key) => {
      const numericKey = +key;
      acc[numericKey] = result.insertedIds[key];
      this.emit(MessageEvent.added, acc[numericKey]);
      return acc;
    }, []);
  }

  public async createRecord(data) {
    await this.initialize();
    return this.collection.insertOne(data);
  }

  public async subscribe(messageHandler) {
    debug('subscribe');
    this.status = 'started';
    await this.initialize();
    this.handler = this.wrapHandler(messageHandler);
    this.setupPolling();

    return this;
  }

  public resume() {
    this.setupPolling();
    this.status = 'started';

    return this;
  }

  public pause() {
    this.status = 'stopped';
    this.intervalHandles.forEach(clearInterval);
    this.intervalHandles = [];

    return this;
  }

  public async get(count: number = 1, opts: ISubscriptionOptions = {}): Promise<IMessage[]> {
    debug(`get: count ${count}, options: ${JSON.stringify(opts || {})}`);
    await this.initialize();
    const visibility = opts.visibility || this.options.visibility;
    const maxRetries = opts.maxRetries || this.options.maxRetries;

    const now = DateHelper.now();

    const messages = await bluebird.map(
      times(count),
      async () => {
        const query = {
          deletedAt: null,
          visible: { $lte: now }
        };

        const sort: Sort = {
          priority: -1,
          createdAt: 1
        };
        const update = {
          $inc: { tries: 1 },
          $set: {
            ack: uuid(),
            visible: DateHelper.nowPlusSecs(visibility)
          }
        };
        const result = await this.collection.findOneAndUpdate(query, update, {
          sort,
          returnDocument: 'after'
        });

        const msg = result.value;

        if (!msg) {
          // @ts-ignore
          return;
        }

        // if we have a deadQueue, then check the tries, else don't
        if (this.deadQueue && msg.tries > maxRetries) {
          // So:
          // 1) publish this message to the deadQueue
          // 2) ack this message from the regular queue
          // 3) call ourself to return a new message (if exists)
          await this.ack(msg.ack);
          if (this.deadQueue) {
            // check the tries
            await this.deadQueue.createRecord(msg);
          }
          // this.emit(MessageEvent.dead, msg);
          return (await this.get(1, opts))[0];
        }

        return msg as IMessage;
      },
      { concurrency: 1 }
    );

    return messages.filter(m => m);
  }

  // ----------------------------------------------------------------------

  public async ping(ack, opts: ISubscriptionOptions = {}) {
    await this.initialize();

    const visibility = opts.visibility || this.options.visibility;

    const query = {
      ack,
      visible: { $gt: DateHelper.now() },
      deletedAt: null
    };

    const update = {
      $set: {
        visible: DateHelper.nowPlusSecs(visibility)
      }
    };

    const msg = await this.collection.findOneAndUpdate(query, update, {
	    returnDocument: 'after'
    });
    if (!msg.value) {
      throw new Error(`Queue.ping(): Unidentified ack  : ${ack}`);
    }

    return `${msg.value._id}`;
  }

  // ----------------------------------------------------------------------

  public async ack(ack, result?: any) {
    await this.initialize();

    const query = {
      ack,
      visible: { $gt: DateHelper.now() },
      deletedAt: null
    };

    const update = {
      $set: {
        deletedAt: DateHelper.now(),
        result
      }
    };

    const msg = await this.collection.findOneAndUpdate(query, update, {
		  returnDocument: 'after'
    });
    if (!msg.value) {
      throw new Error(`Queue.ack(): Unidentified ack : ${ack}`);
    }

    return msg.value;
  }
  // ----------------------------------------------------------------------

  public async nack(ack, opts: ISubscriptionOptions = {}) {
    await this.initialize();

    const delay = opts.delay || this.options.delay;

    const query = {
      ack,
      visible: { $gt: DateHelper.now() },
      deletedAt: null
    };

    const update = {
      $set: {
        visible: DateHelper.nowPlusSecs(delay)
      },
      $unset: {
        ack: 1
      }
    };

    const msg = await this.collection.findOneAndUpdate(query, update, {
		  returnDocument: 'after'
    });
    if (!msg.value) {
      throw new Error(`Queue.nack(): Unidentified ack : ${ack}`);
    }

    return msg.value;
  }

  // ----------------------------------------------------------------------

  public async clean() {
    await this.initialize();

    const query = {
      deletedAt: { $exists: true }
    };

    return await this.collection.deleteMany(query);
  }

  // ----------------------------------------------------------------------

  public async totalCount() {
    await this.initialize();

    return await this.collection.countDocuments();
  }

  // ----------------------------------------------------------------------

  public async waitingCount() {
    await this.initialize();

    const query = {
      deletedAt: null,
      visible: { $lte: DateHelper.now() }
    };

    return await this.collection.countDocuments(query);
  }

  // ----------------------------------------------------------------------

  public async inFlightCount() {
    await this.initialize();

    const query = {
      ack: { $exists: true },
      visible: { $gt: DateHelper.now() },
      deletedAt: null
    };

    return await this.collection.countDocuments(query);
  }

  // ----------------------------------------------------------------------

  public async done() {
    await this.initialize();

    const query = {
      deletedAt: { $exists: true }
    };

    return await this.collection.countDocuments(query);
  }

  public emit(event: MessageEvent, ...args: any[]): boolean {
    return super.emit(event, ...args);
  }

  private setupPolling() {
    const interval = setInterval(async () => {
      if (this.status !== 'started') return;

      const idleConsumers = this.options.concurrency - this.busyConsumers;
      debug(`subscribe: ${idleConsumers} idle consumers found on a pool of ${this.options.concurrency}`);

      if (!idleConsumers) {
        debug('subscribe: no consumers free, skipping');
        return null;
      }

      const messages = await this.get(idleConsumers);
      if (!messages.length) return null;
      debug(`subscribe: got ${messages.length}`);
      this.busyConsumers += messages.length;
      await bluebird.map(messages, msg => this.handler(msg));
    }, this.options.pollInterval * 1000);

    this.intervalHandles.push(interval);
  }

  private wrapHandler(handler) {
    return async (msg): Promise<any> => {
      // this.debug(`msg._id: ${msg._id}`);
      // this.debug(`msg.ack: ${msg.ack}`);
      // this.debug(`msg.payload: ${msg.payload}`);
      // this.debug(`msg.tries: ${msg.tries}`);
      // this.debug(`busyConsumers: ${this.busyConsumers}`);
      // this.busyConsumers += 1;
      this.emit(MessageEvent.active, msg);
      try {
        if (!msg.tries || msg.tries === 1) {
          await this.markAsStarted(msg);
        }
        // await this.startPinger(msg);
        const result = await bluebird.try(() => handler(msg)).timeout(this.options.visibility * 1000);
        // this.debug(`msg.result=${result}`);
        // await this.stopPinger(msg);
        return this.handleSuccess(msg, result);
      } catch (msgErr) {
        // await this.stopPinger(msg);
        return this.handleError(msg, msgErr);
      } finally {
        const busyConsumers = this.busyConsumers - 1;
        this.busyConsumers = Math.max(busyConsumers, 0);
      }
    };
  }

  private markAsStarted(msg) {
    return this.collection.findOneAndUpdate({ _id: msg._id }, { $set: { startedAt: new Date() } });
  }

  private async handleSuccess(msg, result) {
    // this.debug(`Success - msg._id: ${msg._id}`);
    const ackResult = await this.ack(msg.ack, result);
    this.emit(MessageEvent.completed, ackResult, result);

    return ackResult;
  }

  private async handleError(msg, error) {
    const serializedError = pick(error, Object.getOwnPropertyNames(error));
    // this.debug(`Error - msg._id: ${msg._id}, error:`, serializedError);
    const errorItem = {
      date: new Date(),
      error: serializedError
    };

    const { value: updateMsg } = await this.collection.findOneAndUpdate(
      { _id: msg._id },
      { $push: { errors: errorItem } },
      { returnDocument: 'after' }
    );

    this.emit(MessageEvent.error, updateMsg, error);
    if (msg.tries > this.options.maxRetries) {
      this.emit(MessageEvent.dead, updateMsg);
    }

    return updateMsg;
  }

  public async createIndexes() {
    const indexPromises = [
      this.collection.createIndex({ deletedAt: 1, visible: 1 }, { background: true }),
      this.collection.createIndex({ deletedAt: 1, createdAt: 1, visible: 1 }, { background: true }),
      this.collection.createIndex({ deletedAt: 1, priority: -1, createdAt: 1, visible: 1 }, { background: true }),
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

  private async doesCollectionExist(name) {
    const collections = await this.client.db().listCollections({ name }).toArray();
    return collections.length > 0;
  }
}
