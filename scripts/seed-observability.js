import 'dotenv/config';
import crypto from 'crypto';
import { db } from '../db/client.js';
import { sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomSubset(arr, minCount = 1, maxCount = arr.length) {
  const count = randomInt(minCount, Math.min(maxCount, arr.length));
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function weightedScore() {
  // Weighted toward 7-8: 60% chance of 7-8, 20% chance 5-6, 20% chance 9
  const r = Math.random();
  if (r < 0.1) return 5;
  if (r < 0.2) return 6;
  if (r < 0.5) return 7;
  if (r < 0.8) return 8;
  return 9;
}

function generateCallSid() {
  return 'CA' + crypto.randomBytes(16).toString('hex');
}

// ---------------------------------------------------------------------------
// Senior profiles
// ---------------------------------------------------------------------------

const SENIOR_PROFILES = [
  {
    name: 'Margaret Chen',
    phone: '+12025550101',
    timezone: 'America/New_York',
    interests: ['gardening', 'classical music', 'baking', 'crossword puzzles'],
    familyInfo: { daughter: 'Susan Chen', son: 'David Chen', grandchildren: 3 },
    medicalNotes: 'Mild arthritis in hands. Takes lisinopril for blood pressure.',
    city: 'New York',
    state: 'NY',
  },
  {
    name: 'Robert Williams',
    phone: '+12025550102',
    timezone: 'America/Chicago',
    interests: ['baseball', 'woodworking', 'fishing', 'history'],
    familyInfo: { wife: 'deceased 2023', son: 'Mark Williams', grandchildren: 2 },
    medicalNotes: 'Type 2 diabetes managed with metformin. Hearing aid in left ear.',
    city: 'Chicago',
    state: 'IL',
  },
  {
    name: 'Helen O\'Brien',
    phone: '+12025550103',
    timezone: 'America/New_York',
    interests: ['knitting', 'theater', 'cats', 'walking'],
    familyInfo: { daughter: 'Patricia Murphy', niece: 'Karen O\'Brien' },
    medicalNotes: 'Osteoporosis. Takes calcium and vitamin D supplements.',
    city: 'Boston',
    state: 'MA',
  },
  {
    name: 'James Patterson',
    phone: '+12025550104',
    timezone: 'America/Los_Angeles',
    interests: ['jazz', 'chess', 'photography', 'birds'],
    familyInfo: { wife: 'Eleanor Patterson', daughter: 'Claire Patterson', grandchildren: 4 },
    medicalNotes: 'Pacemaker installed 2022. Takes warfarin. Annual cardiology checkups.',
    city: 'Seattle',
    state: 'WA',
  },
  {
    name: 'Dorothy Martinez',
    phone: '+12025550105',
    timezone: 'America/Chicago',
    interests: ['cooking', 'dancing', 'church', 'sewing'],
    familyInfo: { son: 'Carlos Martinez', daughter: 'Maria Gonzalez', grandchildren: 5 },
    medicalNotes: 'High cholesterol managed with statins. Occasional knee pain.',
    city: 'San Antonio',
    state: 'TX',
  },
  {
    name: 'Walter Thompson',
    phone: '+12025550106',
    timezone: 'America/Denver',
    interests: ['birdwatching', 'fishing', 'golf', 'reading'],
    familyInfo: { wife: 'Betty Thompson', son: 'Tom Thompson' },
    medicalNotes: 'Cataracts surgery 2024. Mild COPD, uses inhaler as needed.',
    city: 'Denver',
    state: 'CO',
  },
  {
    name: 'Evelyn Kim',
    phone: '+12025550107',
    timezone: 'America/Los_Angeles',
    interests: ['painting', 'tai chi', 'poetry', 'gardening'],
    familyInfo: { daughter: 'Jennifer Kim', son: 'Michael Kim', grandchildren: 2 },
    medicalNotes: 'Glaucoma, uses eye drops daily. Light exercise recommended.',
    city: 'Los Angeles',
    state: 'CA',
  },
  {
    name: 'George Anderson',
    phone: '+12025550108',
    timezone: 'America/New_York',
    interests: ['golf', 'reading', 'blues music', 'woodworking'],
    familyInfo: { wife: 'Ruth Anderson', daughter: 'Linda Anderson', grandchildren: 3 },
    medicalNotes: 'Hip replacement 2023. Physical therapy twice weekly. Takes ibuprofen PRN.',
    city: 'Atlanta',
    state: 'GA',
  },
];

// ---------------------------------------------------------------------------
// Conversation templates
// ---------------------------------------------------------------------------

const CONVERSATION_TEMPLATES = [
  {
    theme: 'gardening',
    applicableInterests: ['gardening'],
    generateTranscript: (name) => [
      { role: 'assistant', content: `Good morning, ${name}! How are you doing today?` },
      { role: 'user', content: "Oh hello dear! I'm doing pretty well. Been out in the garden this morning." },
      { role: 'assistant', content: "That sounds lovely! What have you been working on out there?" },
      { role: 'user', content: "Well, my tomatoes are really coming along nicely. And I planted some new marigolds by the fence." },
      { role: 'assistant', content: "Marigolds are such cheerful flowers! They're great for keeping pests away from the tomatoes too." },
      { role: 'user', content: "That's exactly why I planted them there! My neighbor told me about that trick years ago." },
      { role: 'assistant', content: "What a smart neighbor! Have you been able to harvest anything from the garden yet this season?" },
      { role: 'user', content: "Some lettuce and herbs so far. The tomatoes need another week or two I think." },
      { role: 'assistant', content: "Fresh lettuce from the garden is the best. Nothing in the store compares to homegrown." },
      { role: 'user', content: "You're absolutely right about that. I made a nice salad with it last night." },
      { role: 'assistant', content: "That sounds delicious! Are you planning to do any more planting this week?" },
      { role: 'user', content: "I might put in some zucchini if my back cooperates. We'll see how I feel tomorrow." },
      { role: 'assistant', content: "Take it easy and listen to your body. The garden will still be there when you're ready." },
      { role: 'user', content: "That's good advice, dear. Thank you for checking in on me." },
      { role: 'assistant', content: `It's always wonderful talking with you, ${name}! Enjoy those tomatoes when they're ready. Take care!` },
      { role: 'user', content: "Thank you, bye bye now!" },
    ],
    summary: (name) => `${name} shared updates about the garden. Tomatoes growing well, planted new marigolds by the fence. Harvested lettuce and herbs. Considering planting zucchini but mentioned back discomfort.`,
    topics: ['gardening', 'flowers', 'cooking'],
  },
  {
    theme: 'family_updates',
    applicableInterests: [],
    generateTranscript: (name) => [
      { role: 'assistant', content: `Hello ${name}! It's great to hear from you. How has your week been?` },
      { role: 'user', content: "Oh it's been a good week! My grandchildren came to visit on Saturday." },
      { role: 'assistant', content: "How wonderful! I bet that made your whole week. What did you all do together?" },
      { role: 'user', content: "The little ones helped me bake cookies. They made quite a mess but we had so much fun." },
      { role: 'assistant', content: "There's nothing better than baking with grandchildren! What kind of cookies did you make?" },
      { role: 'user', content: "Chocolate chip, their favorite. My grandmother's recipe actually. Been making them for sixty years." },
      { role: 'assistant', content: "A sixty-year-old family recipe! That's really special. Do the grandkids know it's a family tradition?" },
      { role: 'user', content: "Oh yes, I told them all about their great-great-grandmother. They love hearing the stories." },
      { role: 'assistant', content: "Passing down family stories is so important. How long were they able to stay?" },
      { role: 'user', content: "Just the afternoon. Their parents picked them up before dinner. The house felt so quiet after they left." },
      { role: 'assistant', content: "I can imagine. It sounds like you made some wonderful memories together though." },
      { role: 'user', content: "We did. They're coming back in two weeks, so I have that to look forward to." },
      { role: 'assistant', content: `That's lovely, ${name}. Having something to look forward to makes the days brighter. Take care of yourself until then!` },
      { role: 'user', content: "Thank you dear, you always brighten my day too. Goodbye!" },
    ],
    summary: (name) => `${name} had a wonderful visit from grandchildren on Saturday. They baked chocolate chip cookies together using a 60-year family recipe. ${name} shared family stories with the grandchildren. Next visit planned in two weeks.`,
    topics: ['family', 'baking', 'grandchildren'],
  },
  {
    theme: 'health_medications',
    applicableInterests: [],
    generateTranscript: (name) => [
      { role: 'assistant', content: `Hi ${name}! How are you feeling today?` },
      { role: 'user', content: "I'm doing alright. Had my doctor's appointment yesterday." },
      { role: 'assistant', content: "Oh, how did that go? I hope everything checked out well." },
      { role: 'user', content: "Pretty good overall. Blood pressure is looking better since they adjusted my medication last month." },
      { role: 'assistant', content: "That's great news! It sounds like the adjustment is working well for you." },
      { role: 'user', content: "Yes, and my doctor was pleased with my walking. I've been doing twenty minutes every morning." },
      { role: 'assistant', content: "Twenty minutes every morning is fantastic! That's a really healthy habit. How has the walking been feeling?" },
      { role: 'user', content: "Good mostly. My knees bother me a little on the hills but the flat paths are fine." },
      { role: 'assistant', content: "It's smart to stick to the flat paths when your knees are acting up. Did you mention that to your doctor?" },
      { role: 'user', content: "I did. She said to keep doing what I'm doing and just avoid the steep hills for now." },
      { role: 'assistant', content: "That sounds like sensible advice. Have you been keeping up with your other medications too?" },
      { role: 'user', content: "Yes, I take everything right after breakfast. Got my little pill organizer all set up for the week." },
      { role: 'assistant', content: "A pill organizer is such a good system. You're really on top of things!" },
      { role: 'user', content: "Well, at my age you have to be! Thank you for asking about all this." },
      { role: 'assistant', content: `Of course, ${name}! I'm glad the doctor's visit went well. Keep up that morning walk! Talk to you soon.` },
      { role: 'user', content: "Will do! Bye now." },
    ],
    summary: (name) => `${name} reported a positive doctor's visit. Blood pressure improving with adjusted medication. Walking 20 minutes each morning. Mild knee discomfort on hills — doctor advised sticking to flat paths. Good medication compliance with pill organizer system.`,
    topics: ['health', 'exercise', 'medications', 'doctor visit'],
  },
  {
    theme: 'cooking_recipes',
    applicableInterests: ['cooking', 'baking'],
    generateTranscript: (name) => [
      { role: 'assistant', content: `Good afternoon, ${name}! What have you been up to today?` },
      { role: 'user', content: "I just finished making a big pot of soup. The house smells wonderful!" },
      { role: 'assistant', content: "Oh that sounds amazing! What kind of soup did you make?" },
      { role: 'user', content: "Chicken noodle from scratch. Made the broth yesterday and let it simmer overnight." },
      { role: 'assistant', content: "Homemade broth overnight? That must taste incredible. Do you have a special recipe?" },
      { role: 'user', content: "It's my mother's recipe. She always said the secret is a little bit of lemon at the end." },
      { role: 'assistant', content: "Lemon in chicken soup! That's a wonderful tip. I love learning family cooking secrets." },
      { role: 'user', content: "Well when you've been cooking as long as I have, you pick up a few things along the way." },
      { role: 'assistant', content: "I bet you have so many great recipes. Do you cook for yourself every day?" },
      { role: 'user', content: "Most days yes. I find it relaxing. And I made enough soup to freeze some for next week." },
      { role: 'assistant', content: "That's very practical! Having homemade meals in the freezer is so nice when you don't feel like cooking." },
      { role: 'user', content: "Exactly. My daughter says I should write all my recipes down but I keep them all up here." },
      { role: 'assistant', content: "Tapping your head! That's impressive. Maybe one day you could share a few favorites with your daughter." },
      { role: 'user', content: "Maybe I will. Alright dear, my soup is calling me. Time for lunch!" },
      { role: 'assistant', content: `Enjoy that delicious soup, ${name}! Save some for me! Talk to you soon.` },
      { role: 'user', content: "Ha! Will do. Goodbye!" },
    ],
    summary: (name) => `${name} made homemade chicken noodle soup from scratch using mother's recipe. Secret ingredient is a bit of lemon at the end. Cooks most days and finds it relaxing. Made extra to freeze for next week. Daughter suggested writing down recipes.`,
    topics: ['cooking', 'recipes', 'family traditions'],
  },
  {
    theme: 'weather_seasons',
    applicableInterests: [],
    generateTranscript: (name) => [
      { role: 'assistant', content: `Hello ${name}! How's the weather treating you today?` },
      { role: 'user', content: "It's beautiful out! Finally warming up after that cold spell we had." },
      { role: 'assistant', content: "Oh wonderful! Spring weather can be so unpredictable. Are you getting outside to enjoy it?" },
      { role: 'user', content: "I sat on my porch this morning with my coffee. The birds were out singing, it was lovely." },
      { role: 'assistant', content: "That sounds like a perfect morning! Have you noticed any new birds coming around?" },
      { role: 'user', content: "I saw a cardinal pair building a nest in the oak tree. First time I've seen them there." },
      { role: 'assistant', content: "Cardinals are such beautiful birds! It must be nice having them choose your tree." },
      { role: 'user', content: "I put out some sunflower seeds to encourage them to stay. My husband used to love watching the birds." },
      { role: 'assistant', content: "That's a sweet way to honor his memory. I bet the cardinals will appreciate the seeds." },
      { role: 'user', content: "I think so. He always said spring was the best time of year. I'm starting to agree with him." },
      { role: 'assistant', content: "There's something about spring that just lifts your spirits, isn't there?" },
      { role: 'user', content: "There really is. Well, I should go refill my bird feeder while it's nice out." },
      { role: 'assistant', content: `Great idea, ${name}! Enjoy the sunshine and those cardinals. We'll talk again soon!` },
      { role: 'user', content: "Thank you, sweetheart. Take care!" },
    ],
    summary: (name) => `${name} enjoyed the warm spring weather from the porch with morning coffee. Spotted a cardinal pair building a nest in the oak tree. Put out sunflower seeds. Mentioned late husband's love of birdwatching and spring. Positive mood.`,
    topics: ['weather', 'birds', 'outdoors', 'memories'],
  },
  {
    theme: 'hobbies',
    applicableInterests: ['knitting', 'woodworking', 'painting', 'photography', 'sewing', 'crossword puzzles'],
    generateTranscript: (name) => [
      { role: 'assistant', content: `Hi there, ${name}! What have you been keeping busy with lately?` },
      { role: 'user', content: "I've been working on a project all week. Finally finished it this morning!" },
      { role: 'assistant', content: "Oh congratulations! That must feel so satisfying. What were you working on?" },
      { role: 'user', content: "A blanket for my neighbor's new baby. It took me three weeks but it turned out beautifully." },
      { role: 'assistant', content: "Three weeks of work! That's so thoughtful. I'm sure they'll treasure it." },
      { role: 'user', content: "I used the softest yarn I could find. A beautiful pale yellow since they didn't know the gender yet." },
      { role: 'assistant', content: "Pale yellow is such a classic choice. Did you use a special pattern?" },
      { role: 'user', content: "A cable knit pattern my mother taught me. It's a bit tricky with the arthritis but I managed." },
      { role: 'assistant', content: "That takes real dedication! How are your hands feeling after all that work?" },
      { role: 'user', content: "A little stiff today but nothing too bad. I take breaks when I need to." },
      { role: 'assistant', content: "That's the right approach. Taking breaks is important. Do you have your next project planned already?" },
      { role: 'user', content: "I'm thinking about making scarves for the church bazaar in the fall. Gives me something to work toward." },
      { role: 'assistant', content: "That's a wonderful goal! The church bazaar must love your handmade items." },
      { role: 'user', content: "They sell quickly every year! Alright, I'd better go soak my hands. Thank you for the nice chat." },
      { role: 'assistant', content: `You take care of those talented hands, ${name}! That baby blanket sounds absolutely beautiful. Talk soon!` },
      { role: 'user', content: "Bye bye, dear!" },
    ],
    summary: (name) => `${name} completed a cable knit baby blanket for neighbor's new baby — pale yellow, took three weeks. Hands a little stiff from arthritis but manageable with breaks. Planning scarves for church bazaar in fall.`,
    topics: ['hobbies', 'crafts', 'community'],
  },
  {
    theme: 'daily_routine',
    applicableInterests: [],
    generateTranscript: (name) => [
      { role: 'assistant', content: `Good morning, ${name}! How did you sleep last night?` },
      { role: 'user', content: "Pretty well actually! Got a solid seven hours which is good for me." },
      { role: 'assistant', content: "Seven hours is excellent! Did you have your morning routine yet?" },
      { role: 'user', content: "Oh yes, I've been up since six. Had my oatmeal, took my pills, and did my stretches." },
      { role: 'assistant', content: "You're so disciplined! Stretching in the morning really does make a difference, doesn't it?" },
      { role: 'user', content: "It does. My physical therapist gave me these exercises and they help with the stiffness." },
      { role: 'assistant', content: "That's great that you're keeping up with them. What else do you have planned for today?" },
      { role: 'user', content: "The grocery store this morning. Then I need to call the insurance company about a bill." },
      { role: 'assistant', content: "Insurance calls can be a bit tedious. Do you need any help navigating that?" },
      { role: 'user', content: "No, I've dealt with them before. You just have to be patient and persistent." },
      { role: 'assistant', content: "That's a great attitude! Is anyone going to the grocery store with you?" },
      { role: 'user', content: "My neighbor Martha is picking me up at ten. She goes the same day every week." },
      { role: 'assistant', content: "How nice to have a reliable neighbor! It sounds like you have a full day ahead." },
      { role: 'user', content: "I like staying busy. Keeps the mind sharp, you know?" },
      { role: 'assistant', content: `Absolutely, ${name}! Well, enjoy your shopping trip with Martha and good luck with that insurance call. Talk to you tomorrow!` },
      { role: 'user', content: "Thank you honey. Have a good day!" },
    ],
    summary: (name) => `${name} slept well — seven hours. Good morning routine: oatmeal, medications, stretching exercises from physical therapist. Plans: grocery shopping with neighbor Martha at 10 AM, then insurance call about a bill. Active and mentally engaged.`,
    topics: ['daily routine', 'health', 'exercise', 'errands'],
  },
  {
    theme: 'general_checkin',
    applicableInterests: [],
    generateTranscript: (name) => [
      { role: 'assistant', content: `Hi ${name}! Just calling to see how you're doing today.` },
      { role: 'user', content: "Well hello! It's nice to hear from you. I'm doing okay." },
      { role: 'assistant', content: "Just okay? Is everything alright?" },
      { role: 'user', content: "Oh nothing's wrong. Just one of those quiet days, you know? Haven't talked to anyone yet today." },
      { role: 'assistant', content: "I'm glad I called then! Sometimes quiet days are nice, but it's always good to have a chat." },
      { role: 'user', content: "It really is. I was just watching the news. Same old same old." },
      { role: 'assistant', content: "The news can be a lot sometimes! Have you done anything enjoyable today?" },
      { role: 'user', content: "I did my crossword puzzle with my coffee this morning. Almost finished it too." },
      { role: 'assistant', content: "Almost? What had you stumped?" },
      { role: 'user', content: "A six-letter word for a type of ancient Greek column. I'll figure it out eventually!" },
      { role: 'assistant', content: "Could it be 'Doric'? No wait, that's five letters. Hmm, maybe 'Ionic' — no, also five." },
      { role: 'user', content: "Ha! See, it's tricky! I think it might be 'fluted' but I'm not sure that's right either." },
      { role: 'assistant', content: "Crossword puzzles are such great brain exercise. You'll get it!" },
      { role: 'user', content: "I always do eventually. Well, this was a nice pick-me-up. Thank you for calling." },
      { role: 'assistant', content: `Anytime, ${name}! I hope the rest of your day is wonderful. And let me know if you crack that crossword!` },
      { role: 'user', content: "I will! Goodbye now." },
    ],
    summary: (name) => `${name} was having a quiet day without much social contact. Seemed appreciative of the call. Did a crossword puzzle this morning — got stuck on one clue. Generally in good spirits but may benefit from more social interaction.`,
    topics: ['check-in', 'puzzles', 'social wellbeing'],
  },
  {
    theme: 'music_entertainment',
    applicableInterests: ['classical music', 'jazz', 'blues music', 'theater'],
    generateTranscript: (name) => [
      { role: 'assistant', content: `Hello ${name}! How's your day going so far?` },
      { role: 'user', content: "Wonderful! I've been listening to music all morning." },
      { role: 'assistant', content: "That sounds like a perfect morning! What have you been listening to?" },
      { role: 'user', content: "Some old jazz records. Miles Davis, Kind of Blue. You can't beat the classics." },
      { role: 'assistant', content: "Kind of Blue is such an incredible album. Do you have the vinyl or are you streaming it?" },
      { role: 'user', content: "The actual vinyl! My son got me a new turntable for Christmas. Sounds amazing." },
      { role: 'assistant', content: "There's something special about vinyl, isn't there? The warmth of the sound." },
      { role: 'user', content: "Absolutely. I have records I've been collecting for forty years. Some real gems in there." },
      { role: 'assistant', content: "Forty years of collecting! What's your most prized record?" },
      { role: 'user', content: "A signed Dizzy Gillespie album. Got it at a concert in 1978. Worth a fortune now but I'd never sell it." },
      { role: 'assistant', content: "A signed Dizzy Gillespie! That's an incredible piece of music history. What a memory." },
      { role: 'user', content: "He was something else live. The whole audience was on their feet." },
      { role: 'assistant', content: "I can only imagine! Do you get to any live music these days?" },
      { role: 'user', content: "There's a jazz club downtown that does Sunday matinees. I try to go once a month." },
      { role: 'assistant', content: `That's wonderful that you still get out for live music, ${name}! Enjoy those records. Talk to you soon!` },
      { role: 'user', content: "Thank you dear, always a pleasure. Goodbye!" },
    ],
    summary: (name) => `${name} spent the morning listening to jazz records — Miles Davis, Kind of Blue. Son gave a new turntable for Christmas. Has a 40-year record collection including a signed Dizzy Gillespie album from a 1978 concert. Attends jazz club matinees monthly.`,
    topics: ['music', 'jazz', 'hobbies', 'family'],
  },
  {
    theme: 'reading_books',
    applicableInterests: ['reading', 'history', 'poetry'],
    generateTranscript: (name) => [
      { role: 'assistant', content: `Hey ${name}! What's new with you today?` },
      { role: 'user', content: "I just finished a wonderful book! Stayed up past my bedtime reading it." },
      { role: 'assistant', content: "A book that keeps you up late must be really good! What was it?" },
      { role: 'user', content: "A historical novel about World War Two. Set in France during the resistance." },
      { role: 'assistant', content: "That sounds captivating! Do you read a lot of historical fiction?" },
      { role: 'user', content: "I love it. History was my favorite subject in school. Still is, I suppose." },
      { role: 'assistant', content: "Do you have a favorite period of history?" },
      { role: 'user', content: "The 1940s, probably because my father served in the war. He had the most amazing stories." },
      { role: 'assistant', content: "That personal connection must make the historical fiction even more meaningful to you." },
      { role: 'user', content: "It does. Sometimes I read things and think, dad might have been right there." },
      { role: 'assistant', content: "That's really special. Do you get your books from the library?" },
      { role: 'user', content: "The library has a bookmobile that comes to my neighborhood every Tuesday. I love it." },
      { role: 'assistant', content: "A bookmobile! That's wonderful. Do you already know what you'll read next?" },
      { role: 'user', content: "The librarian recommended a new one about the Pacific Theater. I'm excited to start it." },
      { role: 'assistant', content: `Sounds like you're all set, ${name}! Enjoy the new book. Don't stay up too late though! Talk soon.` },
      { role: 'user', content: "No promises! Goodbye, dear." },
    ],
    summary: (name) => `${name} finished a WWII historical novel set in France during the resistance — stayed up late reading it. Loves history, especially 1940s due to father's military service. Uses the neighborhood bookmobile (Tuesdays). Starting a new book about the Pacific Theater.`,
    topics: ['reading', 'history', 'family memories'],
  },
];

// ---------------------------------------------------------------------------
// Concern templates
// ---------------------------------------------------------------------------

const CONCERN_TEMPLATES = [
  {
    type: 'health',
    severity: 'low',
    description: 'Mentioned mild joint stiffness in the morning',
    evidence: 'User said hands feel stiff and achy, especially in the mornings',
    recommended_action: 'Monitor and mention to caregiver if persists',
  },
  {
    type: 'health',
    severity: 'low',
    description: 'Reported occasional dizziness when standing up quickly',
    evidence: 'User mentioned feeling dizzy once this week when getting out of bed',
    recommended_action: 'Suggest getting up slowly and staying hydrated',
  },
  {
    type: 'social',
    severity: 'low',
    description: 'Has not spoken to anyone in two days',
    evidence: 'User mentioned not talking to anyone since Sunday',
    recommended_action: 'Encourage reaching out to family or neighbors',
  },
  {
    type: 'mood',
    severity: 'low',
    description: 'Seemed quieter than usual during the call',
    evidence: 'Shorter responses and less enthusiastic tone compared to previous calls',
    recommended_action: 'Follow up in next call to check on emotional state',
  },
  {
    type: 'health',
    severity: 'medium',
    description: 'Forgot to take morning medication',
    evidence: 'User realized mid-conversation they had not taken their morning pills',
    recommended_action: 'Alert caregiver about medication adherence',
  },
  {
    type: 'safety',
    severity: 'low',
    description: 'Mentioned a near-fall going down the stairs',
    evidence: 'User said they tripped on the bottom step but caught themselves',
    recommended_action: 'Discuss stair safety with caregiver',
  },
];

const POSITIVE_OBSERVATIONS_POOL = [
  'Engaged and talkative throughout the call',
  'Shared multiple stories with enthusiasm',
  'Mentioned regular physical activity',
  'Good appetite and eating well',
  'Strong social connections in the community',
  'Positive outlook and good humor',
  'Keeping up with hobbies and interests',
  'Good medication compliance',
  'Looking forward to upcoming family visits',
  'Active participation in community activities',
  'Clear and sharp memory recall',
  'Expressed gratitude and contentment',
  'Maintaining healthy daily routines',
  'Good sleep quality reported',
  'Independent with daily tasks',
];

const FOLLOW_UP_POOL = [
  'Ask about the garden progress next time',
  'Check on the medication adjustment results',
  'Follow up on the upcoming family visit',
  'Ask how the new book is going',
  'Check if the knee/back pain has improved',
  'Ask about the church bazaar preparations',
  'Follow up on the insurance call',
  'Ask about the birdwatching',
  'Check on the neighbor relationship',
  'Ask about upcoming doctor appointments',
];

// ---------------------------------------------------------------------------
// Main seed logic
// ---------------------------------------------------------------------------

const SEED_MARKER = '[OBSERVABILITY_SEED]';
const END_REASONS = ['goodbye_detected', 'user_hangup', 'time_limit', 'natural_end'];
const ALL_TOOLS = ['search_memories', 'get_news', 'save_important_detail', 'check_caregiver_notes'];

try {
  console.log('Starting observability seed...\n');

  // -----------------------------------------------------------------------
  // Step 1: Cleanup
  // -----------------------------------------------------------------------
  console.log('Step 1: Cleaning up old seed data...');

  // Find seniors to delete (seed marker OR legacy 555 phones)
  const oldSeniors = await db.execute(sql`
    SELECT id FROM seniors
    WHERE additional_info = ${SEED_MARKER}
       OR phone LIKE '555%'
       OR phone LIKE '+1202555%'
  `);

  let cleanedCount = 0;
  if (oldSeniors.rows.length > 0) {
    const seniorIds = oldSeniors.rows.map(r => r.id);
    const idList = sql.join(seniorIds.map(id => sql`${id}`), sql`, `);

    // Delete in dependency order
    await db.execute(sql`DELETE FROM call_analyses WHERE senior_id IN (${idList})`);
    await db.execute(sql`DELETE FROM call_metrics WHERE senior_id IN (${idList})`);
    await db.execute(sql`DELETE FROM daily_call_context WHERE senior_id IN (${idList})`);
    await db.execute(sql`DELETE FROM memories WHERE senior_id IN (${idList})`);
    await db.execute(sql`DELETE FROM conversations WHERE senior_id IN (${idList})`);
    await db.execute(sql`DELETE FROM reminder_deliveries WHERE reminder_id IN (
      SELECT id FROM reminders WHERE senior_id IN (${idList})
    )`);
    await db.execute(sql`DELETE FROM reminders WHERE senior_id IN (${idList})`);
    await db.execute(sql`DELETE FROM caregivers WHERE senior_id IN (${idList})`);
    await db.execute(sql`DELETE FROM seniors WHERE id IN (${idList})`);

    cleanedCount = seniorIds.length;
    console.log(`  Cleaned ${cleanedCount} old seed seniors and related data.`);
  } else {
    console.log('  No old seed data found.');
  }

  // -----------------------------------------------------------------------
  // Step 2: Create seniors
  // -----------------------------------------------------------------------
  console.log('\nStep 2: Creating 8 test seniors...');

  const createdSeniors = [];
  for (const profile of SENIOR_PROFILES) {
    const result = await db.execute(sql`
      INSERT INTO seniors (name, phone, timezone, interests, family_info, medical_notes,
                           city, state, is_active, additional_info)
      VALUES (
        ${profile.name},
        ${profile.phone},
        ${profile.timezone},
        ${sql`ARRAY[${sql.join(profile.interests.map(i => sql`${i}`), sql`, `)}]::text[]`},
        ${JSON.stringify(profile.familyInfo)},
        ${profile.medicalNotes},
        ${profile.city},
        ${profile.state},
        false,
        ${SEED_MARKER}
      )
      RETURNING id, name, timezone, interests
    `);
    const senior = result.rows[0];
    createdSeniors.push({
      id: senior.id,
      name: senior.name,
      firstName: senior.name.split(' ')[0],
      timezone: senior.timezone,
      interests: senior.interests || profile.interests,
    });
    console.log(`  Created: ${senior.name} (${senior.id})`);
  }

  // -----------------------------------------------------------------------
  // Step 3: Create ~50 conversations
  // -----------------------------------------------------------------------
  console.log('\nStep 3: Creating conversations with transcripts...');

  const now = new Date();
  const conversationsCreated = [];

  // Generate ~50 conversations spread over 30 days
  // More recent days get more conversations
  const conversationPlan = [];
  for (let daysAgo = 29; daysAgo >= 0; daysAgo--) {
    // More recent days = more conversations
    let callsThisDay;
    if (daysAgo <= 3) callsThisDay = randomInt(2, 3);
    else if (daysAgo <= 10) callsThisDay = randomInt(1, 2);
    else callsThisDay = Math.random() < 0.6 ? 1 : 0;

    for (let c = 0; c < callsThisDay; c++) {
      conversationPlan.push(daysAgo);
    }
  }

  // Trim or extend to ~50
  while (conversationPlan.length > 52) conversationPlan.pop();
  while (conversationPlan.length < 48) {
    conversationPlan.push(randomInt(5, 20));
  }
  conversationPlan.sort((a, b) => b - a);

  for (const daysAgo of conversationPlan) {
    const senior = randomChoice(createdSeniors);

    // Pick a template that matches senior's interests (or a generic one)
    const matchingTemplates = CONVERSATION_TEMPLATES.filter(t =>
      t.applicableInterests.length === 0 ||
      t.applicableInterests.some(interest => senior.interests.includes(interest))
    );
    const template = randomChoice(matchingTemplates);

    // Generate call timing
    const callDate = new Date(now);
    callDate.setDate(callDate.getDate() - daysAgo);
    const callHour = randomInt(9, 18); // 9 AM to 6 PM
    const callMinute = randomInt(0, 59);
    callDate.setHours(callHour, callMinute, 0, 0);

    const durationSeconds = randomInt(180, 600);
    const endDate = new Date(callDate.getTime() + durationSeconds * 1000);
    const callSid = generateCallSid();

    // Generate transcript with timestamps
    const rawTranscript = template.generateTranscript(senior.firstName);
    const turnSpacing = durationSeconds / rawTranscript.length;
    const transcript = rawTranscript.map((turn, i) => ({
      ...turn,
      timestamp: new Date(callDate.getTime() + i * turnSpacing * 1000).toISOString(),
    }));

    const summary = template.summary(senior.firstName);
    const topics = template.topics;

    // Determine sentiment from engagement
    const engagementScore = weightedScore();
    const sentiment = engagementScore >= 7 ? 'positive' : engagementScore >= 5 ? 'neutral' : 'negative';

    // ~30% chance of a concern
    const hasConcern = Math.random() < 0.3;
    const concerns = hasConcern ? [randomChoice(CONCERN_TEMPLATES).description] : [];

    // Insert conversation
    const convResult = await db.execute(sql`
      INSERT INTO conversations (senior_id, call_sid, started_at, ended_at, duration_seconds,
                                  status, summary, sentiment, concerns, transcript)
      VALUES (
        ${senior.id},
        ${callSid},
        ${callDate.toISOString()},
        ${endDate.toISOString()},
        ${durationSeconds},
        'completed',
        ${summary},
        ${sentiment},
        ${hasConcern
          ? sql`ARRAY[${sql.join(concerns.map(c => sql`${c}`), sql`, `)}]::text[]`
          : sql`'{}'::text[]`},
        ${JSON.stringify(transcript)}
      )
      RETURNING id
    `);

    const conversationId = convResult.rows[0].id;
    conversationsCreated.push({
      id: conversationId,
      callSid,
      seniorId: senior.id,
      seniorFirstName: senior.firstName,
      startedAt: callDate,
      durationSeconds,
      transcript,
      template,
      engagementScore,
      sentiment,
      hasConcern,
      concerns,
      topics,
    });
  }

  console.log(`  Created ${conversationsCreated.length} conversations.`);

  // -----------------------------------------------------------------------
  // Step 4: Create call_metrics rows
  // -----------------------------------------------------------------------
  console.log('\nStep 4: Creating call_metrics...');

  for (const conv of conversationsCreated) {
    const turnCount = conv.transcript.filter(t => t.role === 'assistant').length;
    const endReason = randomChoice(END_REASONS);
    const toolsUsed = randomSubset(ALL_TOOLS, 1, 3);
    const errorCount = Math.random() < 0.1 ? 1 : 0;

    // Phase durations that roughly sum to the total
    const openingDur = randomInt(15, 45);
    const closingDur = randomInt(10, 20);
    const windingDur = randomInt(20, 40);
    const mainDur = Math.max(60, conv.durationSeconds - openingDur - closingDur - windingDur);

    const phaseDurations = {
      opening: openingDur,
      main: mainDur,
      winding_down: windingDur,
      closing: closingDur,
    };

    const latency = {
      llm_ttfb_avg_ms: randomInt(150, 400),
      tts_ttfb_avg_ms: randomInt(200, 500),
      turn_avg_ms: randomInt(300, 700),
    };

    const breakerStates = {
      gemini: 'closed',
      openai_embeddings: 'closed',
      news: 'closed',
    };

    const promptTokens = randomInt(1500, 4000);
    const completionTokens = randomInt(300, 800);
    const cacheReadTokens = randomInt(500, Math.min(2000, promptTokens));
    const ttsCharacters = randomInt(1500, 4000);

    const tokenUsage = {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      cache_read_tokens: cacheReadTokens,
      tts_characters: ttsCharacters,
    };

    await db.execute(sql`
      INSERT INTO call_metrics (call_sid, senior_id, call_type, duration_seconds, end_reason,
                                 turn_count, phase_durations, latency, breaker_states,
                                 tools_used, token_usage, error_count, created_at)
      VALUES (
        ${conv.callSid},
        ${conv.seniorId},
        'check-in',
        ${conv.durationSeconds},
        ${endReason},
        ${turnCount},
        ${JSON.stringify(phaseDurations)},
        ${JSON.stringify(latency)},
        ${JSON.stringify(breakerStates)},
        ${sql`ARRAY[${sql.join(toolsUsed.map(t => sql`${t}`), sql`, `)}]::text[]`},
        ${JSON.stringify(tokenUsage)},
        ${errorCount},
        ${conv.startedAt.toISOString()}
      )
    `);
  }

  console.log(`  Created ${conversationsCreated.length} call_metrics rows.`);

  // -----------------------------------------------------------------------
  // Step 5: Create call_analyses rows
  // -----------------------------------------------------------------------
  console.log('\nStep 5: Creating call_analyses...');

  for (const conv of conversationsCreated) {
    const rapport = conv.engagementScore >= 7 ? 'strong' : conv.engagementScore >= 5 ? 'moderate' : 'weak';
    const callQuality = {
      rapport,
      goals_achieved: Math.random() < 0.85,
      duration_appropriate: true,
    };

    const analysisTopics = [...conv.topics];
    const positiveObs = randomSubset(POSITIVE_OBSERVATIONS_POOL, 2, 4);
    const followUps = randomSubset(FOLLOW_UP_POOL, 1, 3);

    const analysisConerns = conv.hasConcern
      ? [randomChoice(CONCERN_TEMPLATES)]
      : [];

    await db.execute(sql`
      INSERT INTO call_analyses (conversation_id, senior_id, summary, topics, engagement_score,
                                  concerns, positive_observations, follow_up_suggestions,
                                  call_quality, created_at)
      VALUES (
        ${String(conv.id)},
        ${conv.seniorId},
        ${conv.template.summary(conv.seniorFirstName)},
        ${sql`ARRAY[${sql.join(analysisTopics.map(t => sql`${t}`), sql`, `)}]::text[]`},
        ${conv.engagementScore},
        ${JSON.stringify(analysisConerns)},
        ${sql`ARRAY[${sql.join(positiveObs.map(o => sql`${o}`), sql`, `)}]::text[]`},
        ${sql`ARRAY[${sql.join(followUps.map(f => sql`${f}`), sql`, `)}]::text[]`},
        ${JSON.stringify(callQuality)},
        ${conv.startedAt.toISOString()}
      )
    `);
  }

  console.log(`  Created ${conversationsCreated.length} call_analyses rows.`);

  // -----------------------------------------------------------------------
  // Step 6: Update conversations with sentiment/concerns from analysis
  // -----------------------------------------------------------------------
  console.log('\nStep 6: Updating conversation sentiment and concerns from analyses...');

  for (const conv of conversationsCreated) {
    const rapport = conv.engagementScore >= 7 ? 'strong' : conv.engagementScore >= 5 ? 'moderate' : 'weak';
    const updatedSentiment = rapport === 'strong' ? 'positive' : rapport === 'moderate' ? 'neutral' : 'negative';

    await db.execute(sql`
      UPDATE conversations
      SET sentiment = ${updatedSentiment}
      WHERE id = ${conv.id}
    `);
  }

  console.log('  Done.');

  // -----------------------------------------------------------------------
  // Step 7: Summary
  // -----------------------------------------------------------------------
  console.log(`
Seed complete:
  ${createdSeniors.length} seniors created (is_active=false)
  ${conversationsCreated.length} conversations with transcripts
  ${conversationsCreated.length} call_metrics rows
  ${conversationsCreated.length} call_analyses rows
  Cleaned ${cleanedCount} old seed records
`);
} catch (error) {
  console.error('Seed failed:', error);
  process.exit(1);
}

process.exit(0);
