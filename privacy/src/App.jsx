import { useState } from 'react'
import { useNearAuth } from './hooks/useNearAuth'
import { useNova } from './hooks/useNova'

function App() {
  const { signIn, signOut, accountId, isAuthenticated, isLoading: isAuthing } = useNearAuth()
  const { encryptAndUpload, isUploading, error, encryptLocal, decryptLocal, serverStatus, useServer } = useNova(accountId)
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState(null)
  const [lastResult, setLastResult] = useState(null)
  const [localEncrypted, setLocalEncrypted] = useState(null)
  const [decryptMode, setDecryptMode] = useState(false)
  const [decryptInput, setDecryptInput] = useState({ base64: '', key: '' })
  const [decryptedResult, setDecryptedResult] = useState(null)

  const handleSend = async () => {
    if (!message.trim()) return

    setStatus('encrypting...')
    setLastResult(null)

    try {
      const result = await encryptAndUpload(message)
      setStatus('✓ Encrypted successfully!')
      setLastResult(result)
      setMessage('')
    } catch (err) {
      setStatus(`✗ Error: ${err.message}`)
    }
  }

  // Encrypt locally as user types (for preview)
  const handleInputChange = async (value) => {
    setMessage(value)
    if (value.trim()) {
      const encrypted = await encryptLocal(value)
      setLocalEncrypted(encrypted)
    } else {
      setLocalEncrypted(null)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 text-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 bg-clip-text text-transparent animate-gradient">
            Nova Encrypt
          </h1>
          <p className="text-gray-400 text-lg">
            End-to-end encrypted messaging powered by Nova & NEAR
          </p>
        </div>

        {/* Auth Section */}
        <div className="bg-gray-900/50 backdrop-blur rounded-xl border border-gray-800 p-6 shadow-2xl">
          {isAuthenticated ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm text-gray-400">Connected as</p>
                  <p className="font-mono text-purple-400 text-lg">{accountId}</p>
                </div>
                <button
                  onClick={signOut}
                  disabled={isAuthing}
                  className="px-6 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition border border-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Disconnect
                </button>
              </div>

              {/* Server Status */}
              {serverStatus && (
                <div className="flex items-center gap-2 text-sm py-2 px-3 bg-gray-800/50 rounded-lg border border-gray-700">
                  {serverStatus === 'online' ? (
                    <>
                      <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                      <span className="text-green-400">Nova Server Online</span>
                      <span className="text-gray-500 text-xs">• Using server-side encryption</span>
                    </>
                  ) : (
                    <>
                      <div className="w-2 h-2 bg-yellow-400 rounded-full" />
                      <span className="text-yellow-400">Nova Server Offline</span>
                      <span className="text-gray-500 text-xs">• Using local encryption</span>
                    </>
                  )}
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={signIn}
              disabled={isAuthing}
              className="w-full py-4 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 disabled:from-gray-700 disabled:to-gray-700 rounded-xl font-bold text-lg transition shadow-lg hover:shadow-purple-500/25 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isAuthing ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                  </svg>
                  Connect NEAR Wallet
                </>
              )}
            </button>
          )}
        </div>

        {/* Message Section */}
        {isAuthenticated && (
          <div className="bg-gray-900/50 backdrop-blur rounded-xl border border-gray-800 p-6 space-y-4 shadow-2xl">
            {/* Mode Toggle */}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setDecryptMode(false)
                  setDecryptedResult(null)
                }}
                className={`flex-1 py-2 px-4 rounded-lg font-medium transition ${
                  !decryptMode
                    ? 'bg-purple-500 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                🔒 Encrypt
              </button>
              <button
                onClick={() => {
                  setDecryptMode(true)
                  setDecryptedResult(null)
                }}
                className={`flex-1 py-2 px-4 rounded-lg font-medium transition ${
                  decryptMode
                    ? 'bg-purple-500 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                🔓 Decrypt
              </button>
            </div>

            {!decryptMode ? (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Your Secret Message
                  </label>
                  <textarea
                    value={message}
                    onChange={(e) => handleInputChange(e.target.value)}
                    placeholder="Type your message here... It will be encrypted before leaving your browser"
                    className="w-full h-32 px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none transition"
                    disabled={isUploading}
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    {message.length} characters
                  </p>

                  {/* Live Encryption Preview */}
                  {localEncrypted && (
                    <div className="mt-3 p-3 bg-gray-900/50 rounded-lg border border-gray-700 space-y-2">
                      <p className="text-sm font-semibold text-yellow-300 flex items-center gap-2">
                        🔐 Live Base64 Encrypted Preview
                      </p>
                      <div className="space-y-2">
                        <div className="bg-black/30 rounded p-2 max-h-20 overflow-y-auto">
                          <span className="text-yellow-400 text-xs break-all font-mono">
                            {localEncrypted.encryptedB64}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-500">
                            {localEncrypted.encryptedB64.length} chars (Base64)
                          </span>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(localEncrypted.encryptedB64)
                            }}
                            className="px-3 py-1 bg-yellow-600/20 hover:bg-yellow-600/30 text-yellow-400 rounded border border-yellow-600/50 transition"
                          >
                            📋 Copy Base64
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <button
                  onClick={handleSend}
                  disabled={!message.trim() || isUploading}
                  className="w-full py-4 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 disabled:from-gray-700 disabled:to-gray-700 disabled:cursor-not-allowed rounded-xl font-bold text-lg transition shadow-lg hover:shadow-green-500/25 flex items-center justify-center gap-2"
                >
                  {isUploading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Encrypting & Uploading...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                      Encrypt & Send
                    </>
                  )}
                </button>

                {/* Status */}
                {status && (
                  <div className={`p-4 rounded-lg text-sm font-mono ${
                    status.startsWith('✓') ? 'bg-green-900/30 border border-green-700 text-green-400' :
                    status.startsWith('✗') ? 'bg-red-900/30 border border-red-700 text-red-400' :
                    'bg-blue-900/30 border border-blue-700 text-blue-400'
                  }`}>
                    {status}
                  </div>
                )}

                {/* Result */}
                {lastResult && (
                  <div className="space-y-3 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
                    <p className="text-sm font-semibold text-gray-300">
                      🔐 Local Encryption Result
                    </p>
                    <div className="space-y-2 font-mono text-xs">
                      <div className="flex items-center gap-2 text-green-400">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.44 9-12V5l-9-4zm0 10.99l7-3.12V17h-2v-4.13L5 11.99v2.01z"/>
                        </svg>
                        <span>Encrypted with Web Crypto API (browser-native)</span>
                      </div>
                      <div className="flex items-center gap-2 text-blue-400">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7.24 1 5 1v2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-2h1c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM5 6c0-1.65.68-3 1.5-3V4c0-.55-.45-1-1-1H3c-.55 0-1 .45-1 1v1c0 1.65.68 3 1.5 3zm11 5.5c0 1.65-.68 3-1.5 3s-1.5-.68-1.5-3c0-1.65.68-3 1.5-3s1.5.68 1.5 3zM6 13c0 1.1.9 2 2 2h6c1.1 0 2-.9 2-2V9H6v4z"/>
                        </svg>
                        <span>No server/MCP required - 100% client-side</span>
                      </div>
                      <div className="flex items-center gap-2 text-purple-400">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                        </svg>
                        <span>Compatible with Nova SDK format</span>
                      </div>
                    </div>
                    <div className="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-700 space-y-1">
                      <p>✅ Encrypted with AES-256-GCM (256-bit key)</p>
                      <p>✅ Random IV per encryption</p>
                      <p>✅ Copy the base64 below to use anywhere</p>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                {/* Decrypt Mode */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Base64 Encrypted Data
                    </label>
                    <textarea
                      value={decryptInput.base64}
                      onChange={(e) => setDecryptInput({ ...decryptInput, base64: e.target.value })}
                      placeholder="Paste the base64 encrypted data here..."
                      className="w-full h-24 px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none transition font-mono text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Encryption Key (Base64)
                    </label>
                    <input
                      type="text"
                      value={decryptInput.key}
                      onChange={(e) => setDecryptInput({ ...decryptInput, key: e.target.value })}
                      placeholder="Paste the encryption key here..."
                      className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition font-mono text-xs"
                    />
                  </div>

                  <button
                    onClick={async () => {
                      if (!decryptInput.base64 || !decryptInput.key) return
                      const result = await decryptLocal(decryptInput.base64, decryptInput.key)
                      setDecryptedResult(result)
                    }}
                    disabled={!decryptInput.base64 || !decryptInput.key}
                    className="w-full py-3 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 disabled:from-gray-700 disabled:to-gray-700 disabled:cursor-not-allowed rounded-xl font-bold transition shadow-lg hover:shadow-blue-500/25 flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0v4M5 9h14l1 12H4L5 9z" />
                    </svg>
                    Decrypt
                  </button>

                  {/* Decrypted Result */}
                  {decryptedResult && (
                    <div className={`p-4 rounded-lg ${
                      decryptedResult.success
                        ? 'bg-green-900/30 border border-green-700'
                        : 'bg-red-900/30 border border-red-700'
                    }`}>
                      <p className={`text-sm font-semibold mb-2 ${
                        decryptedResult.success ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {decryptedResult.success ? '✓ Decrypted Successfully!' : '✗ Decryption Failed'}
                      </p>
                      {decryptedResult.success ? (
                        <div className="space-y-3">
                          {/* JSON Format */}
                          {decryptedResult.format === 'json' ? (
                            <div className="space-y-2">
                              <div className="bg-black/30 rounded p-3 space-y-2">
                                {decryptedResult.data.text && (
                                  <div>
                                    <span className="text-gray-400 text-xs">Message:</span>
                                    <p className="text-white text-sm">{decryptedResult.data.text}</p>
                                  </div>
                                )}
                                {decryptedResult.data.timestamp && (
                                  <div>
                                    <span className="text-gray-400 text-xs">Timestamp:</span>
                                    <p className="text-blue-400 text-sm font-mono">
                                      {new Date(decryptedResult.data.timestamp).toLocaleString()}
                                    </p>
                                  </div>
                                )}
                                {decryptedResult.data.version && (
                                  <div>
                                    <span className="text-gray-400 text-xs">Version:</span>
                                    <p className="text-gray-300 text-sm">{decryptedResult.data.version}</p>
                                  </div>
                                )}
                              </div>
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(JSON.stringify(decryptedResult.data, null, 2))
                                }}
                                className="px-3 py-1 bg-green-600/20 hover:bg-green-600/30 text-green-400 rounded border border-green-600/50 text-sm transition"
                              >
                                📋 Copy JSON
                              </button>
                            </div>
                          ) : (
                            /* Plain Text Format */
                            <div className="space-y-2">
                              <div className="bg-black/30 rounded p-3">
                                <p className="text-white text-sm whitespace-pre-wrap break-words">
                                  {decryptedResult.data}
                                </p>
                              </div>
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(decryptedResult.data)
                                }}
                                className="px-3 py-1 bg-green-600/20 hover:bg-green-600/30 text-green-400 rounded border border-green-600/50 text-sm transition"
                              >
                                📋 Copy Decrypted Text
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-red-400 text-sm">{decryptedResult.error}</p>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}

            {error && (
              <div className="p-4 rounded-lg bg-red-900/30 border border-red-700 text-red-400 text-sm">
                {error}
              </div>
            )}
          </div>
        )}

        {/* Info Section */}
        <div className="text-center text-sm text-gray-500 space-y-2">
          <p>🔒 Messages are encrypted with AES-256-GCM in your browser</p>
          <p>📱 100% client-side • No server required • Compatible with Nova SDK format</p>
          <p className="font-mono text-xs opacity-50">Powered by Web Crypto API + better-near-auth</p>
        </div>

        {/* Network Badge */}
        <div className="text-center flex items-center justify-center gap-3">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-purple-500/10 border border-purple-500/30 text-purple-400 text-xs rounded-full">
            🔐 AES-256-GCM
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-500/10 border border-green-500/30 text-green-400 text-xs rounded-full">
            Web Crypto API
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs rounded-full">
            Client-Side Only
          </span>
        </div>
      </div>

      <style>{`
        @keyframes gradient {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        .animate-gradient {
          background-size: 200% 200%;
          animation: gradient 3s ease infinite;
        }
      `}</style>
    </div>
  )
}

export default App
