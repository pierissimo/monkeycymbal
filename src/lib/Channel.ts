import { Collection, MongoClient } from 'mongodb';
import _ = require('lodash');
import bluebird = require('bluebird');
import Queue, { ISubscriptionOptions } from './Queue';
import Debug = require('debug');
const debug = Debug('mongodb-promise-queue:channel');
// const debug = console.log;

interface IQueueOptions {
  deadQueueName?: string;
  visibility?: number;
  delay?: number;
}

interface IPublishOptions extends IQueueOptions {
  priority?: number;
}

const DEFAULT_OPTS = {
  delay: 0
};

function now() {
  return new Date();
}

function nowPlusSecs(secs) {
  return new Date(Date.now() + secs * 1000);
}

// the Queue object itself
export default class Channel {
  connectionUrl?: string;
  isConnected: boolean;

  topic: string;
  client: MongoClient;
  collection: Collection;
  options: IQueueOptions;

  constructor(mongoDb: MongoClient | string, topic, opts?: IQueueOptions) {
    this.topic = topic;
    this.options = _.merge({}, DEFAULT_OPTS, opts);

    if (typeof mongoDb === 'string') {
      this.connectionUrl = mongoDb;
    } else {
      this.client = mongoDb;
    }

    /*if (!this.options.deadQueueName) {
      delete this.options.maxRetries;
    }*/
  }

  async connect() {
    if (this.isConnected) return this.client;
    if (!this.client) {
      this.client = await MongoClient.connect(this.connectionUrl);
    }

    /*if (!this.collection) {
      this.collection = this.client.db().collection(this.topic);
    }*/

    /*if (!this.deadQueueCollection && this.options.deadQueueName) {
      this.deadQueueCollection = this.client.db().collection(this.options.deadQueueName);
    }*/

    if (!this.isConnected) {
      await this.client.connect();
      this.isConnected = this.client.isConnected();
    }

    return this.client;
  }

  // ----------------------------------------------------------------------

  public async publish(payload, opts: IPublishOptions = {}) {
    debug('publish %j with options %j', payload, opts);
    await this.connect();
    const allQueues = await this.client
      .db()
      .listCollections()
      .toArray();

    const regex = new RegExp(`${this.topic}_.+`);
    const queues = allQueues.filter(({ name }) => regex.test(name)).map(({ name }) => name);
    debug('found queues %j', queues);

    const delay = opts.delay || this.options.delay;
    const priority = opts.priority || 1;

    const createdAt = new Date();
    const visible = delay ? nowPlusSecs(delay) : now();

    const result = await bluebird.map(queues, async collectionName => {
      const collection = this.client.db().collection(collectionName);

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
      return result.insertedIds;
    });

    if (result.length !== 1) return result;

    return result[0];
  }

  subscribe(messageHandler, queueName = 'default', opts: ISubscriptionOptions): Promise<Queue> {
    /*await this.connect();*/
    const options = _.merge(
      {
        visibility: this.options.visibility,
        delay: this.options.delay
      },
      opts
    );

    const subscription = new Queue(this.client, this.topic, queueName, options);
    return subscription.subscribe(messageHandler);
  }
}
