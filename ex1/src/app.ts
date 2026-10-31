import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { Type } from '@nestjs/common';

export async function createApp(module: Type<unknown>, logger = true) {
  return NestFactory.create(module, { logger: logger ? undefined : false });
}
