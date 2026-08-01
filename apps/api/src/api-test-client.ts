import "reflect-metadata";

import type { AddressInfo } from "node:net";

import { NestFactory } from "@nestjs/core";
import type { INestApplication } from "@nestjs/common";

import { AppModule } from "./app.module.js";

/** Calls the Core Platform API over HTTP, the way a client would. */
export type ApiClient = <T>(
  method: string,
  path: string,
  init?: { headers?: Record<string, string>; body?: unknown },
) => Promise<{ status: number; body: T }>;

/** Runs the API for one test, so tests exercise the real HTTP boundary. */
export async function withApi(
  run: (api: ApiClient) => Promise<void>,
): Promise<void> {
  const app: INestApplication = await NestFactory.create(AppModule, {
    logger: false,
  });
  await app.listen(0);

  try {
    const { port } = app.getHttpServer().address() as AddressInfo;

    await run(async (method, path, init = {}) => {
      const response = await fetch(`http://127.0.0.1:${port}${path}`, {
        method,
        headers: {
          ...init.headers,
          ...(init.body ? { "content-type": "application/json" } : {}),
        },
        ...(init.body ? { body: JSON.stringify(init.body) } : {}),
      });
      const text = await response.text();

      return { status: response.status, body: JSON.parse(text) };
    });
  } finally {
    await app.close();
  }
}

export function restoreEnv(name: string, original: string | undefined): void {
  if (original === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = original;
}
