import { SetMetadata } from '@nestjs/common';

import { UnauthorizedException } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = 'roles';
export const Role = (role: number) => SetMetadata(ROLES_KEY, role);
