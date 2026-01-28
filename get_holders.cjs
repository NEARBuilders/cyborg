// Script to fetch all holders of ascendant.nearlegion.near
// This script will handle rate limiting and pagination automatically

const fs = require('fs');
const https = require('https');

const API_BASE = 'https://api.nearblocks.io/v1/nfts/ascendant.nearlegion.near/holders';
const PER_PAGE = 100;
const RATE_LIMIT_DELAY = 2000; // 2 seconds between requests to avoid rate limiting

// Function to make HTTP request
function makeRequest(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve(jsonData);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', (e) => {
      reject(e);
    });
  });
}

// Function to fetch all holders with delay between requests
async function fetchAllHolders() {
  let allHolders = [];
  let page = 1;
  let hasMore = true;

  console.log('Fetching all holders of ascendant.nearlegion.near...');

  while (hasMore) {
    try {
      console.log(`Fetching page ${page}...`);

      const url = `${API_BASE}?per_page=${PER_PAGE}&page=${page}`;
      const response = await makeRequest(url);

      // Check if we hit rate limit
      if (response.message && response.message.includes('exceeded your API request limit')) {
        console.log('Rate limit hit, waiting 10 seconds...');
        await new Promise(resolve => setTimeout(resolve, 10000));
        continue; // Retry same page
      }

      if (response.holders && response.holders.length > 0) {
        allHolders = allHolders.concat(response.holders);
        console.log(`Page ${page}: Found ${response.holders.length} holders (total: ${allHolders.length})`);

        // Check if there are more pages by seeing if we got a full page
        hasMore = response.holders.length === PER_PAGE;
        page++;

        // Add delay between requests to avoid rate limiting
        if (hasMore) {
          console.log(`Waiting ${RATE_LIMIT_DELAY/1000} seconds before next request...`);
          await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
        }
      } else {
        hasMore = false;
      }
    } catch (error) {
      console.error(`Error on page ${page}:`, error.message);
      // Wait a bit longer on errors
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  console.log(`\n✅ Fetched all ${allHolders.length} holders!`);

  // Save to file
  const accounts = allHolders.map(h => h.account).join('\n');
  fs.writeFileSync('ascendant_holders.txt', accounts, 'utf8');
  console.log(`\n📁 Saved all account IDs to ascendant_holders.txt`);

  return allHolders;
}

// Run the function
fetchAllHolders().catch(console.error);
