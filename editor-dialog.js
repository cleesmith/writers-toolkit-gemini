// editor-dialog.js with CodeMirror

// DOM Elements - Reference these after DOM is fully loaded
let editor; // This will now be a CodeMirror instance
let preview;
let filepath;
let modeToggle;
let modeTooltip;
let openButton;
let saveButton;
let saveAsButton;
let closeButton;
let notification;
let wordWrapToggle;
let removeMarkdownButton;
let fontSizeIncrease;
let fontSizeDecrease;
let fontSizeDisplay;
let positionDisplay;
let statisticsDisplay;
let htmlEl;

// Find functionality elements
let findButton;

// State variables
let currentFilePath = null;
let documentChanged = false;
let originalContent = '';
let isWordWrapEnabled = true;
let currentFontSize = 14; // Default font size in pixels

// Wait for DOM to be fully loaded before doing anything
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM fully loaded');
  
  // Initialize DOM references
  initDomReferences();
  
  // Initialize CodeMirror
  initCodeMirror();
  
  // Set up UI control event listeners
  setupControlEvents();
  
  updateWordWrap();
  updateFontSize(); // Initialize font size display and CodeMirror styling
  updatePreview();
  
  // set the mode tooltip to "Edit" since we start in preview mode
  if (modeTooltip) {
    modeTooltip.textContent = 'go Edit';
  }
  
  console.log('Editor initialization complete in preview mode');
});

// Initialize all DOM references
function initDomReferences() {
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
  wordWrapToggle = document.getElementById('word-wrap-toggle');
  fontSizeIncrease = document.getElementById('font-size-increase');
  fontSizeDecrease = document.getElementById('font-size-decrease');
  fontSizeDisplay = document.getElementById('font-size-display');
  positionDisplay = document.getElementById('position');
  statisticsDisplay = document.getElementById('statistics');
  htmlEl = document.documentElement;
  findButton = document.getElementById('find-button');
  
  console.log('DOM references initialized');
}

// Initialize CodeMirror editor
function initCodeMirror() {
  const editorElement = document.getElementById('editor');
  
  // Create CodeMirror instance with basic configuration
  editor = CodeMirror(editorElement, {
    value: '', // Start with empty content
    mode: 'text/plain', // Plain text mode
    lineNumbers: true, // Show line numbers
    lineWrapping: true, // Enable line wrapping by default
    theme: 'default', // We'll handle theming with CSS
    indentUnit: 2, // Tab size
    tabSize: 2,
    indentWithTabs: false, // Use spaces instead of tabs
    showCursorWhenSelecting: true,
    styleActiveLine: true, // Highlight current line
    matchBrackets: true, // Highlight matching brackets
    autoRefresh: true, // Auto refresh when shown
    viewportMargin: Infinity, // Render entire document for better search
    // These options help with copy/paste and text interaction
    dragDrop: true, // Enable drag and drop
    allowDropFileTypes: ['text/plain', 'text/markdown'], // Allow text file drops
    scrollbarStyle: 'native' // Use native scrollbars for better interaction
  });
  
  // Set up CodeMirror event listeners
  setupCodeMirrorEvents();
  
  console.log('CodeMirror initialized');
}

// Force CodeMirror to be properly ready for text input
function ensureCodeMirrorReady() {
  // This function ensures CodeMirror's text input system is fully functional
  // We need to be especially careful with empty documents, which require
  // more stable initialization conditions than documents with existing content
  
  const isEditMode = htmlEl.classList.contains('edit-mode');
  
  if (isEditMode) {
    // We're in edit mode, so the container should be visible
    // Give CodeMirror multiple opportunities to establish proper input handling
    
    // First refresh - lets CodeMirror measure its container
    editor.refresh();
    
    // For empty documents, CodeMirror needs extra stabilization time
    // to establish its coordinate system without text-based reference points
    setTimeout(() => {
      // Second refresh - ensures layout calculations are complete
      editor.refresh();
      
      // Focus with a slight delay to ensure input capture is ready
      setTimeout(() => {
        editor.focus();
        
        // Final verification - ensure the cursor is visible and input is active
        // This is especially important for empty documents
        if (editor.getValue().length === 0) {
          // For empty documents, explicitly position cursor at start
          editor.setCursor({line: 0, ch: 0});
        }
      }, 30);
    }, 50);
  } else {
    // Not in edit mode, just do a basic refresh
    editor.refresh();
  }
}

// Set up CodeMirror-specific event listeners
function setupCodeMirrorEvents() {
  // Track cursor position and text changes
  editor.on('cursorActivity', updatePositionAndStats);
  
  // Track content changes
  editor.on('change', () => {
    documentChanged = editor.getValue() !== originalContent;
    updatePositionAndStats();
    updatePreviewDebounced();
  });
  
  // Handle tab key properly (CodeMirror handles this by default, but we can customize if needed)
  editor.setOption('extraKeys', {
    'Tab': function(cm) {
      // Insert 2 spaces instead of tab
      cm.replaceSelection('  ');
    }
    // Removed custom search - will use CodeMirror's default for now
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
      
      if (documentChanged) {
        const confirmOpen = confirm('You have unsaved changes. Open a different file anyway?');
        if (!confirmOpen) return;
      }
      
      if (window.electronAPI && window.electronAPI.selectFile) {
        window.electronAPI.selectFile({
          title: 'Open File',
          filters: [
            { name: 'Text Files', extensions: ['txt', 'md'] }
          ]
        })
        .then(filePath => {
          if (filePath) {
            openFile(filePath);
          }
        })
        .catch(err => {
          console.error('Error selecting file:', err);
          showNotification('Error selecting file: ' + err.message);
        });
      } else {
        console.error('*** electronAPI not available or selectFile method not found');
        console.log('electronAPI available?', !!window.electronAPI);
        console.log('selectFile available?', !!(window.electronAPI && window.electronAPI.selectFile));
        showNotification('Error: File selection API not available');
      }
    });
  }
  
  // Modified Remove Markdown button handler with confirmation dialog
  removeMarkdownButton.addEventListener('click', () => {
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
      modeTooltip.textContent = 'go Preview';
    }
    
    // Get the current content and remove markdown
    const plainText = removeMarkdown(editor.getValue());
    
    // Update the editor with plain text
    editor.setValue(plainText);
    documentChanged = editor.getValue() !== originalContent;
    
    // Update preview content (even though it's not visible in edit mode)
    updatePreview();
    
    // Update position and stats
    updatePositionAndStats();
    
    // Show notification
    showNotification('Markdown formatting removed');
  });
  
  // Save button
  saveButton.addEventListener('click', () => {
    saveFile(false);
  });
  
  // Save As button
  saveAsButton.addEventListener('click', () => {
    saveFile(true);
  });
  
  // Close button - Make sure close button exists before adding listener
  if (closeButton) {
    closeButton.addEventListener('click', () => {
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
  
  // Word wrap toggle
  wordWrapToggle.addEventListener('click', toggleWordWrap);
  
  // Font size controls
  if (fontSizeIncrease) {
    fontSizeIncrease.addEventListener('click', increaseFontSize);
  }
  if (fontSizeDecrease) {
    fontSizeDecrease.addEventListener('click', decreaseFontSize);
  }
  
  // Find button - Use CodeMirror's built-in find functionality  
  if (findButton) {
    findButton.addEventListener('click', () => {
      editor.execCommand('find');
    });
  }
}

// Toggle between edit and preview modes
function toggleEditMode() {
  htmlEl.classList.toggle('edit-mode');
  const isEditMode = htmlEl.classList.contains('edit-mode');
  
  // Update tooltip text
  modeTooltip.textContent = isEditMode ? 'go Preview' : 'go Edit';
  
  // If switching to preview mode, update the preview content
  if (!isEditMode) {
    updatePreview();
    // Apply current font size to preview mode
    updateFontSize();
  } else {
    // When switching to edit mode, ensure CodeMirror is fully ready for text input
    setTimeout(() => {
      ensureCodeMirrorReady(); // This replaces the simple refresh/focus sequence
      updateFontSize(); // Apply font size after CodeMirror is ready
    }, 50);
  }
}

// Update preview content with rendered markdown
function updatePreview() {
  try {
    // Simple markdown to HTML conversion
    const html = simpleMarkdownToHtml(editor.getValue());
    preview.innerHTML = html;
  } catch (error) {
    console.error('Error updating preview:', error);
    preview.innerHTML = '<p style="color: red;">Error rendering markdown: ' + error.message + '</p>';
  }
}

// RemoveMarkdown function - Comprehensive markdown removal
function removeMarkdown(md, options) {
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
  if (!window.electronAPI || !window.electronAPI.saveFile) {
    console.error('saveFile API not available');
    showNotification('Error: API not available');
    return;
  }
  
  try {
    const content = editor.getValue(); // Use CodeMirror's getValue() method
    const result = await window.electronAPI.saveFile({
      filePath: currentFilePath,
      content,
      saveAs
    });
    
    if (result && result.success) {
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
  notification.textContent = message;
  notification.classList.add('visible');
  
  setTimeout(() => {
    notification.classList.remove('visible');
  }, duration);
}

// Toggle word wrap
function toggleWordWrap() {
  isWordWrapEnabled = !isWordWrapEnabled;
  updateWordWrap();
}

// Update word wrap setting
function updateWordWrap() {
  // Use CodeMirror's lineWrapping option
  editor.setOption('lineWrapping', isWordWrapEnabled);
  wordWrapToggle.textContent = `Wrap: ${isWordWrapEnabled ? 'On' : 'Off'}`;
}

// Increase font size
function increaseFontSize() {
  // Define size steps and maximum limit for readability
  const maxSize = 24;
  if (currentFontSize < maxSize) {
    currentFontSize += 2; // Increase by 2px increments for smooth progression
    updateFontSize();
  }
}

// Decrease font size  
function decreaseFontSize() {
  // Define minimum size for readability
  const minSize = 10;
  if (currentFontSize > minSize) {
    currentFontSize -= 2; // Decrease by 2px increments for smooth progression
    updateFontSize();
  }
}

// Apply font size changes to the appropriate element based on current mode
function updateFontSize() {
  const isEditMode = htmlEl.classList.contains('edit-mode');
  
  if (isEditMode) {
    // In edit mode: apply font size to CodeMirror editor
    const codeMirrorElement = editor.getWrapperElement();
    codeMirrorElement.style.fontSize = currentFontSize + 'px';
    
    // Tell CodeMirror to refresh its layout and measurements
    // This is crucial because font size changes affect line heights, 
    // character widths, and overall text layout calculations
    setTimeout(() => {
      editor.refresh();
    }, 10);
  } else {
    // In preview mode: apply font size to preview content
    preview.style.fontSize = currentFontSize + 'px';
  }
  
  // Update the display showing current font size
  if (fontSizeDisplay) {
    fontSizeDisplay.textContent = currentFontSize + 'px';
  }
}

// Update cursor position and text statistics
function updatePositionAndStats() {
  const cursor = editor.getCursor(); // Get cursor position from CodeMirror
  const text = editor.getValue(); // Get all text from CodeMirror
  
  // CodeMirror uses 0-based line numbers, so add 1 for display
  const lineNumber = cursor.line + 1;
  const columnNumber = cursor.ch + 1;
  
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
  window.electronAPI.onFileOpened((data) => {
    if (data && data.filePath && data.content !== undefined) {
      currentFilePath = data.filePath;
      editor.setValue(data.content); // Use CodeMirror's setValue() method
      originalContent = data.content;
      documentChanged = false;
      
      // Update file path display
      filepath.textContent = currentFilePath;
      filepath.title = currentFilePath; // For tooltip on hover
      
      // Update stats
      updatePositionAndStats();
      
      // Update preview
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
  window.electronAPI.onSetTheme(theme => {
    if (theme === 'light') {
      htmlEl.setAttribute('data-theme', 'light');
    } else {
      htmlEl.setAttribute('data-theme', 'dark');
    }
    // CodeMirror theming is handled by CSS
  });
} else {
  console.error('electronAPI not available or onSetTheme method not found');
}

console.log('Editor dialog script loaded');