import { createServer } from 'node:http'

const port = Number(process.env.DSH_SUB2API_TEST_UPSTREAM_PORT ?? 8787)
const expectedKey = process.env.DSH_SUB2API_TEST_UPSTREAM_KEY ?? 'dsh-local-test-key'
const model = process.env.DSH_SUB2API_TEST_UPSTREAM_MODEL ?? 'dsh-test-model'

const json = (res, status, body) => {
  res.writeHead(status, {
    'content-type': 'application/json',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(body))
}

const readBody = async (req) => {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
}

const isAuthorized = (req) => req.headers.authorization === `Bearer ${expectedKey}`

const server = createServer(async (req, res) => {
  if (!isAuthorized(req)) {
    json(res, 401, { error: { message: 'invalid test upstream key', type: 'authentication_error' } })
    return
  }

  if (req.method === 'GET' && req.url === '/v1/models') {
    json(res, 200, {
      object: 'list',
      data: [{ id: model, object: 'model', created: 0, owned_by: 'dsh-local-test-upstream' }],
    })
    return
  }

  if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
    json(res, 404, { error: { message: 'not found', type: 'invalid_request_error' } })
    return
  }

  let body
  try {
    body = await readBody(req)
  } catch {
    json(res, 400, { error: { message: 'invalid JSON', type: 'invalid_request_error' } })
    return
  }

  const requestId = 'chatcmpl-dsh-local-test'
  const content = 'ThunderUni 本地 Sub2API 链路测试成功。'
  const usage = { prompt_tokens: 7, completion_tokens: 11, total_tokens: 18 }

  if (body.stream === true) {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    })
    const chunk = (delta, finishReason = null, chunkUsage) => ({
      id: requestId,
      object: 'chat.completion.chunk',
      created: 0,
      model,
      choices: [{ index: 0, delta, finish_reason: finishReason }],
      ...(chunkUsage ? { usage: chunkUsage } : {}),
    })
    res.write(`data: ${JSON.stringify(chunk({ role: 'assistant', content: '' }))}\n\n`)
    res.write(`data: ${JSON.stringify(chunk({ content }, 'stop'))}\n\n`)
    res.write(`data: ${JSON.stringify(chunk({}, null, usage))}\n\n`)
    res.write('data: [DONE]\n\n')
    res.end()
    return
  }

  json(res, 200, {
    id: requestId,
    object: 'chat.completion',
    created: 0,
    model,
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
    usage,
  })
})

server.listen(port, '0.0.0.0', () => {
  console.log(`dsh local Sub2API test upstream listening on 0.0.0.0:${port}`)
})

const shutdown = () => server.close(() => process.exit(0))
process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)
