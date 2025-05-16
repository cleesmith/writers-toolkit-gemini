// run this:
// npx electron markdown-view-edit.js
const { app, BrowserWindow, globalShortcut, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { marked } = require('marked');

let win;
let currentFilePath;

function createWindow() {
  win = new BrowserWindow({
    width: 800,
    height: 600,
    title: 'Markdown Editor',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // Start with an empty editor
  loadEmptyEditor();

  // Handle IPC messages from renderer
  setupIPC();

  // Register dev tools shortcut for debugging
  globalShortcut.register('CommandOrControl+Shift+I', () => {
    if (win) win.webContents.openDevTools();
  });
}

function setupIPC() {
  // Handle open file dialog request
  ipcMain.on('open-file-dialog', (event) => {
    dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [
        { name: 'Text Files', extensions: ['md', 'txt'] }
      ]
    }).then(result => {
      if (!result.canceled && result.filePaths.length > 0) {
        const filePath = result.filePaths[0];
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          event.sender.send('file-opened', {
            filePath: filePath,
            content: content
          });
        } catch (error) {
          event.sender.send('error', {
            title: 'File Error',
            message: `Failed to read file: ${error.message}`
          });
        }
      }
    }).catch(err => {
      event.sender.send('error', {
        title: 'Dialog Error',
        message: err.message
      });
    });
  });

  // Handle save file dialog request
  ipcMain.on('save-file-dialog', (event, { content, suggestedPath }) => {
    // Set the default path for the dialog to the current file or a default location
    const defaultPath = suggestedPath || path.join(app.getPath('documents'), 'Untitled.md');
    
    dialog.showSaveDialog(win, {
      defaultPath: defaultPath,
      filters: [
        { name: 'Markdown', extensions: ['md'] },
        { name: 'Text', extensions: ['txt'] }
      ]
    }).then(result => {
      if (!result.canceled && result.filePath) {
        try {
          fs.writeFileSync(result.filePath, content, 'utf-8');
          event.sender.send('file-saved', {
            filePath: result.filePath
          });
        } catch (error) {
          event.sender.send('error', {
            title: 'Save Error',
            message: `Failed to save file: ${error.message}`
          });
        }
      }
    }).catch(err => {
      event.sender.send('error', {
        title: 'Dialog Error',
        message: err.message
      });
    });
  });
  
  // Handle quit application request
  ipcMain.on('quit-app', () => {
    app.quit();
  });
}

function loadEmptyEditor() {
  const defaultContent = '# Welcome to Markdown Editor\n\nClick the Edit Mode button (eye icon) in the top-right corner to start editing.\n\nSupported features:\n- Headings\n- **Bold** and *italic* text\n- Lists and checkboxes\n- Code blocks\n- And more!';
  renderContent(defaultContent, 'Untitled');
}

function renderContent(content, fileName) {
  win.setTitle(`Markdown Editor - ${fileName}`);
  
  const htmlContent = `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
  <meta charset="UTF-8">
  <title>Markdown Editor</title>
  <style>
    :root[data-theme="light"] { 
      --bg:#fff; 
      --text:#000; 
      --code-bg:#f0f0f0; 
      --link:#0366d6; 
      --blockquote-border:#ccc; 
      --blockquote-text:#555; 
      --hr:#ccc; 
      --popup-bg:#fff; 
      --popup-shadow:rgba(0,0,0,0.2);
      --button-hover:#e0e0e0;
      --close-button:#f44336;
      --close-button-hover:#e53935;
      --button-tooltip-bg:rgba(0,0,0,0.8);
      --button-tooltip-text:#fff;
      --toolbar-bg:rgba(245,245,245,0.9);
      --filepath-text:#555;
    }
    :root[data-theme="dark"] { 
      --bg:#1e1e1e; 
      --text:#ddd; 
      --code-bg:#2d2d2d; 
      --link:#58a6ff; 
      --blockquote-border:#444; 
      --blockquote-text:#aaa; 
      --hr:#444; 
      --popup-bg:#333; 
      --popup-shadow:rgba(0,0,0,0.5);
      --button-hover:#444;
      --close-button:#f44336;
      --close-button-hover:#e53935;
      --button-tooltip-bg:rgba(255,255,255,0.9);
      --button-tooltip-text:#000;
      --toolbar-bg:rgba(32,32,32,0.9);
      --filepath-text:#aaa;
    }
    body { 
      margin:0; 
      padding-top:38px; /* Reduced from 52px */
      font-family:system-ui, -apple-system, sans-serif; 
      background:var(--bg); 
      color:var(--text); 
      transition:background 0.3s, color 0.3s; 
    }
    #toolbar {
      position:fixed;
      top:0;
      left:0;
      right:0;
      height:38px;
      background:var(--toolbar-bg);
      display:flex;
      align-items:center;
      justify-content:space-between;
      padding:0 10px;
      box-shadow:0 1px 3px rgba(0,0,0,0.1);
      z-index:1000;
      backdrop-filter:blur(5px);
    }
    #filepath {
      flex-grow:1;
      margin-right:10px;
      font-size:13px;
      color:var(--filepath-text);
      white-space:nowrap;
      overflow:hidden;
      text-overflow:ellipsis;
      padding:0 8px;
    }
    #controls { 
      display:flex; 
      gap:8px;
    }
    .control-button { 
      width:32px; 
      height:32px; 
      padding:4px; 
      border:none; 
      background:var(--code-bg); 
      border-radius:50%; 
      cursor:pointer; 
      display:flex; 
      align-items:center; 
      justify-content:center; 
      transition:all 0.2s; 
      position:relative;
    }
    .control-button:hover { 
      transform: scale(1.1); 
      background:var(--button-hover);
    }
    .control-button svg { 
      width:18px; 
      height:18px; 
      fill:var(--text); 
    }
    #close-button {
      background:var(--code-bg);
    }
    #close-button:hover {
      background:var(--button-hover);
    }
    #close-button svg {
      fill:var(--text);
    }
    #edit-icon { display:none; }
    .edit-mode #view-icon { display:none; }
    .edit-mode #edit-icon { display:inline; }
    [data-theme="light"] #moon-icon { display:none; }
    [data-theme="dark"] #sun-icon { display:none; }
    #preview { 
      padding:8px 20px; /* Reduced top padding */
      overflow-y:auto; 
      height:calc(100vh - 38px); /* Adjusted for smaller toolbar */
    }
    #editor { 
      display:none; 
      width:100%; 
      height:calc(100vh - 38px); /* Adjusted for smaller toolbar */
      padding:8px 20px; /* Reduced top padding */
      box-sizing:border-box; 
      font-family:monospace; 
      font-size:14px; 
      line-height:1.5; 
      background:var(--bg); 
      color:var(--text); 
      border:none; 
      resize:none; 
    }
    .edit-mode #preview { display:none; }
    .edit-mode #editor { display:block; }
    
    /* Tooltip styles */
    .tooltip {
      position: absolute;
      top: 100%;
      left: 50%;
      transform: translateX(-50%);
      padding: 6px 10px;
      border-radius: 4px;
      background-color: var(--button-tooltip-bg);
      color: var(--button-tooltip-text);
      font-size: 12px;
      white-space: nowrap;
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.2s, visibility 0.2s;
      pointer-events: none;
      z-index: 1001;
      margin-top: 5px;
      box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    }
    .control-button:hover .tooltip {
      opacity: 1;
      visibility: visible;
    }
    
    /* Markdown styles */
    #preview h1, #preview h2 { 
      border-bottom: 1px solid var(--hr); 
      padding-bottom: 0.3em; 
      margin-top: 1.2em;
      margin-bottom: 0.6em;
    }
    #preview h1:first-child {
      margin-top: 0.4em; /* Reduced top margin for first heading */
    }
    #preview pre { 
      background: var(--code-bg); 
      padding: 16px; 
      border-radius: 6px; 
      overflow: auto; 
    }
    #preview code { 
      background: var(--code-bg); 
      padding: 0.2em 0.4em; 
      border-radius: 3px; 
      font-family: monospace; 
    }
    #preview a { 
      color: var(--link); 
      text-decoration: none; 
    }
    #preview a:hover { 
      text-decoration: underline; 
    }
    #preview blockquote { 
      border-left: 4px solid var(--blockquote-border); 
      margin-left: 0; 
      padding-left: 16px; 
      color: var(--blockquote-text); 
    }
    
    /* Custom popup notification */
    #notification {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: var(--popup-bg);
      color: var(--text);
      padding: 12px 16px;
      border-radius: 8px;
      box-shadow: 0 4px 12px var(--popup-shadow);
      display: none;
      z-index: 2000;
      transition: opacity 0.3s, transform 0.3s;
      opacity: 0;
      transform: translateY(10px);
    }
    #notification.visible {
      display: block;
      opacity: 1;
      transform: translateY(0);
    }
    
    /* Ensure lists are properly formatted */
    #preview ul, #preview ol {
      padding-left: 2em;
    }
    #preview li {
      margin: 0.3em 0;
    }
  </style>
</head>
<body>
  <div id="toolbar">
    <div id="filepath">Untitled</div>
    <div id="controls">
      <button id="open-button" class="control-button">
        <svg viewBox="0 0 24 24"><path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z"></path></svg>
        <span class="tooltip">Open .md or .txt</span>
      </button>
      <button id="mode-toggle" class="control-button">
        <svg id="view-icon" viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"></path></svg>
        <svg id="edit-icon" viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"></path></svg>
        <span class="tooltip" id="mode-tooltip">Edit</span>
      </button>
      <button id="save-button" class="control-button">
        <svg viewBox="0 0 24 24"><path d="M17 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7l-4-4zm2 16H5V5h11.17L19 7.83V19zM12 12c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3zm-5-6h8v2H7z"></path></svg>
        <span class="tooltip">Save As</span>
      </button>
      <button id="remove-markdown-button" class="control-button">
        <svg viewBox="0 0 24 24"><path d="M3 5h12v2H3zm0 4h12v2H3zm0 4h8v2H3zm10 0h8v2h-8zm3-8.5l-1.41 1.41L17.17 8.5l-2.58 2.59L16 12.5l4-4-4-4zm-6 9l1.41-1.41L9.83 15.5l2.58-2.59L11 11.5l-4 4 4 4z"></path></svg>
        <span class="tooltip">Remove Markdown</span>
      </button>
      <button id="theme-toggle" class="control-button">
        <svg id="sun-icon" viewBox="0 0 24 24"><path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0 .39-.39.39-1.03 0-1.41L5.99 4.58zm12.37 12.37c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0 .39-.39.39-1.03 0-1.41l-1.06-1.06zm1.06-10.96c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41.39.39 1.03.39 1.41 0l1.06-1.06zM7.05 18.36c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41.39.39 1.03.39 1.41 0l1.06-1.06z"></path></svg>
        <svg id="moon-icon" viewBox="0 0 24 24"><path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-2.98 0-5.4-2.42-5.4-5.4 0-1.81.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z"></path></svg>
        <span class="tooltip" id="theme-tooltip">go Dark</span>
      </button>
      <button id="close-button" class="control-button">
        <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"></path></svg>
        <span class="tooltip">Close</span>
      </button>
    </div>
  </div>
  
  <div id="preview">${marked(content)}</div>
  <textarea id="editor">${content}</textarea>
  
  <!-- Custom notification popup -->
  <div id="notification">Save successful</div>
  
  <script>
    // Import required modules
    const { marked } = require('marked');
    const { ipcRenderer } = require('electron');
    const path = require('path');
    
    // Get DOM elements
    const htmlEl = document.documentElement;
    const previewEl = document.getElementById('preview');
    const editorEl = document.getElementById('editor');
    const notificationEl = document.getElementById('notification');
    const modeToggleEl = document.getElementById('mode-toggle');
    const modeTooltipEl = document.getElementById('mode-tooltip');
    const themeTooltipEl = document.getElementById('theme-tooltip');
    const filepathEl = document.getElementById('filepath');
    
    // Track current file path
    let currentFilePath = ${JSON.stringify(currentFilePath || null)};
    
    // Add the removeMarkdown function
    const removeMarkdown = (function() {
      return function(md, options) {
        // Set default options if none provided
        options = options || {};
        options.listUnicodeChar = options.hasOwnProperty('listUnicodeChar') ? options.listUnicodeChar : false;
        options.stripListLeaders = options.hasOwnProperty('stripListLeaders') ? options.stripListLeaders : true;
        options.gfm = options.hasOwnProperty('gfm') ? options.gfm : true;
        options.useImgAltText = options.hasOwnProperty('useImgAltText') ? options.useImgAltText : true;
        options.preserveBlockSpacing = options.hasOwnProperty('preserveBlockSpacing') ? options.preserveBlockSpacing : true;
        var output = md || '';
        // Remove horizontal rules
        output = output.replace(/^(-\\s*?|\\*\\s*?|_\\s*?){3,}\\s*$/gm, '');
        try {
          // Handle list markers
          if (options.stripListLeaders) {
            if (options.listUnicodeChar) {
              output = output.replace(/^([\\s\\t]*)([\*\-\+]|\\d+\\.)\\s+/gm, options.listUnicodeChar + ' $1');
            } else {
              output = output.replace(/^([\\s\\t]*)([\*\-\+]|\\d+\\.)\\s+/gm, '$1');
            }
          }
          // Handle GitHub Flavored Markdown features
          if (options.gfm) {
            output = output
              .replace(/\\n={2,}/g, '\\n')
              .replace(/~{3}.*\\n/g, '')
              // Improved code block handling
              .replace(/(\`{3,})([\\s\\S]*?)\\1/gm, function(match, p1, p2) {
                return p2.trim() + '%%CODEBLOCK_END%%\\n';
              })
              .replace(/~~/g, '');
          }
          // Process main markdown elements
          output = output
            // Remove HTML tags
            .replace(/<[^>]*>/g, '')
            // Remove setext headers
            .replace(/^[=\\-]{2,}\\s*$/g, '')
            // Remove footnotes
            .replace(/\\[\\^.+?\\](\\: .*?$)?/g, '')
            .replace(/\\s{0,2}\\[.*?\\]: .*?$/g, '')
            // Handle images and links
            .replace(/\\!\\[(.*?)\\][\\[\\(].*?[\\]\\)]/g, options.useImgAltText ? '$1' : '')
            .replace(/\\[(.*?)\\][\\[\\(].*?[\\]\\)]/g, '$1')
            // Better blockquote handling with spacing
            .replace(/^\\s*>+\\s?/gm, function(match) {
              return options.preserveBlockSpacing ? '\\n' : '';
            })
            // Remove list markers again (thorough cleanup)
            .replace(/^([\\s\\t]*)([\*\-\+]|\\d+\\.)\\s+/gm, '$1')
            // Remove reference links
            .replace(/^\\s{1,2}\\[(.*?)\\]: (\\S+)( ".*?")?\\s*$/g, '')
            // Remove headers
            .replace(/^(\\n)?\\s{0,}#{1,6}\\s+| {0,}(\\n)?\\s{0,}#{0,} {0,}(\\n)?\\s{0,}$/gm, '$1$2$3')
            // Remove emphasis
            .replace(/([\\*_]{1,3})(\\S.*?\\S{0,1})\\1/g, '$2')
            .replace(/([\\*_]{1,3})(\\S.*?\\S{0,1})\\1/g, '$2')
            // Remove code markers
            .replace(/\`(.+?)\`/g, '$1');
          // Final cleanup and spacing
          output = output
            // Replace code block markers with proper spacing
            .replace(/%%CODEBLOCK_END%%\\n/g, '\\n\\n\\n')
            // Normalize multiple newlines while preserving block spacing
            .replace(/\\n{4,}/g, '\\n\\n\\n')
            .replace(/\\n{3}/g, '\\n\\n')
            // Clean up any trailing whitespace
            .trim();
        } catch(e) {
          console.error('Error processing markdown:', e);
          return md;
        }
        return output;
      };
    })();
    
    // Simple function to update the filepath display - no special formatting
    function updateFilepathDisplay(filePath) {
      if (!filePath) {
        filepathEl.textContent = "Untitled";
      } else {
        // Just use path.resolve() to normalize the path and display it directly
        const normalizedPath = path.resolve(filePath);
        filepathEl.textContent = normalizedPath;
        filepathEl.title = normalizedPath; // Add tooltip for full path on hover
      }
    }
    
    // Initialize filepath display
    updateFilepathDisplay(currentFilePath);
    
    // Edit mode toggle
    modeToggleEl.addEventListener('click', () => {
      const isEditMode = htmlEl.classList.contains('edit-mode');
      
      if (isEditMode) {
        // Switching from edit to view mode - update preview content
        previewEl.innerHTML = marked(editorEl.value);
        modeTooltipEl.textContent = 'Edit';
      } else {
        // Switching to edit mode
        modeTooltipEl.textContent = 'View';
      }
      
      htmlEl.classList.toggle('edit-mode');
    });
    
    // Theme toggle
    document.getElementById('theme-toggle').addEventListener('click', () => {
      const isDarkTheme = htmlEl.getAttribute('data-theme') === 'dark';
      
      if (isDarkTheme) {
        htmlEl.setAttribute('data-theme', 'light');
        themeTooltipEl.textContent = 'go Dark';
      } else {
        htmlEl.setAttribute('data-theme', 'dark');
        themeTooltipEl.textContent = 'go Light';
      }
    });
    
    // Open file button
    document.getElementById('open-button').addEventListener('click', () => {
      // Use IPC to request file dialog from main process
      ipcRenderer.send('open-file-dialog');
    });
    
    // Save button - Always show Save As dialog
    document.getElementById('save-button').addEventListener('click', () => {
      const content = editorEl.value;
      
      // Always show save dialog with the current file path as the suggested path
      ipcRenderer.send('save-file-dialog', {
        content: content,
        suggestedPath: currentFilePath
      });
    });
    
    // Remove Markdown button
    document.getElementById('remove-markdown-button').addEventListener('click', () => {
      // Make sure we're in edit mode
      if (!htmlEl.classList.contains('edit-mode')) {
        htmlEl.classList.add('edit-mode');
        modeTooltipEl.textContent = 'View';
      }
      
      // Get the current content and remove markdown
      const plainText = removeMarkdown(editorEl.value);
      
      // Update the editor with plain text
      editorEl.value = plainText;
      
      // Update preview content (even though it's not visible in edit mode)
      previewEl.innerHTML = marked(plainText);
      
      // Show notification
      showNotification('Markdown removed');
    });
    
    // Close button
    document.getElementById('close-button').addEventListener('click', () => {
      // Ask for confirmation if content has been modified and not saved
      if (isContentModified()) {
        if (confirm('You have unsaved changes. Are you sure you want to quit?')) {
          ipcRenderer.send('quit-app');
        }
      } else {
        ipcRenderer.send('quit-app');
      }
    });
    
    // Track if content has been modified
    let originalContent = editorEl.value;
    function isContentModified() {
      return editorEl.value !== originalContent;
    }
    
    // Listen for file opened event
    ipcRenderer.on('file-opened', (event, data) => {
      currentFilePath = data.filePath;
      editorEl.value = data.content;
      originalContent = data.content;  // Update original content for change tracking
      previewEl.innerHTML = marked(data.content);
      document.title = 'Markdown Preview - ' + getFileName(data.filePath);
      updateFilepathDisplay(data.filePath);
    });
    
    // Listen for file saved event
    ipcRenderer.on('file-saved', (event, data) => {
      currentFilePath = data.filePath;
      document.title = 'Markdown Preview - ' + getFileName(data.filePath);
      previewEl.innerHTML = marked(editorEl.value);
      originalContent = editorEl.value;  // Update original content after save
      updateFilepathDisplay(data.filePath);
      showNotification('Save successful');
    });
    
    // Listen for errors
    ipcRenderer.on('error', (event, data) => {
      alert(data.title + ': ' + data.message);
    });
    
    // Helper functions
    function showNotification(message) {
      notificationEl.textContent = message;
      notificationEl.classList.add('visible');
      
      // Hide after 2 seconds
      setTimeout(() => {
        notificationEl.classList.remove('visible');
      }, 2000);
    }
    
    function getFileName(filePath) {
      if (!filePath) return 'Untitled';
      return path.basename(filePath);
    }
  </script>
</body>
</html>`;

  win.loadURL('data:text/html;charset=UTF-8,' + encodeURIComponent(htmlContent));
}

// Initialize app when ready
app.whenReady().then(() => {
  createWindow();
});

// Quit when all windows are closed
app.on('window-all-closed', () => {
  app.quit();
});
