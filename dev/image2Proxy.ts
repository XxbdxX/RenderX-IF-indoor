import type { IncomingMessage, ServerResponse } from 'node:http';

const stripTrailingSlashes = (value: string): string => value.replace(/\/+$/, '');

const getImageEditEndpoint = (baseUrl: string): string => {
  const normalizedBaseUrl = stripTrailingSlashes(baseUrl.trim());
  return normalizedBaseUrl.endsWith('/images/edits')
    ? normalizedBaseUrl
    : `${normalizedBaseUrl}/images/edits`;
};

const getImageGenerationEndpoint = (baseUrl: string): string => {
  const normalizedBaseUrl = stripTrailingSlashes(baseUrl.trim());
  if (normalizedBaseUrl.endsWith('/images/generations')) return normalizedBaseUrl;
  if (normalizedBaseUrl.endsWith('/images/edits')) {
    return normalizedBaseUrl.replace(/\/images\/edits$/, '/images/generations');
  }
  return `${normalizedBaseUrl}/images/generations`;
};

const sendJson = (response: ServerResponse, status: number, payload: unknown) => {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(payload));
};

export const handleImage2ProxyRequest = async (request: IncomingMessage, response: ServerResponse) => {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    sendJson(response, 405, { error: 'Method not allowed' });
    return;
  }

  const baseUrl = String(request.headers['x-renderx-image-base-url'] || '').trim();
  const apiKey = String(request.headers['x-renderx-image-api-key'] || '').trim();
  const contentType = String(request.headers['content-type'] || '');

  if (!baseUrl || !apiKey) {
    sendJson(response, 400, { error: 'Missing Image-2 Base URL or API Key.' });
    return;
  }

  try {
    const isJsonRequest = contentType.toLowerCase().includes('application/json');
    let body: BodyInit = request as unknown as BodyInit;

    if (isJsonRequest) {
      const chunks: Buffer[] = [];
      for await (const chunk of request) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      body = Buffer.concat(chunks).toString('utf8');
    }

    const upstreamResponse = await fetch(isJsonRequest ? getImageGenerationEndpoint(baseUrl) : getImageEditEndpoint(baseUrl), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': contentType,
      },
      body,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });

    const responseBody = Buffer.from(await upstreamResponse.arrayBuffer());
    response.statusCode = upstreamResponse.status;
    response.setHeader('Content-Type', upstreamResponse.headers.get('content-type') || 'application/json');
    response.end(responseBody);
  } catch (error) {
    sendJson(response, 502, {
      error: error instanceof Error ? error.message : 'Image-2 proxy request failed.',
    });
  }
};
