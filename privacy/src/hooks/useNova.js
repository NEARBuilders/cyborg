import { useState, useEffect } from 'react'

const SERVER_URL = 'http://localhost:3001'

async function encryptDataNovaCompatible(data, keyB64) {
  const keyBytes = Buffer.from(keyB64, 'base64')
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new Uint8Array(keyBytes),
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  )
  
  const dataArrayBuffer = new ArrayBuffer(data.length)
  const dataView = new Uint8Array(dataArrayBuffer)
  for (let i = 0; i < data.length; i++) {
    dataView[i] = data[i]
  }
  
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    dataArrayBuffer
  )
  
  const result = new Uint8Array(iv.length + encrypted.byteLength)
  result.set(iv, 0)
  result.set(new Uint8Array(encrypted), iv.length)
  
  return Buffer.from(result).toString('base64')
}

async function decryptDataNovaCompatible(encryptedB64, keyB64) {
  const encryptedBytes = Buffer.from(encryptedB64, 'base64')
  const keyBytes = Buffer.from(keyB64, 'base64')
  const iv = encryptedBytes.subarray(0, 12)
  const ciphertext = encryptedBytes.subarray(12)
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new Uint8Array(keyBytes),
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  )
  
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    ciphertext
  )
  
  return Buffer.from(decrypted).toString('utf8')
}

function generateKey() {
  const key = crypto.getRandomValues(new Uint8Array(32))
  return Buffer.from(key).toString('base64')
}

export function useNova(accountId) {
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState(null)
  const [encryptionKey, setEncryptionKey] = useState(null)
  const [useServer, setUseServer] = useState(false)
  const [serverStatus, setServerStatus] = useState(null)

  useEffect(() => {
    const key = generateKey()
    setEncryptionKey(key)
    console.log('Encryption key generated')
  }, [])

  useEffect(() => {
    const checkServer = async () => {
      try {
        const response = await fetch(SERVER_URL)
        const data = await response.json()
        if (data.novaSdk) {
          setServerStatus('online')
          setUseServer(true)
          console.log('Nova server online - using server encryption')
        } else {
          setServerStatus('offline')
          setUseServer(false)
          console.log('Nova server offline - using local encryption')
        }
      } catch (err) {
        setServerStatus('offline')
        setUseServer(false)
        console.log('Cannot reach Nova server - using local encryption')
      }
    }

    checkServer()
    const interval = setInterval(checkServer, 10000)
    return () => clearInterval(interval)
  }, [])

  const encryptAndUpload = async (message) => {
    setIsUploading(true)
    setError(null)

    try {
      const messageData = {
        text: message,
        timestamp: Date.now(),
        version: '1.0',
        sender: accountId
      }

      if (useServer) {
        console.log('Using server-side Nova SDK')
        
        const response = await fetch(SERVER_URL + '/api/nova/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message,
            groupId: accountId + '-messages'
          })
        })

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || 'Upload failed')
        }

        const result = await response.json()
        
        return {
          cid: result.cid,
          trans_id: result.transId,
          file_hash: result.fileHash,
          encryptedB64: null,
          encryptionKey: null,
          localOnly: false,
          serverUsed: true
        }
      } else {
        console.log('Using local Nova-compatible encryption')
        
        const data = Buffer.from(JSON.stringify(messageData))
        const newEncryptionKey = generateKey()
        const encryptedB64 = await encryptDataNovaCompatible(data, newEncryptionKey)

        return {
          cid: null,
          trans_id: null,
          file_hash: null,
          encryptedB64,
          encryptionKey: newEncryptionKey,
          localOnly: true,
          serverUsed: false
        }
      }
    } catch (err) {
      console.error('Encryption failed:', err)
      const errorMsg = err.message || 'Encryption failed'
      setError(errorMsg)
      throw new Error(errorMsg)
    } finally {
      setIsUploading(false)
    }
  }

  const encryptLocal = async (message) => {
    if (!encryptionKey) {
      throw new Error('Encryption key not ready')
    }

    const messageData = {
      text: message,
      timestamp: Date.now(),
      version: '1.0',
      sender: accountId
    }

    const data = Buffer.from(JSON.stringify(messageData))
    const encryptedB64 = await encryptDataNovaCompatible(data, encryptionKey)

    return {
      encryptedB64,
      encryptionKey
    }
  }

  const decryptLocal = async (encryptedB64, key) => {
    try {
      const decrypted = await decryptDataNovaCompatible(encryptedB64, key)

      try {
        const jsonData = JSON.parse(decrypted)
        return { success: true, data: jsonData, format: 'json' }
      } catch {
        return { success: true, data: decrypted, format: 'text' }
      }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  return {
    encryptAndUpload,
    encryptLocal,
    decryptLocal,
    isUploading,
    error,
    serverStatus,
    useServer,
    isReady: true
  }
}
