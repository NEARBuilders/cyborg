import { useState, useEffect } from 'react'
import { HotKit } from '@hot-labs/kit'
import { defaultConnectors } from '@hot-labs/kit/defaults'

/**
 * Simple wallet auth using hot-dao/kit ✨
 */
let kit = null

// Initialize HotKit
function initKit() {
  if (!kit) {
    kit = new HotKit({
      connectors: defaultConnectors,
      apiKey: import.meta.env.VITE_HOT_API_KEY || '',
      walletConnect: {
        projectId: '1292473190ce7eb75c9de67e15aaad99',
        metadata: {
          name: 'Nova Encrypt',
          description: 'End-to-end encrypted messaging',
          url: window.location.origin,
          icons: ['/favicon.ico'],
        },
      },
    })
  }
  return kit
}

export function useNearAuth() {
  const [accountId, setAccountId] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [wallet, setWallet] = useState(null)
  const [, forceUpdate] = useState({})

  // Poll for wallet state
  useEffect(() => {
    const kit = initKit()

    const checkWallets = () => {
      const wallets = kit.wallets || []
      if (wallets.length > 0) {
        const connectedWallet = wallets[0]
        const address = connectedWallet.address || connectedWallet.accountId
        setAccountId(address)
        setWallet(connectedWallet)
      } else {
        setAccountId(null)
        setWallet(null)
      }
    }

    // Check immediately
    checkWallets()

    // Poll for changes
    const interval = setInterval(checkWallets, 500)

    return () => clearInterval(interval)
  }, [])

  const signIn = async () => {
    setIsLoading(true)
    try {
      const kit = initKit()
      await kit.connect()
    } catch (err) {
      console.error('Sign in failed:', err)
      throw err
    } finally {
      setIsLoading(false)
    }
  }

  const signOut = async () => {
    const kit = initKit()
    kit.disconnect()
    setAccountId(null)
    setWallet(null)
  }

  return {
    accountId,
    isAuthenticated: !!accountId,
    isLoading,
    signIn,
    signOut,
    nearClient: wallet
  }
}
