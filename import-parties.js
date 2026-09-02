const axios = require('axios');

// List your parties here or read them from a JSON/CSV file
const partiesToImport = [
  { name: 'Ahmed Al-Mahmoud', phone: '39111222', address: 'Manama' },
  { name: 'Fatima Trading', phone: '39333444', address: 'Muharraq' },
  // Add as many as you need...
];

async function bulkImport() {
  const API_URL = 'https://layali-git.up.railway.app/api/customers';

  for (const party of partiesToImport) {
    try {
      const res = await axios.post(API_URL, party);
      console.log(`Successfully added: ${res.data.customer?.name || party.name}`);
    } catch (err) {
      console.error(`Failed to add ${party.name}:`, err.response?.data || err.message);
    }
  }
  console.log('Bulk import complete!');
}

bulkImport();