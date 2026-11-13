import { Component, Suspense, useEffect, useState, type ReactNode } from 'react';
import { useAppStore } from '../../state/useAppStore';
import { HumanRig } from './HumanRig';
import { THIEF_LOOK } from './appearances';
import { GlbCharacter } from './glb/GlbCharacter';
import { resolveThiefUrl, thiefVisual } from './glb/thiefAsset';
import type { RigDriver } from './rigTypes';


class ModelFallback extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    thiefVisual.kind = 'procedural';
    thiefVisual.error = String(error);
    console.warn('[sidhel] thief model unavailable, using the procedural rig:', error);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function Procedural({ driver }: { driver: RigDriver }) {
  thiefVisual.kind = 'procedural';
  return <HumanRig driver={driver} look={THIEF_LOOK} />;
}

function Model({ driver, url }: { driver: RigDriver; url: string }) {
  thiefVisual.kind = 'model';
  thiefVisual.url = url;
  return <GlbCharacter driver={driver} url={url} />;
}

/**
 * The thief: lungi, gamcha, headband after preparation, proud moustache. Renders the skinned GLB
 * (`characterModel: 'model'`, default) with the original procedural rig as the loading state and
 * as the automatic fallback if the file is missing or fails validation; or the procedural rig
 * only, if chosen in Settings.
 */
export function ThiefModel({ driver }: { driver: RigDriver }) {
  const choice = useAppStore((s) => s.settings.characterModel);
  // undefined = still probing, null = no model file found.
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    void resolveThiefUrl().then((u) => {
      if (!live) return;
      if (!u) thiefVisual.error = 'model file not found';
      setUrl(u);
    });
    return () => {
      live = false;
    };
  }, []);
  const procedural = <Procedural driver={driver} />;
  if (choice === 'procedural' || !url) return procedural;
  return (
    <ModelFallback fallback={procedural}>
      <Suspense fallback={procedural}>
        <Model driver={driver} url={url} />
      </Suspense>
    </ModelFallback>
  );
}
