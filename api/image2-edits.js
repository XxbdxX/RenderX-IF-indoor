export const config = {
  api: {
    bodyParser: false,
    maxDuration: 60,
  },
};

const stripTrailingSlashes = (value) => value.replace(/\/+$/, '');

const getImageEditEndpoint = (baseUrl) => {
  const normalizedBaseUrl = stripTrailingSlashes(baseUrl.trim());
  return normalizedBaseUrl.endsWith('/images/edits')
    ? normalizedBaseUrl
    : `${normalizedBaseUrl}/images/edits`;
};

const getImageGenerationEndpoint = (baseUrl) => {
  const normalizedBaseUrl = stripTrailingSlashes(baseUrl.trim());
  if (normalizedBaseUrl.endsWith('/images/generations')) return normalizedBaseUrl;
  if (normalizedBaseUrl.endsWith('/images/edits')) {
    return normalizedBaseUrl.replace(/\/images\/edits$/, '/images/generations');
  }
  return `${normalizedBaseUrl}/images/generations`;
};

const sendJson = (response, status, payload) => {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(payload));
};

const readRequestBody = async (request) => {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    sendJson(response, 405, { error: 'Method not allowed' });
    return;
  }

  const baseUrl = String(request.headers['x-renderx-image-base-url'] || '').trim();
  const apiKey = String(request.headers['x-renderx-image-api-key'] || '').trim();

  if (!baseUrl || !apiKey) {
    sendJson(response, 400, { error: 'Missing Image-2 Base URL or API Key.' });
    return;
  }

  try {
    const contentType = String(request.headers['content-type'] || '');
    const isJsonRequest = contentType.toLowerCase().includes('application/json');
    const body = await readRequestBody(request);

    if (!isJsonRequest && !contentType.toLowerCase().includes('multipart/form-data')) {
      sendJson(response, 400, { error: 'Image-2 proxy expects multipart/form-data or application/json.' });
      return;
    }

    const upstreamHeaders = isJsonRequest
      ? {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        }
      : {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': contentType,
        };

    const upstreamResponse = await fetch(
      isJsonRequest ? getImageGenerationEndpoint(baseUrl) : getImageEditEndpoint(baseUrl),
      {
        method: 'POST',
        headers: upstreamHeaders,
        body,
      },
    );

    response.statusCode = upstreamResponse.status;
    response.setHeader('Content-Type', upstreamResponse.headers.get('content-type') || 'application/json');
    response.end(Buffer.from(await upstreamResponse.arrayBuffer()));
  } catch (error) {
    sendJson(response, 502, {
      error: error instanceof Error ? error.message : 'Image-2 proxy request failed.',
    });
  }
}
