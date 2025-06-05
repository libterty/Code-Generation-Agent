import { PipeTransform } from '@nestjs/common';
import { SchemaOf } from 'yup';
import { ValidationError } from '@server/core/error';

export class ValidatorPipe implements PipeTransform {
  public constructor(private readonly schema: SchemaOf<any>) {}

  public async transform(value: any): Promise<any> {
    try {
      await this.schema.validate(value);
      return value;
    } catch (err) {
      throw new ValidationError(err.message);
    }
  }
}
