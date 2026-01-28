/**
 * Script to fetch all 462 holders of ascendant.nearlegion.near
 * Handles rate limiting by adding delays between requests
 */

import fs from 'fs';
import https from 'https';

const API_BASE = 'https://api.nearblocks.io/v1/nfts/ascendant.nearlegion.near/holders';
const PER_PAGE = 100;
const DELAY_BETWEEN_REQUESTS = 3000; // 3 seconds between requests to avoid rate limiting
const MAX_RETRIES = 3;

// Function to make HTTP request
function makeRequest(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'NEAR-Builders-Tool' } }, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          if (res.statusCode === 200) {
            const jsonData = JSON.parse(data);
            resolve(jsonData);
          } else if (res.statusCode === 429) {
            resolve({ message: 'Rate limited', status: 429 });
          } else {
            resolve({ message: `HTTP ${res.statusCode}: ${res.statusMessage}` });
          }
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', (e) => {
      reject(e);
    });
  });
}

// Function to fetch all holders with proper delay
async function fetchAllHolders() {
  console.log('Fetching all holders of ascendant.nearlegion.near...');

  let allHolders = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    try {
      const url = `${API_BASE}?per_page=${PER_PAGE}&page=${page}`;
      console.log(`Fetching page ${page}...`);

      const response = await makeRequest(url);

      // Check if we hit rate limit
      if (response.status === 429 || (response.message && response.message.includes('Rate limited'))) {
        console.log('Rate limit hit, waiting 30 seconds...');
        await new Promise(resolve => setTimeout(resolve, 30000));
        continue; // Retry same page
      }

      // Check for other errors
      if (response.message && !response.holders) {
        console.error(`Error: ${response.message}`);
        break;
      }

      if (response.holders && response.holders.length > 0) {
        allHolders = allHolders.concat(response.holders);
        console.log(`Page ${page}: Found ${response.holders.length} holders (total: ${allHolders.length})`);

        // Check if there are more pages
        hasMore = response.holders.length === PER_PAGE;
        page++;

        // Add delay between requests to avoid rate limiting
        if (hasMore) {
          console.log(`Waiting ${DELAY_BETWEEN_REQUESTS/1000} seconds before next request...`);
          await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_REQUESTS));
        }
      } else {
        hasMore = false;
      }
    } catch (error) {
      console.error(`Error on page ${page}:`, error.message);

      // Try a few more times
      if (page > 1) { // Don't retry first page
        page--;
      }
    }
  }

  console.log(`\n✅ Fetched all ${allHolders.length} holders!`);

  // Sort and deduplicate
  const uniqueAccounts = [...new Set(allHolders.map(h => h.account))];
  console.log(`Unique accounts: ${uniqueAccounts.length}`);

  // Save to file
  const accountsText = uniqueAccounts.join('\n');
  fs.writeFileSync('ascendant_holders_all.txt', accountsText, 'utf8');
  console.log(`\n📁 Saved all unique account IDs to ascendant_holders_all.txt`);

  return uniqueAccounts;
}

// Run the function
fetchAllHolders().catch(console.error);
