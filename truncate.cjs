const fs = require('fs');

const cssPath = 'src/styles/globals.css';
const content = fs.readFileSync(cssPath, 'utf8');

// Find everything up to and including the last closing brace of the
// @media (max-width: 900px) block for .category-sidebar before the leaderboard CSS
// We'll look for the line with .category-sidebar-list padding-right: 2px
// and take everything up through the closing braces after it.

// Split into lines
const lines = content.split('\n');

// Find the end of the original CSS (before any leaderboard styles were appended)
// We need to find line that says "}" right after the category-sidebar media query.
// Looking at the file, line 2087 has "}" and line 2088 has "}\r" which is the extra close brace

let cutIndex = -1;
for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('.leaderboard') || trimmed === '') {
        continue;
    }
    // Found the last non-leaderboard, non-empty line
    cutIndex = i + 1;
    break;
}

// Actually, let's be more precise. Find the last occurrence of category-sidebar-list
let lastCatLine = -1;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('category-sidebar-list')) {
        lastCatLine = i;
    }
}

// From that line, find the next two closing braces (one for the rule, one for the media query)
let braceCount = 0;
let endLine = lastCatLine;
for (let i = lastCatLine; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === '}') {
        braceCount++;
        endLine = i;
        if (braceCount >= 2) break;
    }
}

// Take everything up to and including endLine
const kept = lines.slice(0, endLine + 1).join('\n');

// Write the truncated file
fs.writeFileSync(cssPath, kept + '\n', 'utf8');

console.log(`Truncated globals.css. Kept ${endLine + 1} lines (was ${lines.length}).`);
console.log(`Last kept line: "${lines[endLine].trim()}"`);
