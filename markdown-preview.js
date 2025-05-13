const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const { marked } = require('marked');
const os = require('os');

// Path to a local Markdown file (change as needed)
// const markdownFile = path.join(__dirname, 'README.md');
const markdownFile = path.join(__dirname, 'test_proofread_spelling_review.txt');

// const markdownFile = path.join(os.homedir(), 'writing', 'Ezra Patel', 'rhythm_analysis_all_20250417T154159_thinking.txt');

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

  // Read and convert markdown file to HTML
  const mdContent = fs.readFileSync(markdownFile, 'utf-8');
  const htmlContent = `
    <html>
      <head>
        <meta charset="UTF-8" />
        <title>Markdown Preview</title>
        <style>
          body { font-family: sans-serif; padding: 20px; line-height: 1.6; }
          pre, code { background: #f0f0f0; padding: 4px; border-radius: 4px; }
        </style>
      </head>
      <body>${marked(mdContent)}</body>
    </html>
  `;

  win.loadURL('data:text/html;charset=UTF-8,' + encodeURIComponent(htmlContent));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});
