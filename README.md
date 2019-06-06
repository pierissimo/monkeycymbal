
<div align="center">
  <br/>
  <!--<img src="./support/logo@2x.png" width="300" />-->
  <br/>
  <br/>
  <h2>Monkey Cymbal</h2>
  <p>
    Production ready, MongoDB-based queue for Node.
  </p>
  <br/>
  <br/>
  <p>
    <a href="https://circleci.com/gh/pierissimo/monkeycymbal">
      <img src="https://img.shields.io/circleci/build/github/pierissimo/monkeycymbal.svg"/>
    </a>
    <a href="https://codecov.io/gh/pierissimo/monkeycymbal">
      <img src="https://img.shields.io/circleci/pierissimo/monkeycymbal/master.svg"/>
    </a>
  </p>
</div>


---

### Features
 
- [x] Delayed jobs
- [x] Retries
- [x] Dead queue
- [x] Priority
- [x] Concurrency
- [x] Pause/resume processing
- [x] Optional Topic based publishing (publish into multiple queues)
- [x] Low CPU usage
- [x] Able to process around 1000 messages per second (tested on Macbook Pro 13-inch, 2017, concurrency set to 150)

---

### Install

```bash
npm install monkeycymbal --save
```
or

```bash
yarn add monkeycymbal
```

**Requirements:** Monkey Cymbal requires MongoDB


---

### Quick Guide

#### Basic Usage

```typescript
import { Queue } from 'monkeycymbal';

// Initialize queue
const queue = new Queue('mongodb://localhost/myDb', 'videoTranscoding');

// subscribe to the queue
queue.subscribe((msg) => {
  // process the message
  // ...
  
  // we can return a result that will be saved in the message
  
  return 'transcoded';
});

// Add a message to the queue
const [msgId] = await queue.add({ video: 'http://example.com/video1.mov' });
```

#### Pause / Resume

A queue can be paused and resumed globally (pass `true` to pause processing for
just this worker):
```js
await queue.pause()

// queue is paused now

await queue.resume()

// queue is resumed now
```

#### Events

A queue emits also some useful events, for example...
```js
queue.on('added', msgId => {
  // A message has been added to the queue
})

queue.on('active', msg => {
  // The message is being processed
});

queue.on('completed', (msg, result) => {
  // The message has been processed succesfully
})

queue.on('error', (msg, error) => {
  // An error occurred while processing the message.
  // If maxRetries is set, it will be re-processed after a visibility timeout
})

queue.on('dead', msg => {
  // The message is failed permanently.
  // If a dead queue is configured, the message will be copied there.
})
```

For more information on events, including the full list of events that are fired, check out the [Events reference](./REFERENCE.md#events)

### Documentation

- [Queue](#queue)
  - [Queue.subscribe](#queuesubscribe)
  - [Queue.add](#queueadd)
  - [Queue.pause](#queuepause)
  - [Queue.resume](#queueresume)
  - [Queue.ping](#queueping)

- [Channel](#channel)
  - [Channel.publish](#channelpublish)
  - [Channel.subscribe](#channelsubscribe)
  
  
# Queue

```ts
new Queue(connectionUrlOrMongoClient, queueName, options)
```

This is the Queue constructor. It creates a new Queue that is persisted in
MongoDB.


| Name                                        | Type                                              | Description                                             |
| -----------------------------------------   | ------------------------------------------------- | ------------------------------------------------------- |
| `connectionUrlOrMongoClient` **required**   | `MongoClient | string`                            | MongoClient instance or MongoDB Connection Url          |
| `queueName` **required**                    | `string`                                          | The name of the queue                                   |
| `options`                                   | [SubscriptionOptions](#subscriptionoptions)      |                                                         |

## SubscriptionOptions
| Arguments                                   | Type      | Default                  | Description                                             |
| -----------------------------------------   | --------- | --------------------- | ------------------------------------------------------- |
| `visibility`                                | `number` (seconds) | 10              | After a message is received to prevent other consumers from processing the message again, Monkeycymbal sets a visibility timeout, a period of time during which Monkeycymbal prevents other consumers from receiving and processing the message.|
| `delay`                                     | `number` (seconds) |                 | if you set delay to be 10, then every message will only be available for retrieval 10s after being added.                                          |
| `maxRetries`                                | `number`  | 5             | Maximum number of attempts to retry processing a message. If `deadQueue` is set, the message will be moved to the dead queue. Otherwise it will be acked.                                                        |
| `expireAfterSeconds`                        | `number` (seconds) |             | The processed messages will be removed from the collection after the specified number of seconds.                                                        |
| `concurrency`                               | `number`  | 1            | The max number of messages that will be processed in parallel.                                                         |
| `pollInterval`                              | `number` (seconds)  | 10            | The amount of time the subscriber waits before checking for new messages.                                                          |
| `deadQueue`                              | `string` or [Queue](#queue) instance   |            | Messages that have been retried over maxRetries will be pushed to this queue for later inspection.                                                          |


## Queue.subscribe
```ts
queue.subscribe(handler);
```

Defines a processing function for the jobs in a given Queue and start processing.
The handler function receive `msg` as argument.

## Queue.add
```ts
queue.add(msg, AddMessageOptions);
```

Adds a message to the queue.

#### AddMessageOptions
| Arguments                                   | Type      | Default                  | Description                                             |
| -----------------------------------------   | --------- | --------------------- | ------------------------------------------------------- |
| `priority`                                | `number` | 1              | Optional priority value. It ranges from -Infinity to +Infinity|

## Queue.pause
```ts
queue.pause();
```

Pause a queue. A paused queue will not process new jobs until resumed. 

## Queue.resume
```ts
queue.resume();
```

Resume a queue after being paused.

## Queue.ping
```ts
queue.ping(msg.ack);
```

Ping a message to keep it's visibility open for long-running tasks.

## Queue.totalCount
```ts
queue.totalCount();
```

Returns the total number of records in the collection.

## Queue.waitingCount
```ts
queue.waitingCount();
```

Returns the total number of messages that are waiting to be processed.

## Queue.inFlightCount
```ts
queue.inFlightCount();
```

Returns the total number of messages that are currently being processed.




# Channel

```ts
new Channel(connectionUrlOrMongoClient, topic, options)
```

This is the Channel constructor. It creates a new Channel.


| Name                                        | Type                                              | Description                                             |
| -----------------------------------------   | ------------------------------------------------- | ------------------------------------------------------- |
| `connectionUrlOrMongoClient` **required**   | `MongoClient | string`                            | MongoClient instance or MongoDB Connection Url          |
| `topic` **required**                        | `topic`                                          | The name of the channel.                                          |
| `options`                                   | [SubscriptionOptions](#subscriptionoptions)      |                                                         |


## Channel.publish
```ts
channel.publish(msg, PublishOptions);
```

Publish messages to the queues subscribed to the topic.

#### PublishOptions
| Arguments                                   | Type      | Default                  | Description                                             |
| -----------------------------------------   | --------- | --------------------- | ------------------------------------------------------- |
| `priority`                                | `number` | 1              | Optional priority value. It ranges from -Infinity to +Infinity|


## Channel.subscribe
```ts
channel.subscribe(handler, queueName, SubscriptionOptions): Queue;
```

Convenience method that returns an instance of a queue bound to the channel.
