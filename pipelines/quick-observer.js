/**
 * Quick Observer - Layer 1 (0ms)
 *
 * Instant regex-based analysis that affects the CURRENT response.
 * Runs synchronously before Claude is called.
 *
 * Detects:
 * - Health mentions (symptoms, conditions, medications, appointments)
 * - Family mentions (all relationships, pets, caregivers)
 * - Emotional signals (full spectrum of emotions)
 * - Safety concerns (falls, scams, strangers, accidents)
 * - Daily living (meals, sleep, routines, activities)
 * - Social connections (friends, neighbors, community)
 * - Cognitive indicators (confusion, repetition, memory)
 * - Questions from user (needs direct answer)
 * - Engagement level (short responses, disengagement)
 * - Time references (memories, plans, schedules)
 */

// ============================================================================
// HEALTH PATTERNS - Symptoms, conditions, medications, appointments
// ============================================================================
const HEALTH_PATTERNS = [
  // Pain and discomfort
  { pattern: /\b(pain|hurt|ache|aching|sore|tender|throbbing|stabbing|burning)\b/i, signal: 'pain', severity: 'medium' },
  { pattern: /\b(headache|migraine|head hurts?)\b/i, signal: 'headache', severity: 'medium' },
  { pattern: /\b(back ache|back pain|my back)\b/i, signal: 'back_pain', severity: 'medium' },
  { pattern: /\b(joint|arthritis|stiff|stiffness|swollen|swelling)\b/i, signal: 'joint_pain', severity: 'low' },

  // Dizziness and balance
  { pattern: /\b(dizzy|dizziness|lightheaded|light headed|woozy|vertigo|spinning)\b/i, signal: 'dizziness', severity: 'high' },
  { pattern: /\b(off balance|unsteady|wobbly|lost my balance)\b/i, signal: 'balance_issue', severity: 'high' },

  // Falls and accidents
  { pattern: /\b(fell|fall|fallen|tripped|stumbled|slipped)\b/i, signal: 'fall', severity: 'high' },
  { pattern: /\b(bumped|hit my|bruise|bruised|cut myself|bleeding)\b/i, signal: 'injury', severity: 'medium' },

  // Cardiovascular
  { pattern: /\b(blood pressure|bp|hypertension)\b/i, signal: 'blood_pressure', severity: 'medium' },
  { pattern: /\b(heart|chest pain|chest tight|palpitation|racing heart|irregular heartbeat)\b/i, signal: 'cardiovascular', severity: 'high' },
  { pattern: /\b(short of breath|shortness of breath|can't breathe|hard to breathe|breathing)\b/i, signal: 'breathing', severity: 'high' },

  // Fatigue and energy
  { pattern: /\b(tired|exhausted|fatigue|fatigued|weak|no energy|drained|worn out)\b/i, signal: 'fatigue', severity: 'low' },
  { pattern: /\b(can't sleep|couldn't sleep|insomnia|awake all night|trouble sleeping|sleepless)\b/i, signal: 'sleep_issues', severity: 'medium' },
  { pattern: /\b(slept well|good sleep|rested|feel refreshed)\b/i, signal: 'good_sleep', severity: 'positive' },

  // Cognitive and mental
  { pattern: /\b(forgot|forget|forgetful|can't remember|memory|remember when)\b/i, signal: 'memory_mention', severity: 'low' },
  { pattern: /\b(confused|confusion|disoriented|don't know where|what day is it)\b/i, signal: 'confusion', severity: 'high' },
  { pattern: /\b(anxious|anxiety|panic|nervous|worried sick)\b/i, signal: 'anxiety', severity: 'medium' },

  // Appetite and nutrition
  { pattern: /\b(not hungry|no appetite|can't eat|haven't eaten|skipped meals?)\b/i, signal: 'poor_appetite', severity: 'medium' },
  { pattern: /\b(ate|eating|breakfast|lunch|dinner|meal|food|hungry)\b/i, signal: 'eating', severity: 'low' },
  { pattern: /\b(nausea|nauseous|sick to my stomach|vomit|threw up)\b/i, signal: 'nausea', severity: 'medium' },

  // Medications
  { pattern: /\b(medicine|medication|pill|pills|prescription|refill|pharmacy)\b/i, signal: 'medication', severity: 'medium' },
  { pattern: /\b(took my (medicine|medication|pills?)|already took|haven't taken)\b/i, signal: 'medication_status', severity: 'medium' },
  { pattern: /\b(side effect|makes me feel|doesn't agree with me)\b/i, signal: 'medication_issue', severity: 'medium' },

  // Medical appointments
  { pattern: /\b(doctor|physician|dr\.|specialist|nurse|therapist)\b/i, signal: 'doctor_mention', severity: 'low' },
  { pattern: /\b(appointment|checkup|check-up|follow-up|visit the doctor|see the doctor)\b/i, signal: 'appointment', severity: 'low' },
  { pattern: /\b(hospital|emergency|er|urgent care|ambulance|911)\b/i, signal: 'emergency_mention', severity: 'high' },
  { pattern: /\b(test|tests|blood work|x-ray|scan|mri|results)\b/i, signal: 'medical_test', severity: 'low' },

  // Specific conditions
  { pattern: /\b(diabetes|sugar|blood sugar|insulin)\b/i, signal: 'diabetes', severity: 'medium' },
  { pattern: /\b(cold|flu|cough|sneezing|runny nose|congested|fever)\b/i, signal: 'cold_flu', severity: 'low' },
  { pattern: /\b(vision|can't see|blurry|glasses|eyes)\b/i, signal: 'vision', severity: 'low' },
  { pattern: /\b(hearing|can't hear|deaf|hearing aid)\b/i, signal: 'hearing', severity: 'low' },
];

// ============================================================================
// FAMILY PATTERNS - All relationships, pets, caregivers
// ============================================================================
const FAMILY_PATTERNS = [
  // Children
  { pattern: /\b(daughter|daughters?)\b/i, signal: 'daughter' },
  { pattern: /\b(son|sons?)\b/i, signal: 'son' },
  { pattern: /\b(child|children|kids?)\b/i, signal: 'children' },
  { pattern: /\b(step-?(son|daughter|child))\b/i, signal: 'stepchild' },

  // Grandchildren
  { pattern: /\b(grandchild|grandchildren|grandkids?)\b/i, signal: 'grandchildren' },
  { pattern: /\b(grandson|grandsons?)\b/i, signal: 'grandson' },
  { pattern: /\b(granddaughter|granddaughters?)\b/i, signal: 'granddaughter' },
  { pattern: /\b(great-?grand(child|son|daughter|kids?))\b/i, signal: 'great_grandchildren' },

  // Spouse and partners
  { pattern: /\b(husband|hubby)\b/i, signal: 'husband' },
  { pattern: /\b(wife)\b/i, signal: 'wife' },
  { pattern: /\b(spouse|partner|significant other)\b/i, signal: 'spouse' },
  { pattern: /\b(passed away|late husband|late wife|widow|widower)\b/i, signal: 'deceased_spouse' },

  // Siblings
  { pattern: /\b(sister|sisters?)\b/i, signal: 'sister' },
  { pattern: /\b(brother|brothers?)\b/i, signal: 'brother' },
  { pattern: /\b(sibling|siblings?)\b/i, signal: 'siblings' },
  { pattern: /\b(twin)\b/i, signal: 'twin' },

  // Extended family
  { pattern: /\b(niece|nephew|aunt|uncle|cousin)\b/i, signal: 'extended_family' },
  { pattern: /\b(in-?law|mother-?in-?law|father-?in-?law|son-?in-?law|daughter-?in-?law)\b/i, signal: 'in_laws' },

  // Parents (may be deceased for seniors)
  { pattern: /\b(mother|mom|mama|mommy)\b/i, signal: 'mother' },
  { pattern: /\b(father|dad|papa|daddy)\b/i, signal: 'father' },
  { pattern: /\b(parents?)\b/i, signal: 'parents' },

  // General family
  { pattern: /\b(family|relative|relatives|kin|folks)\b/i, signal: 'family_general' },

  // Family activities
  { pattern: /\b(visit|visiting|came over|stopped by|came to see)\b/i, signal: 'visit' },
  { pattern: /\b(called|phoned|texted|messaged|video call|facetime)\b/i, signal: 'contact' },
  { pattern: /\b(birthday|anniversary|holiday|thanksgiving|christmas|easter)\b/i, signal: 'family_event' },

  // Pets (family members too!)
  { pattern: /\b(dog|puppy|pup)\b/i, signal: 'dog' },
  { pattern: /\b(cat|kitty|kitten)\b/i, signal: 'cat' },
  { pattern: /\b(pet|pets?|bird|fish|hamster)\b/i, signal: 'pet' },

  // Caregivers
  { pattern: /\b(caregiver|aide|helper|nurse|home health)\b/i, signal: 'caregiver' },
];

// ============================================================================
// EMOTION PATTERNS - Full spectrum with valence
// ============================================================================
const EMOTION_PATTERNS = [
  // Negative - Sadness
  { pattern: /\b(sad|sadness|unhappy|down|blue|depressed|gloomy|miserable)\b/i, signal: 'sad', valence: 'negative', intensity: 'high' },
  { pattern: /\b(crying|cried|tears|weeping)\b/i, signal: 'crying', valence: 'negative', intensity: 'high' },
  { pattern: /\b(grief|grieving|mourning|loss)\b/i, signal: 'grief', valence: 'negative', intensity: 'high' },

  // Negative - Loneliness
  { pattern: /\b(lonely|lonesome|alone|isolated|by myself)\b/i, signal: 'lonely', valence: 'negative', intensity: 'high' },
  { pattern: /\b(miss|missing|wish .* here|wish .* could)\b/i, signal: 'missing', valence: 'negative', intensity: 'medium' },
  { pattern: /\b(no one (calls|visits|cares)|nobody|left alone)\b/i, signal: 'abandoned', valence: 'negative', intensity: 'high' },

  // Negative - Anxiety/Worry
  { pattern: /\b(worried|worrying|worry|concern|concerned|fret|fretting)\b/i, signal: 'worried', valence: 'negative', intensity: 'medium' },
  { pattern: /\b(anxious|anxiety|nervous|uneasy|on edge|tense)\b/i, signal: 'anxious', valence: 'negative', intensity: 'medium' },
  { pattern: /\b(scared|afraid|frightened|fearful|terrified)\b/i, signal: 'scared', valence: 'negative', intensity: 'high' },
  { pattern: /\b(overwhelmed|too much|can't cope|stressed)\b/i, signal: 'overwhelmed', valence: 'negative', intensity: 'high' },

  // Negative - Frustration/Anger
  { pattern: /\b(frustrated|frustrating|aggravated|annoyed|irritated)\b/i, signal: 'frustrated', valence: 'negative', intensity: 'medium' },
  { pattern: /\b(angry|mad|furious|upset|outraged)\b/i, signal: 'angry', valence: 'negative', intensity: 'high' },
  { pattern: /\b(hate|can't stand|sick of|fed up)\b/i, signal: 'resentful', valence: 'negative', intensity: 'medium' },

  // Negative - Boredom/Apathy
  { pattern: /\b(bored|boring|nothing to do|same old|monotonous)\b/i, signal: 'bored', valence: 'negative', intensity: 'low' },
  { pattern: /\b(don't care|doesn't matter|what's the point|why bother)\b/i, signal: 'apathetic', valence: 'negative', intensity: 'high' },

  // Positive - Happiness
  { pattern: /\b(happy|glad|pleased|delighted|joyful|cheerful)\b/i, signal: 'happy', valence: 'positive', intensity: 'medium' },
  { pattern: /\b(good|great|wonderful|fantastic|amazing|excellent)\b/i, signal: 'positive', valence: 'positive', intensity: 'medium' },
  { pattern: /\b(love|loved|loving|adore)\b/i, signal: 'love', valence: 'positive', intensity: 'high' },

  // Positive - Excitement
  { pattern: /\b(excited|exciting|thrilled|can't wait|looking forward)\b/i, signal: 'excited', valence: 'positive', intensity: 'high' },
  { pattern: /\b(fun|enjoy|enjoyed|enjoying|having a (good|great) time)\b/i, signal: 'enjoying', valence: 'positive', intensity: 'medium' },

  // Positive - Gratitude
  { pattern: /\b(thank|thanks|thankful|grateful|appreciate|blessed)\b/i, signal: 'grateful', valence: 'positive', intensity: 'medium' },
  { pattern: /\b(lucky|fortunate|glad to have)\b/i, signal: 'fortunate', valence: 'positive', intensity: 'medium' },

  // Positive - Contentment
  { pattern: /\b(content|satisfied|at peace|peaceful|calm|relaxed)\b/i, signal: 'content', valence: 'positive', intensity: 'low' },
  { pattern: /\b(fine|okay|alright|doing well|can't complain)\b/i, signal: 'neutral_positive', valence: 'positive', intensity: 'low' },

  // Positive - Pride
  { pattern: /\b(proud|pride|accomplished|achievement)\b/i, signal: 'proud', valence: 'positive', intensity: 'medium' },

  // Neutral/Mixed
  { pattern: /\b(so-so|not bad|could be (better|worse)|same as usual)\b/i, signal: 'neutral', valence: 'neutral', intensity: 'low' },
];

// ============================================================================
// SAFETY PATTERNS - Falls, scams, strangers, emergencies
// ============================================================================
const SAFETY_PATTERNS = [
  // Scams and fraud
  { pattern: /\b(scam|fraud|suspicious|fake|phishing)\b/i, signal: 'scam_mention', severity: 'high' },
  { pattern: /\b(someone (called|emailed|texted) (me|saying)|strange (call|email|message))\b/i, signal: 'suspicious_contact', severity: 'high' },
  { pattern: /\b(asked for (money|bank|social security|credit card|password))\b/i, signal: 'info_request', severity: 'high' },
  { pattern: /\b(won|winner|lottery|prize|inheritance|nigerian)\b/i, signal: 'scam_indicators', severity: 'high' },
  { pattern: /\b(irs|tax|government|medicare) (called|saying|claims)\b/i, signal: 'government_scam', severity: 'high' },

  // Strangers and home safety
  { pattern: /\b(stranger|someone (came|knocked|at the door)|don't know (who|them))\b/i, signal: 'stranger', severity: 'medium' },
  { pattern: /\b(locked out|can't (get in|find my keys)|lost (my )?keys?)\b/i, signal: 'locked_out', severity: 'medium' },
  { pattern: /\b(break-?in|burglar|robbery|stolen|broke into)\b/i, signal: 'break_in', severity: 'high' },
  { pattern: /\b(smoke|fire|burning|alarm going off)\b/i, signal: 'fire', severity: 'high' },
  { pattern: /\b(gas smell|smell gas|leak)\b/i, signal: 'gas_leak', severity: 'high' },

  // Getting lost
  { pattern: /\b(lost|can't find my way|don't know where I am|confused about where)\b/i, signal: 'lost', severity: 'high' },
  { pattern: /\b(wandered|wandering|ended up somewhere)\b/i, signal: 'wandering', severity: 'medium' },

  // Driving safety
  { pattern: /\b(accident|crash|fender bender|hit (something|someone|a car))\b/i, signal: 'accident', severity: 'high' },
  { pattern: /\b(driving|drove|car|vehicle)\b/i, signal: 'driving_mention', severity: 'low' },
];

// ============================================================================
// SOCIAL PATTERNS - Friends, neighbors, community
// ============================================================================
const SOCIAL_PATTERNS = [
  // Friends
  { pattern: /\b(friend|friends|buddy|pal|bestie)\b/i, signal: 'friend' },
  { pattern: /\b(old friend|childhood friend|known for years|best friend)\b/i, signal: 'close_friend' },

  // Neighbors
  { pattern: /\b(neighbor|neighbours?|next door|across the street)\b/i, signal: 'neighbor' },

  // Community
  { pattern: /\b(church|temple|synagogue|mosque|congregation|service|mass)\b/i, signal: 'religious_community' },
  { pattern: /\b(club|group|class|meeting|bingo|cards|bridge)\b/i, signal: 'social_group' },
  { pattern: /\b(senior center|community center|library|rec center)\b/i, signal: 'community_center' },
  { pattern: /\b(volunteer|volunteering|helping)\b/i, signal: 'volunteering' },

  // Social activities
  { pattern: /\b(went out|going out|get together|gathering|party|dinner party)\b/i, signal: 'social_outing' },
  { pattern: /\b(coffee|tea|lunch|dinner) with\b/i, signal: 'social_meal' },
  { pattern: /\b(haven't seen anyone|no visitors|nobody came)\b/i, signal: 'social_isolation' },
];

// ============================================================================
// ACTIVITIES AND INTERESTS PATTERNS
// ============================================================================
const ACTIVITY_PATTERNS = [
  // Indoor activities
  { pattern: /\b(reading|read|book|books|magazine|newspaper)\b/i, signal: 'reading' },
  { pattern: /\b(tv|television|watching|show|movie|program)\b/i, signal: 'watching_tv' },
  { pattern: /\b(knitting|crocheting|sewing|quilting|crafts?)\b/i, signal: 'crafts' },
  { pattern: /\b(puzzle|crossword|sudoku|word search|jigsaw)\b/i, signal: 'puzzles' },
  { pattern: /\b(cook|cooking|bake|baking|recipe|kitchen)\b/i, signal: 'cooking' },
  { pattern: /\b(clean|cleaning|housework|laundry|dishes)\b/i, signal: 'housework' },

  // Outdoor activities
  { pattern: /\b(garden|gardening|plant|plants|flowers?|yard|lawn)\b/i, signal: 'gardening' },
  { pattern: /\b(walk|walking|stroll|went for a walk|took a walk)\b/i, signal: 'walking' },
  { pattern: /\b(exercise|exercising|workout|gym|yoga|stretching)\b/i, signal: 'exercise' },
  { pattern: /\b(bird|birds|bird ?watching|feeder)\b/i, signal: 'bird_watching' },

  // Hobbies
  { pattern: /\b(music|sing|singing|song|piano|guitar|instrument)\b/i, signal: 'music' },
  { pattern: /\b(paint|painting|art|draw|drawing|sketch)\b/i, signal: 'art' },
  { pattern: /\b(golf|bowling|tennis|swim|swimming)\b/i, signal: 'sports' },
  { pattern: /\b(fish|fishing|hunt|hunting)\b/i, signal: 'outdoor_sports' },
  { pattern: /\b(travel|trip|vacation|cruise|visit|visited)\b/i, signal: 'travel' },

  // Technology
  { pattern: /\b(computer|laptop|tablet|ipad|phone|smartphone)\b/i, signal: 'technology' },
  { pattern: /\b(email|internet|facebook|google|youtube)\b/i, signal: 'online' },
];

// ============================================================================
// TIME REFERENCE PATTERNS - Memories, schedules, plans
// ============================================================================
const TIME_PATTERNS = [
  // Past memories
  { pattern: /\b(remember when|back when|used to|in my day|years ago|long time ago)\b/i, signal: 'reminiscing' },
  { pattern: /\b(when I was (young|younger|a (kid|child|girl|boy)))\b/i, signal: 'childhood_memory' },
  { pattern: /\b(the (old|good old) days|how things were|things have changed)\b/i, signal: 'nostalgia' },

  // Recent past
  { pattern: /\b(yesterday|last (night|week|month)|the other day|recently|lately)\b/i, signal: 'recent_past' },
  { pattern: /\b(this morning|this afternoon|earlier (today)?|just now|a while ago)\b/i, signal: 'today' },

  // Future plans
  { pattern: /\b(tomorrow|next (week|month)|upcoming|coming up|soon)\b/i, signal: 'near_future' },
  { pattern: /\b(plan|plans|planning|going to|gonna|will be)\b/i, signal: 'future_plans' },
  { pattern: /\b(looking forward|can't wait|excited about)\b/i, signal: 'anticipation' },

  // Schedules
  { pattern: /\b(schedule|appointment|at (\d+|noon|morning|afternoon|evening))\b/i, signal: 'schedule' },
  { pattern: /\b(routine|every (day|morning|night|week)|usually|normally)\b/i, signal: 'routine' },
];

// ============================================================================
// WEATHER AND ENVIRONMENT PATTERNS (common senior topics)
// ============================================================================
const ENVIRONMENT_PATTERNS = [
  // Weather
  { pattern: /\b(weather|forecast|temperature|degrees)\b/i, signal: 'weather' },
  { pattern: /\b(rain|raining|rainy|storm|stormy|thunder|lightning)\b/i, signal: 'rain' },
  { pattern: /\b(snow|snowing|snowy|ice|icy|slippery|cold)\b/i, signal: 'snow_ice' },
  { pattern: /\b(hot|heat|humid|warm|sunny|beautiful day)\b/i, signal: 'warm_weather' },

  // Seasons
  { pattern: /\b(spring|summer|fall|autumn|winter|season)\b/i, signal: 'season' },

  // Home environment
  { pattern: /\b(power out|no power|electricity|outage)\b/i, signal: 'power_outage' },
  { pattern: /\b(heat|heating|furnace|thermostat|ac|air condition)\b/i, signal: 'home_temperature' },
];

// ============================================================================
// QUESTION PATTERNS - User expects a response
// ============================================================================
const QUESTION_PATTERNS = [
  { pattern: /\?$/, signal: 'explicit_question' },
  { pattern: /^(what|where|when|why|how|who|which)\b/i, signal: 'wh_question' },
  { pattern: /^(do|does|did|is|are|was|were|can|could|would|will|have|has)\b.*\?/i, signal: 'yes_no_question' },
  { pattern: /\b(tell me|let me know|do you know|wondering|I wonder)\b/i, signal: 'information_request' },
  { pattern: /\b(what do you think|your opinion|should I|would you)\b/i, signal: 'opinion_request' },
];

// ============================================================================
// ENGAGEMENT PATTERNS - Response length and patterns
// ============================================================================
const ENGAGEMENT_PATTERNS = [
  { pattern: /^(yes|no|ok|okay|sure|fine|mm|hmm|uh huh|yeah|yep|nope|nah|mhm)\.?$/i, signal: 'minimal_response' },
  { pattern: /^(i don't know|not sure|maybe|i guess|i suppose)\.?$/i, signal: 'uncertain_response' },
  { pattern: /^.{1,10}$/i, signal: 'very_short' },
  { pattern: /^.{1,25}$/i, signal: 'short' },
  { pattern: /^.{100,}$/i, signal: 'long_response' },
];

// ============================================================================
// REMINDER ACKNOWLEDGMENT PATTERNS
// ============================================================================
const REMINDER_ACKNOWLEDGMENT_PATTERNS = [
  // Acknowledgment (will do) - higher confidence
  { pattern: /\b(ok(ay)?|sure|yes|will do|got it|i('ll| will) (take|do|remember)|sounds good|alright)\b/i, type: 'acknowledged', confidence: 0.8 },
  { pattern: /\b(thank(s| you)|appreciate|good reminder|glad you (called|reminded)|thanks for reminding)\b/i, type: 'acknowledged', confidence: 0.7 },
  { pattern: /\b(i('ll| will) get (to it|on it|it done)|going to (take|do) it|about to (take|do))\b/i, type: 'acknowledged', confidence: 0.9 },
  { pattern: /\b(won't forget|i'll remember|good to know)\b/i, type: 'acknowledged', confidence: 0.75 },

  // Confirmation (already done) - higher confidence
  { pattern: /\b(already (took|did|done|finished|had|taken)|just (took|did|finished)|i('ve| have) (taken|done|had|finished))\b/i, type: 'confirmed', confidence: 0.95 },
  { pattern: /\b(took (it|them|my|the)|did (it|that)|done( with)?( it)?|finished|completed)\b/i, type: 'confirmed', confidence: 0.85 },
  { pattern: /\b(earlier|this morning|a (few )?minutes ago|before you called|right before)\b/i, type: 'confirmed', confidence: 0.8 },
];

// ============================================================================
// MAIN ANALYSIS FUNCTION
// ============================================================================

/**
 * Quick analysis of user message - runs in 0ms (synchronous regex)
 * Returns guidance to inject into system prompt for current response
 *
 * @param {string} userMessage - The current user message
 * @param {Array<{role: string, content: string}>} recentHistory - Last few exchanges (optional)
 * @returns {object} Analysis result with guidance
 */
export function quickAnalyze(userMessage, recentHistory = []) {
  const result = {
    healthSignals: [],
    familySignals: [],
    emotionSignals: [],
    safetySignals: [],
    socialSignals: [],
    activitySignals: [],
    timeSignals: [],
    environmentSignals: [],
    isQuestion: false,
    questionType: null,
    engagementLevel: 'normal',
    guidance: null,
    modelRecommendation: null,
    reminderResponse: null,
  };

  if (!userMessage) return result;

  const text = userMessage.trim();

  // Check all pattern categories
  for (const { pattern, signal, severity } of HEALTH_PATTERNS) {
    if (pattern.test(text)) {
      result.healthSignals.push({ signal, severity: severity || 'low' });
    }
  }

  for (const { pattern, signal } of FAMILY_PATTERNS) {
    if (pattern.test(text)) {
      result.familySignals.push(signal);
    }
  }

  for (const { pattern, signal, valence, intensity } of EMOTION_PATTERNS) {
    if (pattern.test(text)) {
      result.emotionSignals.push({ signal, valence, intensity: intensity || 'medium' });
    }
  }

  for (const { pattern, signal, severity } of SAFETY_PATTERNS) {
    if (pattern.test(text)) {
      result.safetySignals.push({ signal, severity: severity || 'medium' });
    }
  }

  for (const { pattern, signal } of SOCIAL_PATTERNS) {
    if (pattern.test(text)) {
      result.socialSignals.push(signal);
    }
  }

  for (const { pattern, signal } of ACTIVITY_PATTERNS) {
    if (pattern.test(text)) {
      result.activitySignals.push(signal);
    }
  }

  for (const { pattern, signal } of TIME_PATTERNS) {
    if (pattern.test(text)) {
      result.timeSignals.push(signal);
    }
  }

  for (const { pattern, signal } of ENVIRONMENT_PATTERNS) {
    if (pattern.test(text)) {
      result.environmentSignals.push(signal);
    }
  }

  // Check for questions
  for (const { pattern, signal } of QUESTION_PATTERNS) {
    if (pattern.test(text)) {
      result.isQuestion = true;
      result.questionType = signal;
      break;
    }
  }

  // Check engagement level
  for (const { pattern, signal } of ENGAGEMENT_PATTERNS) {
    if (pattern.test(text)) {
      if (signal === 'minimal_response' || signal === 'very_short' || signal === 'uncertain_response') {
        result.engagementLevel = 'low';
      } else if (signal === 'short' && result.engagementLevel !== 'low') {
        result.engagementLevel = 'medium';
      } else if (signal === 'long_response') {
        result.engagementLevel = 'high';
      }
    }
  }

  // Check for consecutive short responses (disengagement pattern)
  if (recentHistory.length >= 2) {
    const lastUserMessages = recentHistory
      .filter(m => m.role === 'user')
      .slice(-3)
      .map(m => m.content);

    const shortCount = lastUserMessages.filter(m => m && m.length < 20).length;
    if (shortCount >= 2) {
      result.engagementLevel = 'low';
    }
  }

  // Check for reminder acknowledgment/confirmation
  let bestReminderMatch = null;
  for (const { pattern, type, confidence } of REMINDER_ACKNOWLEDGMENT_PATTERNS) {
    if (pattern.test(text)) {
      if (!bestReminderMatch || confidence > bestReminderMatch.confidence) {
        bestReminderMatch = { type, confidence };
      }
    }
  }
  if (bestReminderMatch) {
    result.reminderResponse = bestReminderMatch;
  }

  // Build guidance string for system prompt
  result.guidance = buildGuidance(result);

  // Build model recommendation for dynamic routing
  result.modelRecommendation = buildModelRecommendation(result);

  return result;
}

/**
 * Build model recommendation based on detected signals
 * Returns token adjustment for sensitive situations
 */
function buildModelRecommendation(analysis) {
  // Safety concerns - highest priority
  const highSeveritySafety = analysis.safetySignals.filter(s => s.severity === 'high');
  if (highSeveritySafety.length > 0) {
    return {
      use_sonnet: true,
      max_tokens: 200,
      reason: 'safety_concern'
    };
  }

  // High severity health - needs careful response
  const highSeverityHealth = analysis.healthSignals.filter(s => s.severity === 'high');
  if (highSeverityHealth.length > 0) {
    return {
      use_sonnet: true,
      max_tokens: 180,
      reason: 'health_safety'
    };
  }

  // Medium severity health
  const mediumSeverityHealth = analysis.healthSignals.filter(s => s.severity === 'medium');
  if (mediumSeverityHealth.length > 0) {
    return {
      use_sonnet: true,
      max_tokens: 150,
      reason: 'health_mention'
    };
  }

  // High intensity negative emotions
  const highIntensityNegative = analysis.emotionSignals.filter(
    e => e.valence === 'negative' && e.intensity === 'high'
  );
  if (highIntensityNegative.length > 0) {
    return {
      use_sonnet: true,
      max_tokens: 180,
      reason: 'emotional_support'
    };
  }

  // Medium intensity negative emotions
  const mediumIntensityNegative = analysis.emotionSignals.filter(
    e => e.valence === 'negative' && e.intensity === 'medium'
  );
  if (mediumIntensityNegative.length > 0) {
    return {
      use_sonnet: true,
      max_tokens: 150,
      reason: 'emotional_support'
    };
  }

  // Low engagement - need creative re-engagement
  if (analysis.engagementLevel === 'low') {
    return {
      use_sonnet: true,
      max_tokens: 130,
      reason: 'low_engagement'
    };
  }

  // Reminiscing - allow more tokens for meaningful response
  if (analysis.timeSignals.includes('reminiscing') || analysis.timeSignals.includes('childhood_memory')) {
    return {
      use_sonnet: false,
      max_tokens: 120,
      reason: 'memory_sharing'
    };
  }

  // High engagement - match their energy
  if (analysis.engagementLevel === 'high') {
    return {
      use_sonnet: false,
      max_tokens: 100,
      reason: 'high_engagement'
    };
  }

  // Simple question - quick answer
  if (analysis.isQuestion && analysis.healthSignals.length === 0 && highIntensityNegative.length === 0) {
    return {
      use_sonnet: false,
      max_tokens: 80,
      reason: 'simple_question'
    };
  }

  // Family warmth - Haiku handles fine
  if (analysis.familySignals.length > 0) {
    return {
      use_sonnet: false,
      max_tokens: 100,
      reason: 'family_warmth'
    };
  }

  // Default - no recommendation
  return null;
}

/**
 * Build guidance string for injection into system prompt
 */
function buildGuidance(analysis) {
  const lines = [];

  // Safety signals - HIGHEST priority
  if (analysis.safetySignals.length > 0) {
    const safetySignal = analysis.safetySignals[0];
    const safetyGuidance = {
      scam_mention: 'They mentioned scams. Ask what happened and remind them NEVER to share personal info.',
      suspicious_contact: 'Someone suspicious contacted them. Ask what they wanted. Advise caution.',
      info_request: 'ALERT: Someone asked for personal/financial info. Ask if they shared anything.',
      scam_indicators: 'This sounds like a scam. Gently explain this and ask if they responded.',
      government_scam: 'Government agencies don\'t call asking for money or info. This may be a scam.',
      stranger: 'A stranger approached. Ask if they felt safe. Remind them not to let strangers in.',
      locked_out: 'They\'re locked out. Ask if they need help calling someone.',
      break_in: 'URGENT: Possible break-in. Ask if they are safe. Consider if they need help.',
      fire: 'URGENT: Fire/smoke mentioned. Ask if they are safe and if they need to call 911.',
      gas_leak: 'URGENT: Gas leak suspected. They should leave and call emergency services.',
      lost: 'They seem lost or disoriented. Ask where they are and if someone can help.',
      wandering: 'They may have wandered. Ask where they are now.',
      accident: 'They had an accident. Ask if they are hurt and if they need help.',
    };
    lines.push(`[SAFETY] ${safetyGuidance[safetySignal.signal] || 'Safety concern detected. Ask if they are okay.'}`);
  }

  // Health signals - HIGH priority
  if (analysis.healthSignals.length > 0) {
    const healthSignal = analysis.healthSignals[0];
    const healthGuidance = {
      pain: 'Show empathy about their pain. Ask where it hurts and how long.',
      headache: 'Ask how bad the headache is and if they\'ve taken anything for it.',
      back_pain: 'Ask about their back pain. Is it new or ongoing?',
      joint_pain: 'Ask about their joint pain. Is it bothering them today?',
      dizziness: 'Express concern about dizziness. Ask if they should sit down.',
      balance_issue: 'Balance issues are concerning. Ask if they should sit down.',
      fall: 'IMPORTANT: Ask if they are okay and if anyone knows about the fall.',
      injury: 'Ask about the injury. Do they need help?',
      blood_pressure: 'Ask if they\'ve checked their blood pressure recently.',
      cardiovascular: 'Heart/chest mentioned. Ask how they are feeling right now.',
      breathing: 'Breathing issues are serious. Ask if they are okay right now.',
      fatigue: 'Ask if they\'ve been getting enough rest.',
      sleep_issues: 'Ask how long they\'ve had trouble sleeping.',
      good_sleep: 'Good that they slept well! Ask what helped.',
      memory_mention: 'Memory came up. Be reassuring - everyone forgets things.',
      confusion: 'They seem confused. Speak clearly and ask simple questions.',
      anxiety: 'Acknowledge their worry. Ask what\'s on their mind.',
      poor_appetite: 'Ask when they last ate. Encourage them to eat something.',
      eating: 'Ask what they had. Make sure they\'re eating well.',
      nausea: 'Ask if they\'re feeling sick. Should they call the doctor?',
      medication: 'Ask if they\'ve taken their medication today.',
      medication_status: 'They mentioned medication. Follow up on this.',
      medication_issue: 'Medication side effects - ask what\'s happening.',
      doctor_mention: 'Ask about their doctor/appointment.',
      appointment: 'Ask when their appointment is or how it went.',
      emergency_mention: 'Emergency/hospital mentioned. Ask if everything is okay.',
      medical_test: 'Ask about their test/results.',
      diabetes: 'Ask about their blood sugar management.',
      cold_flu: 'Ask how they\'re feeling. Are they getting rest?',
      vision: 'Ask about their vision. Any problems seeing?',
      hearing: 'Speak clearly. Ask if they can hear you well.',
    };
    lines.push(`[HEALTH] ${healthGuidance[healthSignal.signal] || 'Health topic mentioned. Ask how they\'re feeling.'}`);
  }

  // Emotion signals
  const negativeEmotions = analysis.emotionSignals.filter(e => e.valence === 'negative');
  const positiveEmotions = analysis.emotionSignals.filter(e => e.valence === 'positive');

  if (negativeEmotions.length > 0) {
    const emotion = negativeEmotions[0];
    const emotionGuidance = {
      sad: 'Acknowledge their sadness. Ask what\'s on their mind.',
      crying: 'They mentioned crying. Be very gentle. Ask if they want to talk about it.',
      grief: 'They\'re grieving. Be very gentle and just listen.',
      lonely: 'Be extra warm. Ask about their day. They need connection.',
      missing: 'They miss someone. Ask who and share in remembering.',
      abandoned: 'They feel alone. Reassure them you\'re here for them.',
      worried: 'Ask what\'s worrying them. Listen and acknowledge.',
      anxious: 'Ask what\'s making them anxious. Be calming.',
      scared: 'They\'re scared. Ask what\'s frightening them. Reassure.',
      overwhelmed: 'They\'re overwhelmed. Ask what\'s too much right now.',
      frustrated: 'Acknowledge their frustration. Ask what happened.',
      angry: 'They\'re upset. Ask what happened. Listen.',
      resentful: 'They\'re fed up with something. Ask what\'s bothering them.',
      bored: 'Ask about their interests. Suggest an activity.',
      apathetic: 'Low mood detected. Gently ask how they\'re really doing.',
    };
    lines.push(`[EMOTION] ${emotionGuidance[emotion.signal] || 'They seem upset. Acknowledge their feelings.'}`);
  } else if (positiveEmotions.length > 0) {
    const emotion = positiveEmotions[0];
    if (emotion.intensity === 'high') {
      lines.push('[EMOTION] They\'re in great spirits! Match their positive energy.');
    } else {
      lines.push('[EMOTION] They seem positive. Keep the warm tone.');
    }
  }

  // Social signals
  if (analysis.socialSignals.includes('social_isolation')) {
    lines.push('[SOCIAL] They haven\'t seen anyone lately. Be extra warm and engaging.');
  } else if (analysis.socialSignals.length > 0) {
    lines.push('[SOCIAL] Social connection mentioned. Ask warm follow-up questions.');
  }

  // Family signals
  if (analysis.familySignals.length > 0) {
    if (analysis.familySignals.includes('deceased_spouse')) {
      lines.push('[FAMILY] They mentioned late spouse. Be gentle and let them share if they want.');
    } else {
      lines.push('[FAMILY] Family mentioned. Ask a warm follow-up about this person.');
    }
  }

  // Activity signals
  if (analysis.activitySignals.length > 0) {
    lines.push('[ACTIVITY] They mentioned an activity. Ask more about it with genuine interest.');
  }

  // Time signals (reminiscing)
  if (analysis.timeSignals.includes('reminiscing') || analysis.timeSignals.includes('childhood_memory') || analysis.timeSignals.includes('nostalgia')) {
    lines.push('[MEMORY] They\'re sharing memories. Listen warmly and ask follow-up questions.');
  }

  // Question handling
  if (analysis.isQuestion) {
    lines.push('[QUESTION] Answer their question directly first, then continue naturally.');
  }

  // Low engagement
  if (analysis.engagementLevel === 'low') {
    lines.push('[ENGAGEMENT] Short responses detected. Ask an open question about something they enjoy.');
  }

  return lines.length > 0 ? lines.join('\n') : null;
}

export default { quickAnalyze };
