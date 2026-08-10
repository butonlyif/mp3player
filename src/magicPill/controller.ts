import {
  isMagicPillCommand,
  type MagicPillCommand,
  type MagicPillSnapshot,
} from './protocol';

export interface MagicPillPlatform {
  createOrFocusPill(): Promise<void>;
  waitUntilReady(timeoutMs: number): Promise<void>;
  sendSnapshot(snapshot: MagicPillSnapshot): Promise<void>;
  hideMain(): Promise<void>;
  showAndFocusMain(): Promise<void>;
  closePill(): Promise<void>;
  onCommand(handler: (command: unknown) => void): Promise<() => void>;
  onPillDestroyed(handler: () => void): Promise<() => void>;
}

export interface MagicPillController {
  setCommandHandler(handler: (command: MagicPillCommand) => void): void;
  enter(initial: MagicPillSnapshot): Promise<void>;
  publish(snapshot: MagicPillSnapshot): Promise<void>;
  restore(): Promise<void>;
  dispose(): void;
}

export function createMagicPillController(platform: MagicPillPlatform): MagicPillController {
  let commandHandler: (command: MagicPillCommand) => void = () => undefined;
  let unlistenCommand: (() => void) | undefined;
  let unlistenDestroyed: (() => void) | undefined;
  let enterPromise: Promise<void> | null = null;
  let ready = false;
  let active = false;
  let restoring = false;

  const cleanupListeners = () => {
    const commandCleanup = unlistenCommand;
    const destroyedCleanup = unlistenDestroyed;
    unlistenCommand = undefined;
    unlistenDestroyed = undefined;
    commandCleanup?.();
    destroyedCleanup?.();
  };

  const restoreUnexpectedly = async () => {
    if (restoring || !active) return;
    active = false;
    ready = false;
    cleanupListeners();
    await platform.showAndFocusMain();
  };

  const controller: MagicPillController = {
    setCommandHandler(handler) {
      commandHandler = handler;
    },

    enter(initial) {
      if (enterPromise) return enterPromise;
      if (active) return Promise.resolve();

      enterPromise = (async () => {
        try {
          await platform.createOrFocusPill();
          unlistenCommand = await platform.onCommand((candidate) => {
            if (isMagicPillCommand(candidate)) commandHandler(candidate);
          });
          unlistenDestroyed = await platform.onPillDestroyed(() => {
            void restoreUnexpectedly();
          });
          await platform.waitUntilReady(4_000);
          await platform.sendSnapshot(initial);
          await platform.hideMain();
          ready = true;
          active = true;
        } catch (error) {
          ready = false;
          active = false;
          cleanupListeners();
          await platform.closePill();
          throw error;
        } finally {
          enterPromise = null;
        }
      })();

      return enterPromise;
    },

    async publish(snapshot) {
      if (ready) await platform.sendSnapshot(snapshot);
    },

    async restore() {
      if (restoring || !active) return;
      restoring = true;
      try {
        await platform.showAndFocusMain();
        await platform.closePill();
        active = false;
        ready = false;
        cleanupListeners();
      } finally {
        restoring = false;
      }
    },

    dispose() {
      active = false;
      ready = false;
      cleanupListeners();
    },
  };

  return controller;
}
