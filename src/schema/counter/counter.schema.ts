import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CounterDocument = HydratedDocument<Counter>;

@Schema({ collection: 'counters' })
export class Counter {
  @Prop({ required: true, unique: true })
  name: string;

  @Prop({ default: 0 })
  seq: number;
}

export const CounterSchema = SchemaFactory.createForClass(Counter);

CounterSchema.index({ name: 1 }, { unique: true });
