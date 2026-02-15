#!/bin/bash

# Test the NFT sync endpoint manually
# This script tests the sync without waiting for the cron trigger

echo "Testing NFT Holder Sync..."
echo ""

# Check if you're logged in as admin
echo "Make sure you're logged in as an admin user!"
echo "Visit: https://near-agent.pages.dev/login"
echo ""

# Trigger the sync endpoint
echo "Triggering sync endpoint..."
curl -X POST https://near-agent.pages.dev/api/admin/sync-holders \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -v

echo ""
echo ""
echo "If successful, you should see:"
echo "  {"
echo "    \"success\": true,"
echo "    \"message\": \"NFT holder sync completed\","
echo "    \"synced\": <number>,"
echo "    \"timestamp\": \"...\""
echo "  }"
