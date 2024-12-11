import {
  PipeTransform,
  Injectable,
  ArgumentMetadata,
  BadRequestException,
} from '@nestjs/common';

@Injectable()
export class OptionalParseIntPipe
  implements PipeTransform<string, number | undefined>
{
  transform(value: string, metadata: ArgumentMetadata): number | undefined {
    if (value === undefined || value === null || value === '') {
      return undefined; // or return a default value if needed
    }
    const val = parseInt(value, 10);
    if (isNaN(val)) {
      throw new BadRequestException(
        `Validation failed. "${value}" is not an integer.`,
      );
    }
    return val;
  }
}
