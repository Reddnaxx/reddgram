import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import {
  normalizePhone,
  PHONE_MAX_DIGITS,
  PHONE_MIN_DIGITS,
} from '../../common/lib/phone.js';
import { normalizePersonName } from '../../common/lib/name.js';
import {
  normalizeUsername,
  USERNAME_PATTERN,
} from '../../common/lib/username.js';

const NAME_CHARS = /^[\p{L}\p{M}\s'-]+$/u;

export class RegisterDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? normalizePhone(value) : value,
  )
  @IsString()
  @MinLength(PHONE_MIN_DIGITS, {
    message: `phone must have at least ${PHONE_MIN_DIGITS} digits`,
  })
  @MaxLength(PHONE_MAX_DIGITS)
  phone!: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? normalizeUsername(value) : value,
  )
  @IsString()
  @Matches(USERNAME_PATTERN, {
    message: 'username must be 5–32 chars, start with a letter',
  })
  username!: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? normalizePersonName(value) : value,
  )
  @IsString()
  @MinLength(1, { message: 'first name is required' })
  @MaxLength(60)
  @Matches(NAME_CHARS, { message: 'invalid characters in first name' })
  firstName!: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? normalizePersonName(value) : value,
  )
  @IsString()
  @MinLength(1, { message: 'last name is required' })
  @MaxLength(60)
  @Matches(NAME_CHARS, { message: 'invalid characters in last name' })
  lastName!: string;

  @IsString()
  @MinLength(8, { message: 'password must be at least 8 characters' })
  password!: string;
}
