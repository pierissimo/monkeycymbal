import should from 'should';
import setup from '../support/setup';
import Channel from '../../src/lib/Channel';
// import Queue from '../../src/lib/Queue';

describe('default', () => {
  let client;
  let queue;
  let channel;

  beforeEach(async () => {
    ({ client } = await setup());
    channel = new Channel(client, 'myTopic');
  });

  afterEach(async () => {
    await queue.pause();
    await client.close();
  });

  it('checks default functionality', done => {
    (async () => {
      queue = await channel.subscribe(msg => {
        should(typeof msg._id.toString()).be.equal('string');
        should(typeof msg.ack).be.equal('string');
        should(typeof msg.tries).be.equal('number');
        should(msg.tries).be.equal(1);
        should(msg.payload).be.equal('Hello, World!');

        setTimeout(async () => {
          const msg = await queue.collection.findOne();
          should(msg.deletedAt).be.instanceOf(Date);
          should(msg.result).be.equal('myResult');
          queue.pause();
          done();
        }, 500);

        return 'myResult';
      });

      await channel.publish('Hello, World!');
    })();

    // Try to ack twice
    /*try {
      await queue.ack(msg.ack);
      throw new Error('Message was successfully ACKed twice');
    } catch (e) {
      if (e.message === 'assert.fail()') {
        throw e;
      }
      // else ok
    }*/
  });
});
