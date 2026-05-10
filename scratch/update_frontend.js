const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '../public');

function processFile(filePath) {
    const ext = path.extname(filePath);
    if (!['.html', '.js'].includes(ext)) return;

    // Skip our newly created api.js
    if (filePath.endsWith('api.js')) return;

    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;

    if (ext === '.html') {
        // Inject script if not present
        if (!content.includes('src="/js/api.js"')) {
            // Find </head> or end of <head> to inject
            const headEndIndex = content.indexOf('</head>');
            if (headEndIndex !== -1) {
                const scriptTag = '\n    <script src="/js/api.js"></script>\n';
                content = content.slice(0, headEndIndex) + scriptTag + content.slice(headEndIndex);
                modified = true;
            } else if (content.indexOf('<body>') !== -1) {
                // if no head, inject inside body
                const bodyStartIndex = content.indexOf('<body>') + 6;
                const scriptTag = '\n    <script src="/js/api.js"></script>\n';
                content = content.slice(0, bodyStartIndex) + scriptTag + content.slice(bodyStartIndex);
                modified = true;
            }
        }
    }

    // Replace fetch(
    // We should be careful to only replace fetch calls that are API calls, e.g. fetch('/api/
    // We'll replace both double quotes, single quotes, and backticks.
    const fetchRegex = /fetch\s*\(\s*(['"`]\/api\/)/g;
    if (fetchRegex.test(content)) {
        content = content.replace(fetchRegex, 'apiFetch($1');
        modified = true;
    }

    // Also handle cases where fetch argument is a variable like fetch(url) or fetch(fetchUrl)
    // We'll look for `fetch(url` and `fetch(fetchUrl` and replace with `apiFetch(url`
    const dynamicFetchRegex = /fetch\s*\(\s*(url|fetchUrl)/g;
    if (dynamicFetchRegex.test(content)) {
        content = content.replace(dynamicFetchRegex, 'apiFetch($1');
        modified = true;
    }

    // Handle io()
    const ioRegex = /\bio\s*\(\s*\)/g;
    if (ioRegex.test(content)) {
        content = content.replace(ioRegex, 'window.initSocket()');
        modified = true;
    }

    if (modified) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated: ${filePath}`);
    }
}

function traverseDirectory(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            traverseDirectory(fullPath);
        } else {
            processFile(fullPath);
        }
    }
}

console.log('Starting frontend update...');
traverseDirectory(publicDir);
console.log('Update complete.');
