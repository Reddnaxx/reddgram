import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
import {
  normalizePhone,
  PHONE_MAX_DIGITS,
  PHONE_MIN_DIGITS,
} from '../../common/lib/phone.js';

export class LoginDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? normalizePhone(value) : value,
  )
  @IsString()
  @MinLength(PHONE_MIN_DIGITS)
  @MaxLength(PHONE_MAX_DIGITS)
  phone!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}
