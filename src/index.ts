export { default as Queue } from './lib/Queue';
export { default as Channel } from './lib/Channel';
/*
import setup from '../test/support/setup';

(async () => {
  const { client } = await setup();
  const queue = new Queue(client, 'myTopic', 'queue');
  queue.subscribeWithChangeStream();
})();
*/
