import express from 'express';

export async function requestJson(
  router,
  {
    method = 'GET',
    path = '/',
    body,
    headers = {},
    configureApp,
  } = {}
) {
  const app = express();
  app.use(express.json());
  configureApp?.(app);
  app.use(router);

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...headers,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    const text = await response.text();
    const parsedBody = text ? JSON.parse(text) : null;

    return {
      status: response.status,
      body: parsedBody,
      headers: response.headers,
    };
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}
