export const config = {
  maxDuration: 60,
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

  try {
    const contentType = request.headers.get('content-type') || '';
    if (contentType.toLowerCase().includes('application/json')) {
      const payload = await request.json();
      const upstreamResponse = await fetch(getImageGenerationEndpoint(baseUrl), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      return new Response(upstreamResponse.body, {
        status: upstreamResponse.status,
        headers: {
          'Content-Type': upstreamResponse.headers.get('content-type') || 'application/json',
        },
      });
    }

    if (!contentType.toLowerCase().includes('multipart/form-data')) {
      return jsonResponse({ error: 'Image-2 proxy expects multipart/form-data or application/json.' }, 400);
    }

    const incomingFormData = await request.formData();
    const hasImage = incomingFormData.getAll('image').length > 0;
    const endpoint = hasImage ? getImageEditEndpoint(baseUrl) : getImageGenerationEndpoint(baseUrl);
    const upstreamBody = hasImage ? incomingFormData : JSON.stringify(Object.fromEntries(incomingFormData.entries()));
    const upstreamHeaders = hasImage
      ? { Authorization: `Bearer ${apiKey}` }
      : { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };

    const upstreamResponse = await fetch(endpoint, {
      method: 'POST',
      headers: upstreamHeaders,
      body: upstreamBody,
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
