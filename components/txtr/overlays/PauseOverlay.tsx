import React from 'react';

import { TXTR } from '../../../lib/txtr/constants';
import { BigButton, CartoonPanel, GhostButton, PanelTitle, Row, ScreenScrim } from './Panel';

interface PauseOverlayProps {
  landscape: boolean;
  insets: { top: number; bottom: number };
  fontFamily?: string;
  onResume: () => void;
  onRestart: () => void;
  onMenu: () => void;
}

export default function PauseOverlay({
  landscape,
  insets,
  fontFamily,
  onResume,
  onRestart,
  onMenu,
}: PauseOverlayProps) {
  return (
    <ScreenScrim insets={insets}>
      <CartoonPanel small landscape={landscape} scroll={false}>
        <PanelTitle fontFamily={fontFamily}>Paused</PanelTitle>
        <BigButton label="Resume" onPress={onResume} color={TXTR.green} fontFamily={fontFamily} />
        <Row>
          <GhostButton label="Restart" onPress={onRestart} fontFamily={fontFamily} />
          <GhostButton label="Menu" onPress={onMenu} fontFamily={fontFamily} />
        </Row>
      </CartoonPanel>
    </ScreenScrim>
  );
}
