/**
 * Test fixtures for conversation transcripts
 */

// Normal, engaged conversation
export const engagedConversation = [
  { role: 'assistant', content: 'Hello Dorothy! How are you feeling today?' },
  { role: 'user', content: "Oh hello dear! I'm doing wonderfully today. Susan came over yesterday with Tommy and we baked cookies together!" },
  { role: 'assistant', content: "That sounds like such a lovely time! What kind of cookies did you make?" },
  { role: 'user', content: "We made chocolate chip cookies, Tommy's favorite. He's getting so big now, he could reach the counter and help stir the batter. I taught him the same recipe my mother taught me." },
];

// Low engagement conversation (short responses)
export const lowEngagementConversation = [
  { role: 'assistant', content: 'Hello Harold! How are you doing today?' },
  { role: 'user', content: "Fine." },
  { role: 'assistant', content: 'Did you get a chance to work on any woodworking projects this week?' },
  { role: 'user', content: "No." },
  { role: 'assistant', content: "That's okay. Sometimes we just need to rest. Is everything alright?" },
  { role: 'user', content: "I guess." },
];

// Health concern conversation
export const healthConcernConversation = [
  { role: 'assistant', content: 'Hello Dorothy! How are you feeling today?' },
  { role: 'user', content: "Not so good today. My back has been hurting something terrible." },
  { role: 'assistant', content: "I'm so sorry to hear that. How long has your back been bothering you?" },
  { role: 'user', content: "A few days now. I fell in the bathroom last week and I think that's when it started." },
  { role: 'assistant', content: "Oh my, a fall is concerning. Did you tell Susan or your doctor about this?" },
  { role: 'user', content: "No, I didn't want to worry anyone. But I've been feeling dizzy too." },
];

// Emotional support conversation
export const emotionalSupportConversation = [
  { role: 'assistant', content: 'Hello Harold! How are you today?' },
  { role: 'user', content: "To be honest, I'm feeling pretty lonely today. I really miss Margaret." },
  { role: 'assistant', content: "I'm so sorry Harold. Grief can hit us unexpectedly. Would you like to tell me about Margaret?" },
  { role: 'user', content: "She was my everything for 52 years. Some days I just don't know why I bother anymore." },
  { role: 'assistant', content: "Those feelings are understandable, and I want you to know that you matter. What's making today particularly hard?" },
  { role: 'user', content: "It's our anniversary. We would have been married 53 years today." },
];

// Safety concern conversation (scam)
export const scamConversation = [
  { role: 'assistant', content: 'Hello Margaret! How has your day been?' },
  { role: 'user', content: "Oh it was strange. Someone called saying they were from Medicare and asked for my social security number." },
  { role: 'assistant', content: "That's very concerning, Margaret. Medicare would never call and ask for that information. Did you give them any information?" },
  { role: 'user', content: "I almost did, but then I remembered you warned me about scams. I hung up on them." },
];

// Medication reminder conversation
export const medicationReminderConversation = [
  { role: 'assistant', content: "Good morning Dorothy! This is your friendly reminder - have you taken your blood pressure medication today?" },
  { role: 'user', content: "Oh goodness, I almost forgot! Thank you for reminding me, dear. I'll take it right now." },
  { role: 'assistant', content: "You're so welcome! I'm glad I could help. How are you feeling this morning?" },
  { role: 'user', content: "Much better now that I've had my breakfast. The weather looks lovely outside." },
];

// Cognitive concern conversation
export const cognitiveConcernConversation = [
  { role: 'assistant', content: 'Hello Harold! How are you doing today?' },
  { role: 'user', content: "I'm okay, but I got confused yesterday. I drove to the grocery store and couldn't remember how to get home." },
  { role: 'assistant', content: "That must have been frightening. What did you do?" },
  { role: 'user', content: "I just sat in the parking lot for a while until it came back to me. But it's happening more often lately. I found my keys in the refrigerator last week." },
];

// End of life topic conversation
export const endOfLifeConversation = [
  { role: 'assistant', content: 'Hello Margaret! How are you today?' },
  { role: 'user', content: "I've been thinking a lot lately about getting my affairs in order. You know, making sure my will is updated." },
  { role: 'assistant', content: "That's a very responsible thing to think about. Is there something specific on your mind?" },
  { role: 'user', content: "I just want to make sure I'm not a burden on Karen and Michael when the time comes. They have their own lives." },
];

export default {
  engagedConversation,
  lowEngagementConversation,
  healthConcernConversation,
  emotionalSupportConversation,
  scamConversation,
  medicationReminderConversation,
  cognitiveConcernConversation,
  endOfLifeConversation,
};
