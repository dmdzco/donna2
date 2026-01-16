import {
  Skill,
  SkillParams,
  SkillResult,
} from '@donna/shared/interfaces';

/**
 * Companionship Skill
 *
 * Generates conversation starters and topics based on senior's interests.
 * Helps keep conversations engaging and meaningful.
 */
export class CompanionshipSkill implements Skill {
  name = 'companionship';
  description = 'Generate conversation starters and engaging topics for seniors';
  version = '1.0.0';
  parameters = [
    {
      name: 'category',
      type: 'string' as const,
      required: false,
      description: 'Category of conversation: memories, hobbies, family, current-events',
    },
  ];

  async execute(params: SkillParams): Promise<SkillResult> {
    const { senior } = params;
    const category = params.category || 'general';

    const topics = this.generateTopics(senior, category);

    return {
      success: true,
      data: {
        topics,
        category,
      },
      metadata: {
        count: topics.length,
        seniorInterests: senior.interests,
      },
    };
  }

  private generateTopics(senior: any, category: string): string[] {
    const topics: string[] = [];
    const age = senior.dateOfBirth
      ? Math.floor(
          (Date.now() - new Date(senior.dateOfBirth).getTime()) /
            (365.25 * 24 * 60 * 60 * 1000)
        )
      : undefined;

    // Era-specific topics (based on age)
    if (age && age >= 70) {
      topics.push(
        `Do you remember watching the moon landing in 1969? What was that like?`,
        `What was music like when you were young? Did you have a favorite band?`,
        `Tell me about your first car. What kind was it?`
      );
    }

    // Interest-based topics
    if (senior.interests) {
      senior.interests.forEach((interest: string) => {
        switch (interest.toLowerCase()) {
          case 'gardening':
            topics.push(
              `What's your favorite thing to grow in your garden?`,
              `Do you have any gardening tips you've learned over the years?`
            );
            break;
          case 'cooking':
            topics.push(
              `What's your favorite recipe? Has it been passed down in your family?`,
              `Is there a dish you used to make that brings back special memories?`
            );
            break;
          case 'reading':
            topics.push(
              `What kind of books do you enjoy reading?`,
              `Is there a book that made a big impact on you?`
            );
            break;
          case 'music':
            topics.push(
              `What kind of music do you enjoy listening to?`,
              `Did you ever play an instrument?`
            );
            break;
        }
      });
    }

    // Family topics
    if (category === 'family' || category === 'general') {
      topics.push(
        `How is your family doing?`,
        `Do you have any grandchildren? Tell me about them!`,
        `What's a favorite family tradition you have?`
      );
    }

    // Seasonal topics
    const month = new Date().getMonth();
    if (month >= 2 && month <= 4) {
      // Spring
      topics.push(
        `Spring is here! Do you have any plans for the warmer weather?`,
        `Have you noticed any flowers blooming in your area?`
      );
    } else if (month >= 5 && month <= 7) {
      // Summer
      topics.push(
        `Summer is in full swing! How do you like to spend hot days?`,
        `Do you have any summer traditions?`
      );
    } else if (month >= 8 && month <= 10) {
      // Fall
      topics.push(
        `The leaves are changing! Do you enjoy fall?`,
        `What's your favorite thing about autumn?`
      );
    } else {
      // Winter
      topics.push(
        `How are you staying warm this winter?`,
        `Do you have any favorite holiday memories?`
      );
    }

    return topics.slice(0, 5); // Return top 5 topics
  }
}
