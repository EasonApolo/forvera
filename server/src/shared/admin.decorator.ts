import { UnauthorizedException } from '@nestjs/common';

export const Role = (role: number) => {
  return (target: any, key: string, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;

    descriptor.value = function (...args: any[]) {
      const req = args[0];
      const user = req.user;

      if (user.role !== role) {
        throw new UnauthorizedException(
          'You are not authorized to access this resource',
        );
      }

      return originalMethod.apply(this, args);
    };

    return descriptor;
  };
};
