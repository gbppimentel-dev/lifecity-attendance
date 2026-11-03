import { useContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { animateWorkspaceEntrance } from '../lib/workspaceEntrance';
import { WorkspaceVisibilityContext } from '../lib/workspaceVisibility';
import './workspace-panel.css';

export default function WorkspacePanel({
  active,
  children,
  label,
  id,
  labelledBy,
  retain = true,
  tabs = false,
}: {
  active: boolean;
  children: ReactNode;
  label?: string;
  id?: string;
  labelledBy?: string;
  retain?: boolean;
  tabs?: boolean;
}) {
  const parentVisible = useContext(WorkspaceVisibilityContext);
  const visible = active && parentVisible;
  const [visited, setVisited] = useState(active);
  const surface = useRef<HTMLDivElement>(null);

  if (active && !visited) setVisited(true);

  useLayoutEffect(() => {
    const node = surface.current;
    if (!visible || !node) return;
    return animateWorkspaceEntrance(node);
  }, [visible, visited]);

  if (!active && (!retain || !visited)) return null;
  return (
    <div
      ref={surface}
      id={id}
      className="lc-workspace-panel"
      data-lc-workspace-surface
      hidden={!active}
      aria-hidden={!active || undefined}
      role={tabs ? 'tabpanel' : label ? 'region' : undefined}
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
    >
      <WorkspaceVisibilityContext.Provider value={visible}>
        {children}
      </WorkspaceVisibilityContext.Provider>
    </div>
  );
}
