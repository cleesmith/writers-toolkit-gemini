// editor-dialog.js - Modified to set preview as default mode

// DOM Elements - Reference these after DOM is fully loaded
let editor;
let preview;
let filepath;
let modeToggle;
let modeTooltip;
let openButton;
let saveButton;
let saveAsButton;
let closeButton;
let notification;
let fontSizeSelect;
let wordWrapToggle;
let removeMarkdownButton;
let positionDisplay;
let statisticsDisplay;
let htmlEl;

// State variables
let currentFilePath = null;
let documentChanged = false;
let originalContent = '';
let isWordWrapEnabled = true;

// Wait for DOM to be fully loaded before doing anything
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM fully loaded');
  
  // Initialize DOM references
  initDomReferences();
  
  // CHANGE: No longer setting edit mode as default
  // Instead, we'll update the preview and tooltip for preview mode
  
  // Set up editor event listeners
  setupEditorEvents();
  
  // Set up UI control event listeners
  setupControlEvents();
  
  // Initialize the font size from select element
  updateFontSize();
  
  // Initialize word wrap
  updateWordWrap();
  
  // CHANGE: Update the preview content for initial preview mode
  updatePreview();
  
  // CHANGE: Set the mode tooltip to "Edit" since we start in preview mode
  if (modeTooltip) {
    modeTooltip.textContent = 'Edit';
  }
  
  console.log('Editor initialization complete in preview mode');
});

// Initialize all DOM references
function initDomReferences() {
  editor = document.getElementById('editor');
  preview = document.getElementById('preview');
  filepath = document.getElementById('filepath');
  modeToggle = document.getElementById('mode-toggle');
  modeTooltip = document.getElementById('mode-tooltip');
  openButton = document.getElementById('open-button');
  saveButton = document.getElementById('save-button');
  saveAsButton = document.getElementById('save-as-button');
  closeButton = document.getElementById('close-button');
  removeMarkdownButton = document.getElementById('remove-markdown-button');
  notification = document.getElementById('notification');
  fontSizeSelect = document.getElementById('font-size-select');
  wordWrapToggle = document.getElementById('word-wrap-toggle');
  positionDisplay = document.getElementById('position');
  statisticsDisplay = document.getElementById('statistics');
  htmlEl = document.documentElement;
  
  console.log('DOM references initialized');
}

// Set up editor event listeners
function setupEditorEvents() {
  console.log('Setting up editor events');
  
  // Track cursor position and text changes
  editor.addEventListener('keyup', updatePositionAndStats);
  editor.addEventListener('click', updatePositionAndStats);
  editor.addEventListener('input', () => {
    documentChanged = editor.value !== originalContent;
    updatePositionAndStats();
    updatePreviewDebounced();
  });
  
  // Handle tab key in the editor
  editor.addEventListener('keydown', function(e) {
    if (e.key === 'Tab') {
      e.preventDefault();
      
      // Insert a tab at cursor position
      const start = this.selectionStart;
      const end = this.selectionEnd;
      
      this.value = this.value.substring(0, start) + 
                   "  " + 
                   this.value.substring(end);
      
      // Put cursor after the inserted tab
      this.selectionStart = this.selectionEnd = start + 2;
      
      documentChanged = editor.value !== originalContent;
      updatePositionAndStats();
    }
  });
  
  // Initial update
  updatePositionAndStats();
}

// Set up UI control event listeners
function setupControlEvents() {
  console.log('Setting up control events');
  
  // Mode toggle button (edit/preview)
  modeToggle.addEventListener('click', toggleEditMode);
  
  // Open file button
  if (openButton) {
    openButton.addEventListener('click', () => {
      console.log('Open button clicked');
      if (documentChanged) {
        const confirmOpen = confirm('You have unsaved changes. Open a different file anyway?');
        if (!confirmOpen) return;
      }
      
      if (window.electronAPI && window.electronAPI.selectFile) {
        window.electronAPI.selectFile({
          title: 'Open File',
          filters: [
            { name: 'Text Files', extensions: ['txt', 'md'] },
            { name: 'All Files', extensions: ['*'] }
          ]
        }).then(filePath => {
          if (filePath) {
            openFile(filePath);
          }
        }).catch(err => {
          console.error('Error selecting file:', err);
          showNotification('Error selecting file: ' + err.message);
        });
      } else {
        console.error('electronAPI not available or selectFile method not found');
      }
    });
  }
  
  // Remove Markdown button
  // removeMarkdownButton.addEventListener('click', () => {
  //   console.log('Remove Markdown button clicked');
    
  //   // Make sure we're in edit mode
  //   if (!htmlEl.classList.contains('edit-mode')) {
  //     htmlEl.classList.add('edit-mode');
  //     modeTooltip.textContent = 'Preview';
  //   }
    
  //   // Get the current content and remove markdown
  //   const plainText = removeMarkdown(editor.value);
    
  //   // Update the editor with plain text
  //   editor.value = plainText;
  //   documentChanged = editor.value !== originalContent;
    
  //   // Update preview content (even though it's not visible in edit mode)
  //   updatePreview();
    
  //   // Update position and stats
  //   updatePositionAndStats();
    
  //   // Show notification
  //   showNotification('Markdown removed');
  // });
  // Modified Remove Markdown button handler with confirmation dialog
  removeMarkdownButton.addEventListener('click', () => {
    console.log('Remove Markdown button clicked');
    
    // Show confirmation dialog
    const confirmRemove = confirm(
      'Warning: Removing Markdown formatting is permanent and cannot be undone.\n\n' +
      'This will convert all formatting (headings, bold, links, etc.) to plain text.\n\n' +
      'Do you want to proceed?'
    );
    
    // Only proceed if user confirms
    if (!confirmRemove) {
      console.log('User cancelled Remove Markdown operation');
      return;
    }
    
    // Make sure we're in edit mode
    if (!htmlEl.classList.contains('edit-mode')) {
      htmlEl.classList.add('edit-mode');
      modeTooltip.textContent = 'Preview';
    }
    
    // Get the current content and remove markdown
    const plainText = removeMarkdown(editor.value);
    
    // Update the editor with plain text
    editor.value = plainText;
    documentChanged = editor.value !== originalContent;
    
    // Update preview content (even though it's not visible in edit mode)
    updatePreview();
    
    // Update position and stats
    updatePositionAndStats();
    
    // Show notification
    showNotification('Markdown formatting removed');
  });
  
  // Save button
  saveButton.addEventListener('click', () => {
    console.log('Save button clicked');
    saveFile(false);
  });
  
  // Save As button
  saveAsButton.addEventListener('click', () => {
    console.log('Save As button clicked');
    saveFile(true);
  });
  
  // Close button - Make sure close button exists before adding listener
  if (closeButton) {
    console.log('Adding close button event listener');
    closeButton.addEventListener('click', () => {
      console.log("*** EDITOR: Close button clicked");
      // Check if there are unsaved changes
      if (documentChanged) {
        const confirmClose = confirm('You have unsaved changes. Close anyway?');
        if (!confirmClose) return;
      }
      
      // Close the window via IPC
      if (window.electronAPI && window.electronAPI.closeEditorDialog) {
        window.electronAPI.closeEditorDialog();
      } else {
        console.error('electronAPI not available or closeEditorDialog method not found');
      }
    });
  } else {
    console.error('Close button element not found!');
  }
  
  // Font size change
  fontSizeSelect.addEventListener('change', updateFontSize);
  
  // Word wrap toggle
  wordWrapToggle.addEventListener('click', toggleWordWrap);
}

// Toggle between edit and preview modes
function toggleEditMode() {
  console.log('Toggle edit mode');
  htmlEl.classList.toggle('edit-mode');
  const isEditMode = htmlEl.classList.contains('edit-mode');
  
  // Update tooltip text
  modeTooltip.textContent = isEditMode ? 'Preview' : 'Edit';
  
  // If switching to preview mode, update the preview content
  if (!isEditMode) {
    updatePreview();
  }
}

// Update preview content with rendered markdown
function updatePreview() {
  console.log('Updating preview');
  try {
    // Simple markdown to HTML conversion
    const html = simpleMarkdownToHtml(editor.value);
    preview.innerHTML = html;
  } catch (error) {
    console.error('Error updating preview:', error);
    preview.innerHTML = '<p style="color: red;">Error rendering markdown: ' + error.message + '</p>';
  }
}

// RemoveMarkdown function - Comprehensive markdown removal
function removeMarkdown(md, options) {
  console.log('Removing markdown from text');
  
  // Set default options if none provided
  options = options || {};
  options.listUnicodeChar = options.hasOwnProperty('listUnicodeChar') ? options.listUnicodeChar : false;
  options.stripListLeaders = options.hasOwnProperty('stripListLeaders') ? options.stripListLeaders : true;
  options.gfm = options.hasOwnProperty('gfm') ? options.gfm : true;
  options.useImgAltText = options.hasOwnProperty('useImgAltText') ? options.useImgAltText : true;
  options.preserveBlockSpacing = options.hasOwnProperty('preserveBlockSpacing') ? options.preserveBlockSpacing : true;
  
  var output = md || '';
  
  // Remove horizontal rules
  output = output.replace(/^(-\s*?|\*\s*?|_\s*?){3,}\s*$/gm, '');
  
  try {
    // Handle list markers
    if (options.stripListLeaders) {
      if (options.listUnicodeChar) {
        output = output.replace(/^([\s\t]*)([\*\-\+]|\d+\.)\s+/gm, options.listUnicodeChar + ' $1');
      } else {
        output = output.replace(/^([\s\t]*)([\*\-\+]|\d+\.)\s+/gm, '$1');
      }
    }
    
    // Handle GitHub Flavored Markdown features
    if (options.gfm) {
      output = output
        .replace(/\n={2,}/g, '\n')
        .replace(/~{3}.*\n/g, '')
        // Improved code block handling
        .replace(/(`{3,})([\s\S]*?)\1/gm, function(match, p1, p2) {
          return p2.trim() + '%%CODEBLOCK_END%%\n';
        })
        .replace(/~~/g, '');
    }
    
    // Process main markdown elements
    output = output
      // Remove HTML tags
      .replace(/<[^>]*>/g, '')
      // Remove setext headers
      .replace(/^[=\-]{2,}\s*$/g, '')
      // Remove footnotes
      .replace(/\[\^.+?\](\: .*?$)?/g, '')
      .replace(/\s{0,2}\[.*?\]: .*?$/g, '')
      // Handle images and links
      .replace(/\!\[(.*?)\][\[\(].*?[\]\)]/g, options.useImgAltText ? '$1' : '')
      .replace(/\[(.*?)\][\[\(].*?[\]\)]/g, '$1')
      // Better blockquote handling with spacing
      .replace(/^\s*>+\s?/gm, function(match) {
        return options.preserveBlockSpacing ? '\n' : '';
      })
      // Remove list markers again (thorough cleanup)
      .replace(/^([\s\t]*)([\*\-\+]|\d+\.)\s+/gm, '$1')
      // Remove reference links
      .replace(/^\s{1,2}\[(.*?)\]: (\S+)( ".*?")?\s*$/g, '')
      // Remove headers
      .replace(/^(\n)?\s{0,}#{1,6}\s+| {0,}(\n)?\s{0,}#{0,} {0,}(\n)?\s{0,}$/gm, '$1$2$3')
      // Remove emphasis
      .replace(/([\*_]{1,3})(\S.*?\S{0,1})\1/g, '$2')
      .replace(/([\*_]{1,3})(\S.*?\S{0,1})\1/g, '$2')
      // Remove code markers
      .replace(/`(.+?)`/g, '$1');
    
    // Final cleanup and spacing
    output = output
      // Replace code block markers with proper spacing
      .replace(/%%CODEBLOCK_END%%\n/g, '\n\n\n')
      // Normalize multiple newlines while preserving block spacing
      .replace(/\n{4,}/g, '\n\n\n')
      .replace(/\n{3}/g, '\n\n')
      // Clean up any trailing whitespace
      .trim();
      
  } catch(e) {
    console.error('Error processing markdown:', e);
    return md;
  }
  
  return output;
}

// A simple markdown to HTML converter
function simpleMarkdownToHtml(markdown) {
  if (!markdown) return '';
  
  let html = markdown
    // Handle headings
    .replace(/^# (.*?)$/gm, '<h1>$1</h1>')
    .replace(/^## (.*?)$/gm, '<h2>$1</h2>')
    .replace(/^### (.*?)$/gm, '<h3>$1</h3>')
    
    // Handle bold and italic
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    
    // Handle links
    .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>')
    
    // Handle code blocks
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    
    // Handle inline code
    .replace(/`(.*?)`/g, '<code>$1</code>')
    
    // Handle blockquotes
    .replace(/^> (.*?)$/gm, '<blockquote>$1</blockquote>')
    
    // Handle lists (basic)
    .replace(/^- (.*?)$/gm, '<li>$1</li>')
    
    // Handle paragraphs (basic)
    .replace(/^([^<].*?)$/gm, '<p>$1</p>');
  
  // Wrap lists
  html = html.replace(/<li>.*?<\/li>\n<li>.*?<\/li>/g, function(match) {
    return '<ul>' + match + '</ul>';
  });
  
  return html;
}

// A debounced version of updatePreview to avoid excessive rendering
let previewDebounceTimer;
function updatePreviewDebounced() {
  clearTimeout(previewDebounceTimer);
  previewDebounceTimer = setTimeout(updatePreview, 300);
}

// Open a file
async function openFile(filePath) {
  console.log('Opening file:', filePath);
  try {
    if (window.electronAPI && window.electronAPI.openFileInEditor) {
      const result = await window.electronAPI.openFileInEditor(filePath);
      if (!result.success) {
        console.error('Error in openFileInEditor:', result.error);
        showNotification('Error opening file: ' + (result.error || 'Unknown error'));
      }
    } else {
      console.error('electronAPI not available or openFileInEditor method not found');
    }
  } catch (error) {
    console.error('Error opening file:', error);
    showNotification('Error opening file: ' + error.message);
  }
}

// Save file (save or save as)
async function saveFile(saveAs = false) {
  console.log('Saving file, saveAs:', saveAs);
  if (!window.electronAPI || !window.electronAPI.saveFile) {
    console.error('saveFile API not available');
    showNotification('Error: API not available');
    return;
  }
  
  try {
    const content = editor.value;
    
    console.log('Calling saveFile IPC method');
    const result = await window.electronAPI.saveFile({
      filePath: currentFilePath,
      content,
      saveAs
    });
    
    if (result && result.success) {
      console.log('File saved successfully:', result.filePath);
      currentFilePath = result.filePath;
      filepath.textContent = currentFilePath;
      filepath.title = currentFilePath; // For tooltip on hover
      documentChanged = false;
      originalContent = content;
      showNotification('File saved successfully');
    } else {
      console.error('Failed to save file:', result);
      showNotification('Failed to save file');
    }
  } catch (error) {
    console.error('Error saving file:', error);
    showNotification('Error saving file: ' + error.message);
  }
}

// Show a notification popup
function showNotification(message, duration = 2000) {
  console.log('Showing notification:', message);
  notification.textContent = message;
  notification.classList.add('visible');
  
  setTimeout(() => {
    notification.classList.remove('visible');
  }, duration);
}

// Update font size
function updateFontSize() {
  const fontSize = fontSizeSelect.value + 'px';
  console.log('Setting font size:', fontSize);
  editor.style.fontSize = fontSize;
  preview.style.fontSize = fontSize;
}

// Toggle word wrap
function toggleWordWrap() {
  isWordWrapEnabled = !isWordWrapEnabled;
  console.log('Toggling word wrap, now:', isWordWrapEnabled ? 'ON' : 'OFF');
  updateWordWrap();
}

// Update word wrap setting
function updateWordWrap() {
  editor.style.whiteSpace = isWordWrapEnabled ? 'pre-wrap' : 'pre';
  wordWrapToggle.textContent = `Wrap: ${isWordWrapEnabled ? 'On' : 'Off'}`;
}

// Update cursor position and text statistics
function updatePositionAndStats() {
  const text = editor.value;
  
  // Get cursor position
  const cursorPos = editor.selectionStart;
  
  // Calculate line and column
  const lines = text.substr(0, cursorPos).split('\n');
  const lineNumber = lines.length;
  const columnNumber = lines[lines.length - 1].length + 1;
  
  // Update position display
  positionDisplay.textContent = `Line: ${lineNumber}, Column: ${columnNumber}`;
  
  // Update statistics display
  const wordCount = countWords(text);
  const charCount = text.length;
  statisticsDisplay.textContent = `Words: ${wordCount}, Characters: ${charCount}`;
}

// Count words in text
function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// Handle file opened message from main process
if (window.electronAPI && window.electronAPI.onFileOpened) {
  console.log('Registering onFileOpened handler');
  window.electronAPI.onFileOpened((data) => {
    console.log('File opened event received:', data.filePath);
    if (data && data.filePath && data.content !== undefined) {
      currentFilePath = data.filePath;
      editor.value = data.content;
      originalContent = data.content;
      documentChanged = false;
      
      // Update file path display
      filepath.textContent = currentFilePath;
      filepath.title = currentFilePath; // For tooltip on hover
      
      // Update stats
      updatePositionAndStats();
      
      // CHANGE: Always update preview since we start in preview mode
      updatePreview();
    } else {
      console.error('Invalid data received from onFileOpened:', data);
    }
  });
} else {
  console.error('electronAPI not available or onFileOpened method not found');
}

// Handle theme changes from main process
if (window.electronAPI && window.electronAPI.onSetTheme) {
  console.log('Registering onSetTheme handler');
  window.electronAPI.onSetTheme(theme => {
    console.log('Theme change event received:', theme);
    if (theme === 'light') {
      htmlEl.setAttribute('data-theme', 'light');
    } else {
      htmlEl.setAttribute('data-theme', 'dark');
    }
  });
} else {
  console.error('electronAPI not available or onSetTheme method not found');
}

// Log initialization
console.log('Editor dialog script loaded');
