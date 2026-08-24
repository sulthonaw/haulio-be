import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';

type RequestMethod = 'GET' | 'POST';

@Injectable()
export class OperationsService {
  constructor(private readonly configService: ConfigService) {}

  async forward(
    request: Request,
    response: Response,
    method: RequestMethod,
    path: string,
    body?: unknown,
  ): Promise<void> {
    let upstreamUrl: URL;
    try {
      const configuredBase =
        this.configService.get<string>('DS_API_URL') ??
        'http://127.0.0.1:8080/api/v1';
      const base = configuredBase.endsWith('/')
        ? configuredBase
        : `${configuredBase}/`;
      upstreamUrl = new URL(path, base);
      this.copyQuery(request, upstreamUrl);
    } catch {
      response.status(500).json({ error: 'DS_API_URL is not a valid URL' });
      return;
    }

    try {
      const hasBody = body !== undefined;
      const upstream = await fetch(upstreamUrl, {
        method,
        headers: hasBody ? { 'content-type': 'application/json' } : undefined,
        body: hasBody ? JSON.stringify(body) : undefined,
        cache: 'no-store',
      });
      const contentType = upstream.headers.get('content-type');
      if (contentType) response.setHeader('content-type', contentType);
      response.setHeader('cache-control', 'no-store');
      response.status(upstream.status).send(await upstream.text());
    } catch {
      response.status(502).json({
        error:
          'Operations data service is unavailable. Start the DS service on port 8080.',
      });
    }
  }

  private copyQuery(request: Request, destination: URL): void {
    for (const [key, value] of Object.entries(request.query)) {
      const values = Array.isArray(value) ? value : [value];
      for (const item of values) {
        if (typeof item === 'string')
          destination.searchParams.append(key, item);
      }
    }
  }
}
