/**
 * Skills System Module
 *
 * Pluggable capabilities for Donna.
 * Skills can be added, removed, or replaced without touching core code.
 *
 * Built-in skills:
 * - News Search: Fetch personalized news
 * - Companionship: Generate conversation starters
 *
 * Easy to add new skills:
 * - Weather updates
 * - Jokes and entertainment
 * - Local events
 * - Health tips
 * - Reminiscence (historical facts)
 */

export { SkillsSystemService } from './registry';
export { NewsSearchSkill } from './skills/news-search.skill';
export { CompanionshipSkill } from './skills/companionship.skill';

export type {
  ISkillsSystem,
  Skill,
  SkillInfo,
  SkillParams,
  SkillResult,
} from '@donna/shared/interfaces';
