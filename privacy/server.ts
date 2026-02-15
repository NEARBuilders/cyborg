import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { NovaSdk } from 'nova-sdk-js'

const app = new Hono()

// Enable CORS for frontend
app.use('/*', cors({
  origin: ['http://localhost:3000', 'http://localhost:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}))

// Initialize Nova SDK (server-side, works with MCP)
let novaSdk = null

try {
  const accountId = process.env.TEST_NOVA_ACCOUNT_ID
  const apiKey = process.env.TEST_NOVA_API_KEY

  if (!accountId || !apiKey) {
    console.warn('⚠️  Nova SDK not configured. Set TEST_NOVA_ACCOUNT_ID and TEST_NOVA_API_KEY')
  } else {
    novaSdk = new NovaSdk(accountId, { apiKey })
    console.log('✅ Nova SDK initialized for:', accountId)
    console.log('   Network:', novaSdk.networkId)
    console.log('   Contract:', novaSdk.contractId)
  }
} catch (err) {
  console.error('❌ Nova SDK init failed:', err.message)
}

// Health check
app.get('/', (c) => {
  return c.json({
    status: 'ok',
    novaSdk: !!novaSdk,
    timestamp: new Date().toISOString()
  })
})

// Test Nova auth
app.get('/api/nova/auth', async (c) => {
  if (!novaSdk) {
    return c.json({ error: 'Nova SDK not initialized' }, 500)
  }

  try {
    const status = await novaSdk.authStatus()
    return c.json({
      authenticated: status.authenticated,
      accountId: status.near_account_id,
      authorized: status.authorized_for_group,
      network: novaSdk.networkId
    })
  } catch (err) {
    return c.json({ error: err.message }, 500)
  }
})

// Encrypt and upload to Nova (requires Nova SDK)
app.post('/api/nova/upload', async (c) => {
  if (!novaSdk) {
    return c.json({ error: 'Nova SDK not initialized' }, 500)
  }

  try {
    const { message, groupId } = await c.req.json()

    if (!message) {
      return c.json({ error: 'Message is required' }, 400)
    }

    const messageData = {
      text: message,
      timestamp: Date.now(),
      version: '1.0',
      uploadedVia: 'server'
    }

    const data = Buffer.from(JSON.stringify(messageData))
    const filename = `msg-${Date.now()}.json`

    // Register group if needed
    const targetGroup = groupId || novaSdk.accountId + '-messages'
    try {
      await novaSdk.registerGroup(targetGroup)
      console.log('✅ Group registered:', targetGroup)
    } catch (groupErr) {
      console.log('ℹ️  Group already exists')
    }

    // Upload with Nova SDK (handles encryption internally)
    const result = await novaSdk.upload(targetGroup, data, filename)

    console.log('✅ Uploaded to Nova:')
    console.log('  CID:', result.cid)
    console.log('  TX:', result.trans_id)
    console.log('  Hash:', result.file_hash)

    return c.json({
      success: true,
      cid: result.cid,
      transId: result.trans_id,
      fileHash: result.file_hash,
      groupId: targetGroup
    })
  } catch (err) {
    console.error('Upload failed:', err)
    return c.json({ error: err.message }, 500)
  }
})

// Retrieve and decrypt from Nova
app.get('/api/nova/retrieve/:groupId/:cid', async (c) => {
  if (!novaSdk) {
    return c.json({ error: 'Nova SDK not initialized' }, 500)
  }

  try {
    const { groupId, cid } = c.req.param()

    const result = await novaSdk.retrieve(groupId, cid)

    console.log('✅ Retrieved from Nova:')
    console.log('  Group:', result.group_id)
    console.log('  IPFS:', result.ipfs_hash)
    console.log('  Size:', result.data.length, 'bytes')

    // Parse JSON
    const messageData = JSON.parse(result.data.toString())

    return c.json({
      success: true,
      data: messageData,
      groupId: result.group_id,
      ipfsHash: result.ipfs_hash
    })
  } catch (err) {
    console.error('Retrieve failed:', err)
    return c.json({ error: err.message }, 500)
  }
})

// Get group transactions
app.get('/api/nova/transactions/:groupId', async (c) => {
  if (!novaSdk) {
    return c.json({ error: 'Nova SDK not initialized' }, 500)
  }

  try {
    const { groupId } = c.req.param()

    const transactions = await novaSdk.getTransactionsForGroup(groupId)

    return c.json({
      success: true,
      transactions,
      count: transactions.length
    })
  } catch (err) {
    console.error('Get transactions failed:', err)
    return c.json({ error: err.message }, 500)
  }
})

// Get balance
app.get('/api/nova/balance/:accountId?', async (c) => {
  if (!novaSdk) {
    return c.json({ error: 'Nova SDK not initialized' }, 500)
  }

  try {
    const { accountId } = c.req.param()
    const targetAccountId = accountId || novaSdk.accountId

    const balance = await novaSdk.getBalance(targetAccountId)

    return c.json({
      success: true,
      accountId: targetAccountId,
      balance: balance
    })
  } catch (err) {
    console.error('Get balance failed:', err)
    return c.json({ error: err.message }, 500)
  }
})

const port = parseInt(process.env.PORT || '3001')

const novaSdkStatus = novaSdk ? '✅ Ready' : '❌ Not configured'
const currentTime = new Date().toLocaleString()

console.log(`
╔════════════════════════════════════════╗
║   Nova Encryption Server                   ║
╠════════════════════════════════════════╣
║  Port: ${port}
║  Nova SDK: ${novaSdkStatus}
║  Time: ${currentTime}
╚════════════════════════════════════════╝
`)

Bun.serve({
  port,
  fetch: app.fetch
})
