import { createSeededRandom } from '../core/prng.js';
import type { PersonaDefinition, SyntheticUserProfile } from '../core/types.js';

export interface SyntheticUserEngineInput {
  userCount: number;
  personas: PersonaDefinition[];
  country: string;
  city: string;
  timezone: string;
  seed: number;
}

export function generateSyntheticUsers(input: SyntheticUserEngineInput): SyntheticUserProfile[] {
  const random = createSeededRandom(input.seed);
  const roster: SyntheticUserProfile[] = [];
  const pool = input.personas.filter((persona) => persona.active !== false);
  const size = Math.max(1, input.userCount);

  for (let index = 0; index < size; index += 1) {
    const persona = pool[index % pool.length] ?? random.pick(pool);
    roster.push({
      syntheticUserId: `synthetic-user-${index.toString().padStart(4, '0')}`,
      personaId: persona.id,
      country: input.country,
      city: input.city,
      timezone: input.timezone,
      trustBias: persona.trustBias,
      premiumPropensity: persona.premiumPropensity,
      irlPropensity: persona.irlPropensity,
      seedIndex: index,
    });
  }

  return roster;
}
