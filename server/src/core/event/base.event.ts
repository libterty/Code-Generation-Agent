import { EventType } from '@server/core/event/event';

// Generic event base interface
export interface IEvent<T = any> {
  readonly eventName: string;
  readonly payload: T;
  readonly timestamp: Date;
  readonly eventId: string;
}

// Abstract base class for events
export abstract class EventBase<T = any> implements IEvent<T> {
  public readonly timestamp: Date;
  public readonly eventId: string;
  public abstract readonly eventName: EventType;
  public abstract validate(payload: any): boolean;

  constructor(public readonly payload: T) {
    this.timestamp = new Date();
    this.eventId = this.generateEventId();
  }

  protected generateEventId(): string {
    return `${this.eventName}-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;
  }

  // Serialize the event to JSON
  public toJSON(): object {
    return {
      eventName: this.eventName,
      eventId: this.eventId,
      timestamp: this.timestamp.toISOString(),
      payload: this.payload,
    };
  }
}
