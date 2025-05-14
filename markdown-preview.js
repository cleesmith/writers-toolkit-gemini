const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const { marked } = require('marked');

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 800,
    height: 600,
    title: 'Markdown Preview',
    webPreferences: {
      contextIsolation: true
    }
  });

  // Load local Markdown file (adjust path as needed)
  const markdownFile = path.join(__dirname, 'README.md');
  const mdContent = fs.readFileSync(markdownFile, 'utf-8');

  // Build HTML with manual theme toggle and SVG icons
  const htmlContent = `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
  <meta charset="UTF-8">
  <title>Markdown Preview</title>
  <style>
    /* Theme variables */
    :root[data-theme="light"] {
      --bg: #fff;
      --text: #000;
      --code-bg: #f0f0f0;
      --link: #0366d6;
      --blockquote-border: #ccc;
      --blockquote-text: #555;
      --hr: #ccc;
    }
    :root[data-theme="dark"] {
      --bg: #1e1e1e;
      --text: #ddd;
      --code-bg: #2d2d2d;
      --link: #58a6ff;
      --blockquote-border: #444;
      --blockquote-text: #aaa;
      --hr: #444;
    }

    /* Base styles */
    body {
      font-family: sans-serif;
      padding: 20px;
      line-height: 1.6;
      background: var(--bg);
      color: var(--text);
      transition: background 0.3s, color 0.3s;
    }
    pre, code {
      padding: 4px;
      border-radius: 4px;
      background: var(--code-bg);
      color: var(--text);
      transition: background 0.3s, color 0.3s;
    }
    a {
      text-decoration: underline;
      color: var(--link);
    }
    blockquote {
      margin: 1em 0;
      padding-left: 1em;
      border-left: 4px solid var(--blockquote-border);
      color: var(--blockquote-text);
    }
    hr {
      margin: 2em 0;
      border-color: var(--hr);
    }
    h1, h2, h3, h4, h5, h6 {
      margin-top: 1.5em;
    }
    #theme-toggle {
      position: fixed;
      top: 12px;
      right: 12px;
      width: 36px;
      height: 36px;
      padding: 4px;
      border: none;
      background: var(--code-bg);
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.3s;
      z-index: 1000;
    }
    #theme-toggle svg {
      width: 24px;
      height: 24px;
      fill: var(--text);
      transition: fill 0.3s;
    }
    /* Show/hide icons */
    [data-theme="light"] #moon-icon { display: none; }
    [data-theme="dark"] #sun-icon { display: none; }
  </style>
</head>
<body>
  <button id="theme-toggle" aria-label="Toggle theme">
    <svg id="sun-icon" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="5" />
      <g stroke="currentColor" stroke-width="2">
        <line x1="12" y1="1" x2="12" y2="3" />
        <line x1="12" y1="21" x2="12" y2="23" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1" y1="12" x2="3" y2="12" />
        <line x1="21" y1="12" x2="23" y2="12" />
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
      </g>
    </svg>
    <svg id="moon-icon" viewBox="0 0 24 24">
      <path d="M21 12.79A9 9 0 0111.21 3 7 7 0 0012 21a7 7 0 009-8.21z" />
    </svg>
  </button>
  ${marked(mdContent)}
  <script>
    const toggle = document.getElementById('theme-toggle');
    toggle.addEventListener('click', () => {
      const html = document.documentElement;
      const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      html.setAttribute('data-theme', next);
    });
  </script>
</body>
</html>`;

  // Load as a data URL
  win.loadURL('data:text/html;charset=UTF-8,' + encodeURIComponent(htmlContent));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});
