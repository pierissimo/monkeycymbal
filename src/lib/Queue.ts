import uuid = require('uuid/v4');
import pick = require('lodash/pick');
import times = require('lodash/times');
import merge = require('lodash/merge');
import bluebird = require('bluebird');
import assert = require('assert');
import { MongoClient, Collection } from 'mongodb';
import { EventEmitter } from 'eventemitter3';
import Debug = require('debug');
import DateHelper from './DateHelper';
import { IAddMessageOptions, IMessage } from './types';

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

enum MessageEvent {
  wait = 'wait',
  active = 'active',
  completed = 'completed',
  failed = 'failed'
}

export default class Queue extends EventEmitter {
  private status: 'idle' | 'started' | 'stopped';
  private busyConsumers: number = 0;
  private intervalHandles: any[] = [];
  private handler: Function;
  private collection: Collection;
  private options: ISubscriptionOptions;
  private collectionName: string;

  constructor(private client: MongoClient, private queueName: string, opts: ISubscriptionOptions = {}) {
    super();
    assert.ok(queueName, 'QueueName is required');
    this.options = merge({}, DEFAULT_OPTS, opts);
    this.collectionName = this.queueName;
    this.collection = this.client.db().collection(this.collectionName);
  }

  public async initialize() {
    await this.client.db().createCollection(this.collectionName);
    await this.createIndexes();
  }

  public async add(payload, opts: IAddMessageOptions = {}) {
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
    const insertedIds = [];
    for (const key of Object.keys(result.insertedIds)) {
      const numericKey = +key;
      insertedIds[numericKey] = `${result.insertedIds[key]}`;
    }

    return insertedIds;
  }

  public async subscribe(messageHandler) {
    debug('subscribe');
    this.status = 'started';
    await this.initialize();
    this.handler = this.wrapHandler(messageHandler);
    this.setupPolling();

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

  public start() {
    this.setupPolling();
    this.status = 'started';

    return this;
  }

  public stop() {
    this.status = 'stopped';
    this.intervalHandles.forEach(clearInterval);
    this.intervalHandles = [];

    return this;
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

  private markAsStarted(msg) {
    return this.collection.findOneAndUpdate({ _id: msg._id }, { $set: { startedAt: new Date() } });
  }

  private async handleSuccess(msg, result) {
    // this.debug(`Success - msg._id: ${msg._id}`);
    const ackResult = await this.ack(msg.ack, result);
    this.emit(MessageEvent.completed, ackResult);

    return ackResult;

    // return this.collection.findOneAndUpdate({ _id: msg._id }, { $set: { result, success: true } });
  }

  private async handleError(msg, error) {
    const serializedError = pick(error, Object.getOwnPropertyNames(error));
    // this.debug(`Error - msg._id: ${msg._id}, error:`, serializedError);
    const errorItem = {
      date: new Date(),
      error: serializedError
    };

    const { value: errorResult } = await this.collection.findOneAndUpdate(
      { _id: msg._id },
      { $push: { errors: errorItem } },
      { returnOriginal: false }
    );

    this.emit(MessageEvent.failed, errorResult);

    return errorResult;
  }

  public async get(count: number = 1, opts: ISubscriptionOptions = {}): Promise<IMessage[]> {
    debug(`get: count ${count}, options: ${JSON.stringify(opts || {})}`);
    const visibility = opts.visibility || this.options.visibility;

    const now = DateHelper.now();

    const messages = await bluebird.map(
      times(count),
      async () => {
        const query = {
          deletedAt: null,
          visible: { $lte: now }
        };

        const sort = {
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
          returnOriginal: false
        });

        const msg = result.value;

        if (!msg) {
          // @ts-ignore
          return;
        }

        return msg;
      },
      { concurrency: 1 }
    );

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

  // ----------------------------------------------------------------------

  async ping(ack, opts: ISubscriptionOptions = {}) {
    /*await this.connect();*/
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
      returnOriginal: false
    });
    if (!msg.value) {
      throw new Error(`Queue.ack(): Unidentified ack : ${ack}`);
    }

    return msg.value;
  }
  // ----------------------------------------------------------------------

  async nack(ack, opts: ISubscriptionOptions = {}) {
    /*await this.connect();*/
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
        ack: ''
      }
    };

    const msg = await this.collection.findOneAndUpdate(query, update, {
      returnOriginal: false
    });
    if (!msg.value) {
      throw new Error(`Queue.nack(): Unidentified ack : ${ack}`);
    }

    return msg.value;
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
      visible: { $lte: DateHelper.now() }
    };

    return await this.collection.countDocuments(query);
  }

  // ----------------------------------------------------------------------

  async inFlight() {
    /*await this.connect();*/
    const query = {
      ack: { $exists: true },
      visible: { $gt: DateHelper.now() },
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
      this.collection.createIndex({ deletedAt: 1, visible: 1, createdAt: 1 }, { background: true }),
      this.collection.createIndex({ deletedAt: 1, visible: 1, priority: -1, createdAt: 1 }, { background: true }),
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

  public emit(event: MessageEvent, ...args: any[]): boolean {
    return super.emit(event, ...args);
  }
}
