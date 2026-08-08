import { describe, expect, it } from 'vitest';
import { useStore } from './useStore';

describe('visualizer UI state', () => {
  it('toggles immersive and reactive-motion state independently', () => {
    const store = useStore.getState();
    store.setImmersiveMode(true);
    store.setReactiveMotionEnabled(false);

    expect(useStore.getState().immersiveMode).toBe(true);
    expect(useStore.getState().reactiveMotionEnabled).toBe(false);

    useStore.getState().setImmersiveMode(false);
    useStore.getState().setReactiveMotionEnabled(true);
  });
});
