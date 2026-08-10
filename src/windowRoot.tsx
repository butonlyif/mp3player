export type WindowRoot = 'main' | 'magic-pill';

export const windowRootForLabel = (label: string): WindowRoot =>
  label === 'magic-pill' ? 'magic-pill' : 'main';
