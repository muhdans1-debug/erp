const fs = require('fs');
const pdfModule = require('pdf-parse');
const axios = require('axios');

async function importFromPdf() {
  const dataBuffer = fs.readFileSync('PartyReport.pdf');
  
  // Safely extract the parsing function across different CommonJS/ESM compilation outputs
  const parseFunction = typeof pdfModule === 'function' ? pdfModule : (pdfModule.default || pdfModule.pdfParse || pdfModule);
  
  if (typeof parseFunction !== 'function') {
    throw new Error(`Failed to resolve pdf-parse function. Type is: ${typeof parseFunction}`);
  }

  const pdfData = await parseFunction(dataBuffer);
  const text = pdfData.text;

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const API_URL = 'https://layali-git.up.railway.app/api/customers';

  console.log(`Parsed total valid lines: ${lines.length}. Processing records...`);

  let importedCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (line.includes('BD ')) {
      try {
        const balanceMatch = line.match(/BD\s*([\d,]+\.\d+)/);
        if (!balanceMatch) continue;
        const currentDue = parseFloat(balanceMatch[1].replace(',', ''));

        let phone = '39000000';
        let nameParts = [];

        for (let j = Math.max(0, i - 4); j < i; j++) {
          const candidate = lines[j];
          if (/^\+?\d{7,15}$/.test(candidate)) {
            phone = candidate;
          } else if (candidate && !/^\d+$/.test(candidate) && !candidate.startsWith('BD') && !candidate.includes('Name') && !candidate.includes('Phone')) {
            nameParts.push(candidate);
          }
        }

        let name = nameParts.length > 0 ? nameParts.join(' ') : (lines[i - 1] || `Party #${i}`);
        name = name.replace(/^[0-9]+\s*/, '').trim();

        if (!name || name.toLowerCase() === 'bd' || name.length < 2) continue;

        await axios.post(API_URL, {
          name: name,
          phone: phone,
          address: 'Kingdom of Bahrain',
          openingBalance: currentDue
        });

        importedCount++;
        console.log(`[Imported #${importedCount}] ${name} | Phone: ${phone} | Due: BD ${currentDue}`);
      } catch (err) {
        console.error(`Failed at line index ${i}:`, err.response?.data || err.message);
      }
    }
  }
  console.log(`Full PDF import process completed! Total imported: ${importedCount}`);
}

importFromPdf();