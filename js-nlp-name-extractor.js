// Example using Natural.js for manuscript name extraction
const natural = require('natural');
const tokenizer = new natural.WordTokenizer();

// Alternative approach using Compromise
const nlp = require('compromise');

// Function to extract potential character/place names using Natural
function extractNamesWithNatural(text) {
    // Tokenize while preserving original text
    const tokens = tokenizer.tokenize(text);
    
    // Keep track of names we've found
    const names = new Set();
    
    // Simple approach: find capitalized words
    tokens.forEach(token => {
        // Check if first letter is uppercase
        if (token[0] === token[0].toUpperCase() && token[0] !== token[0].toLowerCase()) {
            names.add(token);
        }
    });
    
    return Array.from(names).sort();
}

// Function using Compromise for more intelligent extraction
function extractNamesWithCompromise(text) {
    const doc = nlp(text);
    
    // Extract all proper nouns (people, places, organizations)
    const properNouns = doc.match('#ProperNoun+').out('array');
    
    // Filter to only include those starting with uppercase
    const capitalizedNames = properNouns.filter(name => 
        name[0] === name[0].toUpperCase()
    );
    
    // Remove duplicates and sort
    return [...new Set(capitalizedNames)].sort();
}

// More advanced approach combining multiple strategies
function extractNamesAdvanced(text) {
    const names = new Set();
    
    // Strategy 1: Regex for capitalized words with special characters
    const capitalizedPattern = /\b[A-Z][a-zA-Z'-]*(?:\s+[A-Z][a-zA-Z'-]*)*\b/g;
    const matches = text.match(capitalizedPattern) || [];
    
    matches.forEach(match => {
        // Preserve compound names and special characters
        names.add(match);
    });
    
    // Strategy 2: Look for patterns like "the [Capitalized]" for place names
    const placePattern = /(?:the|The)\s+([A-Z][a-zA-Z'-]+)/g;
    let placeMatch;
    while ((placeMatch = placePattern.exec(text)) !== null) {
        names.add(placeMatch[1]);
    }
    
    return Array.from(names).sort();
}

// Example usage
const manuscriptText = `
Chapter 1: Gail Street

The first snofall of November clung to the Covenridge welcome sign as Ezra Patel slowed his decade-old Subaru. Fifteen years since he'd last seen those faded letters—the paint peeling at the edges, but the promise still intact: "Where the Mountains Keep Our Secrets." He'd forgotten that tagline, a tourism board's attempt at mystery that now struck him as unintentionally appropriate.

The road narrowed as he climbed higher, the forest pressing close on both sides. Covenridge nestled in a valley surrounded by the jagged peaks of the Alabaster Range, the town's isolation both its charm and its curse. The radio stuttered, mountain interference claiming the signal until only static remained. Ezra switched it off and continued in silence.

When the gatehouse came into view, Ezra felt a surprising tug of appreciation. The stone structure stood at what had once been the entrance to the Hargrove estate, before the land was parceled and sold decades ago. The circular building with its conical roof and arched windows looked like something from a fairytale, out of place in the practical mountain town. The realtor had sent photos, but they hadn't captured how the morning light caught on the frost-covered stone or how the surrounding pines created a natural privacy screen.

He parked beside the building and sat for a moment, his breath clouding inside the car. The gatehouse would serve as both his office and living quarters—the practical choice for a private investigator starting over with limited funds and even fewer prospects.

"Home sweet home," he muttered, stepping out into the cold.

The key turned with satisfying weight in the lock. Inside, the gatehouse was as small as expected but with higher ceilings than he'd anticipated. The main floor was circular, with a spiral staircase leading to a bedroom loft. Large windows let in ample light, illuminating the dust particles dancing in the air. The real estate agent had mentioned the previous owner had been gone for months—some professor who'd taken a sabbatical and never returned.

Ezra's footsteps echoed as he explored. The wooden floors creaked pleasantly underfoot. A kitchenette occupied one curved wall, and a stone fireplace dominated another. He could already envision his desk positioned by the largest window, the perfect spot to watch potential clients approach while maintaining a view of the town below.

He unloaded the car methodically—laptop, case files, clothes, household essentials. The furniture he'd ordered would arrive tomorrow, leaving him with a sleeping bag on the floor for tonight. The last box from the car was the heaviest—books and memorabilia he couldn't bear to leave behind, despite his otherwise minimalist approach to the move.

As he set the box down near the fireplace, the bottom gave way, spilling the contents across the floor. Amidst the books and scattered papers, a familiar brown leather case slid free. Ezra froze. He hadn't intentionally packed his father's record collection.

"Marissa," he whispered, realizing his sister must have slipped it in when helping him pack. She'd always been sentimental that way.

Kneeling, he unzipped the case with careful fingers. The familiar smell of aged paper and vinyl filled his nostrils. His father's records—meticulously cataloged, each in its protective sleeve, labeled in Sunil Patel's precise handwriting. Ezra pulled out the top album: Miles Davis, "Kind of Blue." The corners were worn from handling, the sleeve faded where sunlight had once caught it on his father's shelf.

Memory rushed back—his father's study with its old turntable, Sunil's fingers placing the needle with surgical precision, then the two of them sitting in comfortable silence as the music filled the room. Those evenings had been their wordless communication, their shared language when Ezra's teenage angst had made conversation impossible.

A knock at the door pulled him from the memory. He carefully returned the record to its case and answered.

The man on his doorstep was stooped with age, a woolen cap pulled low over ears reddened by the cold. Behind him, Covenridge sprawled across the valley floor, smoke from morning fires rising in lazy columns.

"You must be the detective," the man said without preamble.

"Private investigator," Ezra corrected automatically. "Ezra Patel."

"Harold Winters. Town knows you're here. News travels." The old man stomped his feet against the cold. "Got a case for you, if you're taking them."

Ezra hesitated. He hadn't even unpacked, hadn't officially opened for business. But his bank account couldn't afford principles.

"Come in, Mr. Winters. I'm still setting up, but I can hear you out."

The old man followed him inside, eyes darting around the empty space. "Needs some furniture," he observed.

"Arriving tomorrow." Ezra gestured to a windowsill, the only available seating. "Sorry about the accommodations."

Winters remained standing. "It's my cat, Detective. Marmalade. Orange tabby, eleven years old, missing since Tuesday. Wife's heartbroken."

Ezra nodded, fishing a notebook from his jacket pocket. "Any history of wandering off?"

"Never more than a day. He's got a collar with our number. Somebody might've taken him, maybe." Winters twisted his cap in his hands. "Town's changed. Not like when you were a kid."

The casual reference caught Ezra off guard. He studied the old man's face. "You know me?"

"Course I do. You're Sunil's boy. Used to deliver my mail. I was postmaster before I retired." A hint of a smile cracked Winters' weathered face. "You don't remember old Winters?"

Ezra did, vaguely—a stern figure at the post office counter, quick with regulations but occasionally slipping candy to the children while their parents weren't looking.

"I do now, sir. It's been a long time."

"Fifteen years," Winters confirmed. "Since that summer after graduation. Town wondered if you'd ever come back."

Ezra maintained a neutral expression, though something inside him tightened. He'd hoped for more anonymity, more distance between his present and past. "About your cat—I'll need details. Recent photos, habits, places he frequents."

They settled into the case discussion, Ezra taking notes while Winters provided information. It was simple work—the kind of case he'd expected in a town like Covenridge. Missing pets, suspicious spouses, insurance investigations. Nothing like his work in Chicago, with its complexity and consequences. That had been the point of returning—simpler problems, quieter life.

After Winters left with promises of photos to be emailed, Ezra surveyed the gatehouse again. The emptiness echoed around him, the bareness both challenging and promising. A blank slate, just as he'd wanted. The record case caught his eye again. Almost without thinking, he opened it and leafed through the albums until he found what he was looking for—an unmarked sleeve containing a record his father had made of Covenridge's ambient sounds. Birdsong, wind through pines, the creek rushing after spring melt.

He set it aside. He had no turntable to play it on, and perhaps that was for the best.

The remainder of the day passed in organizational tasks—setting up his laptop, arranging his minimal office supplies, walking the perimeter of the property to familiarize himself with his surroundings. The gatehouse sat on nearly an acre of land, backing onto forest that eventually gave way to steeper terrain. From the highest point of his property, Ezra could see most of Covenridge below—the neat grid of Main Street, the sprawl of neighborhoods, the glint of the river curving around the eastern edge of town.

By late afternoon, he needed supplies that couldn't wait for tomorrow's delivery. The drive into town took less than ten minutes, the gatehouse's isolation more perceived than actual. Covenridge's Main Street appeared frozen in time—the hardware store, grocery, diner, and post office occupying the same spots they had during his childhood, though several storefronts had changed hands.

The grocery store was crowded with after-work shoppers. Ezra felt eyes tracking him as he moved through the aisles. He caught fragments of whispered conversations: "Patel boy..." "...detective now..." "...wonder if he knows..."

He ignored them, focusing on his list. At the checkout, the cashier—a young woman he didn't recognize—studied his face.

"You're Ezra," she stated. "My mom was in your class. Shannon Blake?"

"Of course," Ezra replied, though the name triggered only the vaguest recollection. "How is she?"

"Still here. Most people are." The girl's tone suggested this was a failing. "Except you. You got out."

Ezra collected his change. "And now I'm back."

"Yeah." She handed him his receipt. "Everyone's wondering why."

He offered no explanation as he carried his groceries out. The sky had darkened, and a steady snow was falling. Ezra stowed his purchases in the car and paused, considering his next move. He needed local references—maps, town histories, business directories—if he was going to operate effectively as an investigator here. The practical choice would be the library, but it would be closed by now.

A warm glow from across the street caught his attention. Abbott's Books & Curiosities. The storefront looked unchanged since his childhood—the bay window displaying a carefully arranged collection of books, antiques, and what appeared to be vinyl records. A sign in the window proclaimed "Open Until 7:00 pm."

The bell above the door chimed as Ezra entered. The shop smelled of paper, leather bindings, and something herbal—sage, perhaps, or lavender. Narrow aisles stretched between towering bookshelves, with carefully arranged displays of non-book items interspersed throughout. A small gas fireplace crackled in one corner, surrounded by worn leather armchairs.

"Be with you in a moment!" called a voice from somewhere in the depths of the store.

Ezra wandered toward a section labeled "Local Interest," running his fingers along the spines of books about Covenridge's history, geography, and folklore. He selected a slim volume titled "Covenridge Business Directory and Map, Current Edition" and a more substantial book, "The Founding Families of Covenridge Valley."

"Finding everything alright?" The voice was closer now, and Ezra turned to find Mrs. Abbott emerging from behind a beaded curtain. She looked much as he remembered—silver hair swept into a loose bun, reading glasses hanging from a chain around her neck, clothes that somehow managed to be both practical and slightly bohemian.

Recognition dawned in her eyes. "Ezra Patel. Well, this is a surprise." Her tone was warm but careful, as if testing the waters.

"Mrs. Abbott. The shop looks exactly the same."

"Isadora, please. You're hardly a schoolboy anymore." She glanced at the books in his hands. "Doing some local research?"

"Setting up a private investigation practice. The gatehouse on Hargrove Road."

"Ah, Professor Milligan's old place. Charming building." She took the books from him and moved toward the counter. "A detective, then. Your father would be proud—he always said you noticed things others missed."

The casual mention of his father sent a pang through Ezra. "You kept in touch with him?"

"Of course. Sunil was a regular until the end. We shared an interest in music." She rang up his purchases. "Speaking of which, Dahlia will be pleased you're back. She asks about you occasionally."

Ezra tried to maintain a neutral expression. "Dahlia's still in Covenridge?"

"Owns the coffee shop three doors down. Brewedly Awakened." Mrs. Abbott's eyes twinkled. "Terrible pun, excellent coffee. She studied at that fancy culinary institute in Providence before coming home."

Before Ezra could formulate a response, the bell above the door chimed again. He turned to see a woman stamping snow from her boots—tall and lean, with dark hair cut in a sharp bob, wearing a wine-colored coat dusted with snowflakes.

"Isadora, do you have that book on Alpine flora you promised? The printer needs the—" She looked up and froze mid-sentence, dark eyes widening as they fixed on Ezra.

"Dahlia, perfect timing," Mrs. Abbott said. "Look who's returned to Covenridge."

Fifteen years melted away in an instant. Dahlia Reeves—his closest childhood friend, his high school girlfriend, the person who'd known him better than anyone. The last time he'd seen her had been that final argument the night before he left for college, when she'd accused him of abandoning everything worthwhile.

"Ezra." She said his name flatly, then turned to Mrs. Abbott. "I need that book by Friday."

"Of course, dear. It's set aside in the back." Mrs. Abbott glanced between them, clearly sensing the tension. "Ezra's opened a detective agency at the gatehouse."

"Private investigator," he corrected automatically.

"Has he?" Dahlia's gaze returned to him, assessing. "Covenridge doesn't have much crime."

"Missing persons, background checks, insurance investigations. It's not all crime." He found himself wanting to justify his choice to her, which irritated him.

"Well." Dahlia removed her gloves deliberately. "Welcome back, then."

Mrs. Abbott disappeared through the beaded curtain, leaving them in uncomfortable silence.

"Your coffee shop sounds successful," Ezra offered.

"It is." Dahlia studied him. "You look... urban."

"Chicago will do that."

"Why are you back, Ezra?"

The directness was so familiar, so Dahlia. "Professional opportunity. Small pond, big fish."

She raised an eyebrow, clearly not believing him. "No one comes to Covenridge for opportunity."

Before he could respond, Mrs. Abbott returned with a large book on Alpine flora. "Here you are, Dahlia. The illustrations are quite remarkable."

Dahlia accepted the book with a grateful smile that transformed her face, revealing the girl Ezra had once known. "Thank you, Isadora. It's perfect." She turned to Ezra with carefully reconstructed neutrality. "Stop by the shop sometime. First coffee's on the house—returning local discount."

With that, she was gone, the bell announcing her exit like punctuation.

Mrs. Abbott slid Ezra's purchases into a paper bag. "She's done well for herself. The shop's become something of a community hub."

Ezra nodded, still processing the encounter. "She seems... settled."

"Most who stay are." Mrs. Abbott handed him the bag. "That'll be twenty-eight fifty."

As Ezra paid, his gaze drifted to a display case near the register. Inside were several vinyl records, their covers faded with age but meticulously preserved. One caught his eye—black with a silver spiral design and the words "The Starlight Wanderers: Final Transmission" in elegant script.

Mrs. Abbott followed his gaze. "You have your father's eye for the interesting."

"I remember that band. They played here once, didn't they? Some local connection?"

"Their final concert was at Covenridge Music Hall, 1988." Mrs. Abbott's voice took on a wistful quality. "That album's quite valuable now."

"I didn't know you sold records."

"A recent addition. There's been a revival of interest." She closed the register drawer with a decisive click. "Actually, I have a curious little problem with that particular record. A quirk in the dead wax."

"Dead wax?"

"The space between teh last groove and teh label. Sometimes called the runout groove." She waved a dismissive hand. "Nothing worth your professional attention, I'm sure. Just an old woman's curiosity about silent grooves that supposedly contain a message."

The statement hung in the air between them, oddly specific yet deliberately casual. Ezra found himself intrigued despite his intention to focus on setting up his business.

"What kind of message?"

Mrs. Abbott smiled, the expression not quite reaching her eyes. "That's just it—no one knows. It's probably nothing but collector's mythology. Don't let me keep you, Ezra. You must have so much to do at the gatehouse."

The dismissal was gentle but firm. Ezra collected his bag and headed for the door, glancing back at the record display one last time. Mrs. Abbott had moved to straighten some books, but he noticed she was watching his reflection in the glass cabinet.

Outside, the sno was falling more heavily now, the streetlights creating halos in the white darkness. Ezra hurried to his car, Mrs. Abbott's words repeating in his mind. A curious little problem. Silent grooves. A message no one could hear.

As he drove back toward the gatehouse, he realized he was listening to the static on the radio with new attention, as if it might suddenly resolve into comprehensible sound. He switched it off, but the silence seemed equally laden with potential meaning.

The gatehouse waited ahead, its windows dak against the night. A blank slate, he reminded himself. A fresh start.

Yet as he parked and gathered his groceries, Ezra couldn't shake the feeling that Covenridge had been waiting for him all these years—patient as a record that continues spinning in silence, waiting for someone to hear what had been there all along.

`;

console.log("Natural.js results:");
console.log(extractNamesWithNatural(manuscriptText));

console.log("\nCompromise results:");
console.log(extractNamesWithCompromise(manuscriptText));

console.log("\nAdvanced extraction results:");
console.log(extractNamesAdvanced(manuscriptText));

// Note: Each approach has trade-offs between simplicity and accuracy
// Natural.js: Simple but might miss compound names
// Compromise: Better at understanding context but may normalize text
// Regex-based: Can preserve exact formatting but needs careful pattern design