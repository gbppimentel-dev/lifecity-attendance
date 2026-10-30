import FeedbackInbox from './FeedbackInbox';
import RubberSegment from './RubberSegment';

import { MotionSettings } from '../lib/motion';
import { useEffect, useState } from 'react';
import { History, Palette, ShieldCheck, MessageSquare } from 'lucide-react';
import ActivityHistory from './ActivityHistory';
import AccountsSettings from './AccountsSettings';
import AppearanceSettings from './AppearanceSettings';
import WorkspacePanel from './WorkspacePanel';
import './settings-workspace.css';

export default function SettingsWorkspace(props: {
  currentUserId: string;
  onLinkChanged: () => void;
}) {
  const [tab, setTab] = useState<'accounts' | 'appearance' | 'history' | 'feedback'>('accounts');
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('lifecity-settings-activate', { detail: { tab } }));
  }, [tab]);
  return (
    <div className="lc-settings-workspace">
      <RubberSegment
        as="nav"
        variant="tabs"
        className="lct-tabs lc-settings-tabs"
        ariaLabel="Settings Sections"
        value={tab}
        onChange={(value) => setTab(value as typeof tab)}
        equalSlots
        size="lg"
        radius={18}
        inset={5}
        draggable
        items={[
          {
            value: 'accounts',
            label: 'Accounts & Access',
            icon: <ShieldCheck size={18} />,
            id: 'lc-settings-accounts-tab',
            controls: 'lc-settings-accounts',
          },
          {
            value: 'appearance',
            label: 'Appearance',
            icon: <Palette size={18} />,
            id: 'lc-settings-appearance-tab',
            controls: 'lc-settings-appearance',
          },
          {
            value: 'history',
            label: 'Activity History',
            icon: <History size={18} />,
            id: 'lc-settings-history-tab',
            controls: 'lc-settings-history',
          },
          {
            value: 'feedback',
            label: 'Feedback',
            icon: <MessageSquare size={18} />,
            id: 'lc-settings-feedback-tab',
            controls: 'lc-settings-feedback',
          },
        ]}
      />
      <WorkspacePanel
        active={tab === 'accounts'}
        tabs
        id="lc-settings-accounts"
        labelledBy="lc-settings-accounts-tab"
      >
        <AccountsSettings {...props} />
      </WorkspacePanel>
      <WorkspacePanel
        active={tab === 'appearance'}
        tabs
        id="lc-settings-appearance"
        labelledBy="lc-settings-appearance-tab"
      >
        <MotionSettings />
        <AppearanceSettings />
      </WorkspacePanel>
      <WorkspacePanel
        active={tab === 'history'}
        tabs
        id="lc-settings-history"
        labelledBy="lc-settings-history-tab"
      >
        <ActivityHistory />
      </WorkspacePanel>
      <WorkspacePanel
        active={tab === 'feedback'}
        tabs
        id="lc-settings-feedback"
        labelledBy="lc-settings-feedback-tab"
      >
        <FeedbackInbox />
      </WorkspacePanel>
    </div>
  );
}
