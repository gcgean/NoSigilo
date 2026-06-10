// Reações compartilhadas entre feed, perfis e stories.
// Mesmos IDs em todo o app (nenhuma migração de reações de post é necessária);
// a ordem do array define a ordem de exibição no seletor.
export type PhotoReaction = 'heart' | 'love' | 'wow' | 'devil' | 'fire' | 'splash';

export const PHOTO_REACTIONS: Array<{ id: PhotoReaction; emoji: string }> = [
  { id: 'heart', emoji: '💜' },
  { id: 'love', emoji: '😍' },
  { id: 'wow', emoji: '🤤' },
  { id: 'devil', emoji: '😈' },
  { id: 'fire', emoji: '🔥' },
  { id: 'splash', emoji: '💦' },
];

export const REACTION_EMOJI: Record<string, string> = {
  heart: '💜',
  love: '😍',
  wow: '🤤',
  devil: '😈',
  fire: '🔥',
  splash: '💦',
};

export const EMPTY_REACTION_COUNTS: Record<PhotoReaction, number> = {
  heart: 0,
  love: 0,
  wow: 0,
  devil: 0,
  fire: 0,
  splash: 0,
};
