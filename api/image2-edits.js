export const config = {
  runtime: 'edge',
};

const stripTrailingSlashes = (value) => value.replace(/\/+$/, '');

const getImageEditEndpoint = (baseUrl) => {
  const normalizedBaseUrl = stripTrailingSlashes(baseUrl.trim());
  return normalizedBaseUrl.endsWith('/images/edits')
    ? normalizedBaseUrl
    : `${normalizedBaseUrl}/images/edits`;
};

const jsonResponse = (payload, status) => {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
};

export default async function handler(request) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: {
        Allow: 'POST',
        'Content-Type': 'application/json',
      },
    });
  }

  const baseUrl = (request.headers.get('x-renderx-image-base-url') || '').trim();
  const apiKey = (request.headers.get('x-renderx-image-api-key') || '').trim();

  if (!baseUrl || !apiKey) {
    return jsonResponse({ error: 'Missing Image-2 Base URL or API Key.' }, 400);
  }

  const contentType = request.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('multipart/form-data')) {
    return jsonResponse({ error: 'Image-2 proxy expects multipart/form-data.' }, 400);
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
    });

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: {
        'Content-Type': upstreamResponse.headers.get('content-type') || 'application/json',
      },
    });
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : 'Image-2 proxy request failed.',
    }, 502);
  }
}
