import times = require('lodash/times');
import bluebird = require('bluebird');
const { Channel, Queue } = require('./build/src');

const MONGODB = 'mongodb://localhost:27017/mongodb-queue';
const concurrency = 150;
const publishCount = 5000;

const channel = new Channel(MONGODB, 'myTopic');
const queue1 = new Queue(MONGODB, 'myTopic_queue1', { concurrency });
// const queue2 = new Queue(MONGODB, 'myTopic_queue2', { concurrency: 30 });

// queue2.subscribe(() => Math.random());

let completedCount = 0;
let startTime;
const checkCompleted = () => {
  if (completedCount === publishCount) {
    const endTime: any = new Date();
    const timeDiff = endTime - startTime; // in ms
    // strip the ms
    console.log(`total time: ${timeDiff / 1000} seconds`);
    console.log(`average ${(completedCount / (timeDiff / 1000)).toFixed(2)} messages processed per second`);
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
  await bluebird.map(times(publishCount), () => channel.publish('stress-test'), { concurrency: 100 });
  console.time('done');
  startTime = new Date();
  await queue1.subscribe(() => Math.random());
  setInterval(() => console.log(`processed ${completedCount} messages`), 500);
};

main();
