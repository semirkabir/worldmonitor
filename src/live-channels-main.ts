/**
 * Entry point for the standalone channel management window (Tauri desktop).
 * Web version uses index.html?live-channels=1 and main.ts instead.
 */
import './styles/main.css';
import './styles/cursors.css';
import { initI18n } from '@/services/i18n';
import { initLiveChannelsWindow } from '@/live-channels-window';
import { installCursorDiagnostics } from '@/utils/cursor-diagnostics';
import { installForcedCursor } from '@/utils/forced-cursor';

installCursorDiagnostics();
installForcedCursor();

async function main(): Promise<void> {
  await initI18n();
  initLiveChannelsWindow();
}

void main().catch(console.error);
