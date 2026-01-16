import {
  ISkillsSystem,
  Skill,
  SkillInfo,
  SkillParams,
  SkillResult,
} from '@donna/shared/interfaces';

/**
 * Skills System Registry
 *
 * This is the core of the pluggable skills system.
 * Skills can be:
 * - Registered dynamically
 * - Enabled/disabled at runtime
 * - Swapped out without code changes
 * - Tested independently
 *
 * Example skills:
 * - News search
 * - Weather updates
 * - Jokes and entertainment
 * - Local events
 * - Health tips
 */
export class SkillsSystemService implements ISkillsSystem {
  private skills: Map<string, Skill> = new Map();

  /**
   * Register a new skill
   */
  register(skill: Skill): void {
    if (this.skills.has(skill.name)) {
      console.warn(`Skill '${skill.name}' is already registered. Overwriting.`);
    }

    this.skills.set(skill.name, skill);
    console.log(`✓ Skill registered: ${skill.name} (v${skill.version})`);
  }

  /**
   * Unregister a skill
   */
  unregister(skillName: string): void {
    if (!this.skills.has(skillName)) {
      throw new Error(`Skill '${skillName}' is not registered`);
    }

    this.skills.delete(skillName);
    console.log(`✓ Skill unregistered: ${skillName}`);
  }

  /**
   * Execute a skill by name
   */
  async execute(skillName: string, params: SkillParams): Promise<SkillResult> {
    const skill = this.skills.get(skillName);

    if (!skill) {
      return {
        success: false,
        data: null,
        error: `Skill '${skillName}' not found. Available skills: ${Array.from(this.skills.keys()).join(', ')}`,
      };
    }

    try {
      const result = await skill.execute(params);
      return result;
    } catch (error: any) {
      console.error(`Error executing skill '${skillName}':`, error);
      return {
        success: false,
        data: null,
        error: error.message || 'Unknown error executing skill',
      };
    }
  }

  /**
   * List all available skills
   */
  listAvailable(): SkillInfo[] {
    return Array.from(this.skills.values()).map(skill => ({
      name: skill.name,
      description: skill.description,
      version: skill.version,
      parameters: skill.parameters,
    }));
  }

  /**
   * Get a specific skill (for inspection)
   */
  getSkill(skillName: string): Skill | undefined {
    return this.skills.get(skillName);
  }

  /**
   * Check if a skill is registered
   */
  hasSkill(skillName: string): boolean {
    return this.skills.has(skillName);
  }
}
