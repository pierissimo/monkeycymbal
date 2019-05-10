import times = require('lodash/times');
import bluebird = require('bluebird');
const { Channel, Queue } = require('./build/src');

const MONGODB = 'mongodb://localhost:27017/mongodb-queue';
const concurrency = 50;
const publishCount = 5000;

const channel = new Channel(MONGODB, 'myTopic');
const queue1 = new Queue(MONGODB, 'myTopic_queue1', { concurrency });
// const queue2 = new Queue(MONGODB, 'myTopic_queue2', { concurrency: 30 });


// queue2.subscribe(() => Math.random());


let completedCount = 0;
const checkCompleted = () => {
  if (completedCount === publishCount) {
    console.timeEnd('done');
    process.exit(0);
  }
};

/*queue2.on('completed', () => {
  completedCount += 1;
  checkCompleted();
});*/

const main = async () => {
  await queue1.initialize();
  queue1.on('completed', () => {
    completedCount += 1;
    checkCompleted();
  });
  await bluebird.map(times(publishCount), () => channel.publish('stress-test.ts.ts'), { concurrency: 100 });
  console.time('done');
  await queue1.subscribe(() => Math.random());
  setInterval(() => console.log(`processed ${completedCount} messages`), 500);
};

main();
