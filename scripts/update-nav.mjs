import fs from 'fs';
import path from 'path';

const link = `\n            <a href="/owners.html" class="nav-link"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>Proprietários</a>`;

const searchString1 = `</svg>Imóveis</a>`;
const searchString2 = `</svg>Imóveis</a>`;

const files = fs.readdirSync('.').filter(f => f.endsWith('.html') && f !== 'owners.html' && f !== 'login.html' && f !== 'register.html' && f !== 'index.html' && f !== 'new-rental.html');

for (const file of files) {
    let content = fs.readFileSync(file, 'utf8');
    if (content.includes('Proprietários</a>')) {
        console.log(`Skipped ${file} (already has it)`);
        continue;
    }
    
    // Find the end of the Imóveis link
    const idx = content.indexOf(searchString1);
    if (idx !== -1) {
        content = content.slice(0, idx + searchString1.length) + link + content.slice(idx + searchString1.length);
        fs.writeFileSync(file, content);
        console.log(`Updated ${file}`);
    } else {
        console.log(`Could not find Imóveis link in ${file}`);
    }
}
