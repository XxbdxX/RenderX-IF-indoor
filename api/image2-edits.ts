import type { IncomingMessage, ServerResponse } from 'node:http';

type VercelRequestLike = IncomingMessage & {
  method?: string;
  headers: IncomingMessage['headers'];
};

type VercelResponseLike = ServerResponse & {
  status: (statusCode: number) => VercelResponseLike;
  json: (body: unknown) => void;
  send: (body: unknown) => void;
};

const stripTrailingSlashes = (value: string): string => value.replace(/\/+$/, '');

const getImageEditEndpoint = (baseUrl: string): string => {
  const normalizedBaseUrl = stripTrailingSlashes(baseUrl.trim());
  return normalizedBaseUrl.endsWith('/images/edits')
    ? normalizedBaseUrl
    : `${normalizedBaseUrl}/images/edits`;
};

const getHeaderValue = (value: string | string[] | undefined): string => {
  return Array.isArray(value) ? value[0] || '' : value || '';
};

export default async function handler(request: VercelRequestLike, response: VercelResponseLike) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    response.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const baseUrl = getHeaderValue(request.headers['x-renderx-image-base-url']).trim();
  const apiKey = getHeaderValue(request.headers['x-renderx-image-api-key']).trim();

  if (!baseUrl || !apiKey) {
    response.status(400).json({ error: 'Missing Image-2 Base URL or API Key.' });
    return;
  }

  const contentType = getHeaderValue(request.headers['content-type']);
  if (!contentType.toLowerCase().includes('multipart/form-data')) {
    response.status(400).json({ error: 'Image-2 proxy expects multipart/form-data.' });
    return;
  }

  try {
    const upstreamResponse = await fetch(getImageEditEndpoint(baseUrl), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': contentType,
      },
      body: request,
      // Required by Node fetch when forwarding a streaming request body.
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });

    const responseBody = await upstreamResponse.arrayBuffer();
    const upstreamContentType = upstreamResponse.headers.get('content-type') || 'application/json';
    response.status(upstreamResponse.status);
    response.setHeader('Content-Type', upstreamContentType);
    response.send(Buffer.from(responseBody));
  } catch (error) {
    response.status(502).json({
      error: error instanceof Error ? error.message : 'Image-2 proxy request failed.',
    });
  }
}
