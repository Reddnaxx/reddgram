import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { UsersService } from './users.service.js';

type AuthedRequest = Request & {
  user: {
    id: string;
    phone: string;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
  };
};

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('username-available')
  usernameAvailable(@Query('username') username?: string) {
    return this.users.checkUsernameAvailability(username ?? '');
  }

  @Get('search')
  @UseGuards(AuthGuard('jwt'))
  search(@Req() req: AuthedRequest, @Query('q') q?: string) {
    return this.users.search(req.user.id, q ?? '');
  }
}
