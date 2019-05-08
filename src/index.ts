import Queue from './lib/Queue';
import setup from '../test/support/setup';

(async () => {
  const { client } = await setup();
  const queue = new Queue(client, 'myTopic', 'queue');
  queue.subscribeWithChangeStream();
})();
