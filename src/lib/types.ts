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
