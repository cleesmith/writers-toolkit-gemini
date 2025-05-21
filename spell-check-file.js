// writer-spellcheck.js - Shows only sentences with spelling issues
const SpellChecker = require('simple-spellchecker');
const fs = require('fs');

// Get filename from command line
const filename = process.argv[2];

if (!filename) {
  console.log('Usage: node writer-spellcheck.js your-file.txt');
  process.exit(1);
}

// Load the dictionary
SpellChecker.getDictionary('en-US', (err, dictionary) => {
  if (err) {
    console.log('Error loading dictionary:', err);
    return;
  }
  
  try {
    // Read the file
    const text = fs.readFileSync(filename, 'utf8');
    
    // Split into sentences (looking for period, exclamation, question mark followed by space or newline)
    // This approach handles most standard writing but may not be perfect for complex punctuation
    const sentences = text.split(/(?<=[.!?])\s+/);
    
    // Counter for misspelled words
    let misspelledCount = 0;
    
    // Process each sentence
    sentences.forEach(sentence => {
      // Skip empty sentences
      if (!sentence.trim()) return;
      
      // Extract words
      const words = sentence.match(/[a-zA-Z']+/g) || [];
      
      // Find misspelled words in this sentence
      const misspelledWords = [];
      
      for (const word of words) {
        // Skip short words
        if (word.length < 2) continue;
        
        // Check if the word is misspelled
        if (!dictionary.spellCheck(word)) {
          const suggestions = dictionary.getSuggestions(word, 3);
          misspelledWords.push({ word, suggestions });
        }
      }
      
      // If we found misspelled words in this sentence, display it
      if (misspelledWords.length > 0) {
        misspelledCount += misspelledWords.length;
        
        // Print the sentence
        console.log(`\n${sentence.trim()}`);
        
        // Print each misspelled word and its suggestions
        misspelledWords.forEach(({ word, suggestions }) => {
          console.log(`  "${word}" → ${suggestions.length ? suggestions.join(', ') : 'no suggestions'}`);
        });
        
        // Add a separator line
        console.log('----------------------------------------');
      }
    });
    
    // Print summary
    if (misspelledCount === 0) {
      console.log('No spelling errors found in the document.');
    } else {
      console.log(`\nFound ${misspelledCount} potential spelling issues.`);
    }
    
  } catch (error) {
    console.log(`Error reading file: ${error.message}`);
  }
});
