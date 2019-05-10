import { ObjectId } from 'bson';

export interface IMessage {
  _id: ObjectId;
  visible: Date;
  createdAt: Date;
  startedAt: Date;
  deletedAt: Date;
  priority: number;
  payload: any;
  result?: any;
  ack: string;
  tries: number;
}

export interface IQueueOptions {
  deadQueueName?: string;
  visibility?: number;
  delay?: number;
}

export interface IPublishOptions extends IQueueOptions {
  priority?: number;
}

export interface IAddMessageOptions extends IQueueOptions {
  priority?: number;
}
