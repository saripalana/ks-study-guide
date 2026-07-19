export function mountDeviceSyncView(card) {
  if (!card) return null;
  card.innerHTML = `
    <div class="device-sync-heading">
      <div>
        <div class="card-kicker">DEVICE SYNC</div>
        <h3 id="deviceSyncTitle">Which copy has your newest progress?</h3>
        <p>Compare this browser with your private Google Drive backup before switching devices. Nothing is replaced until you choose.</p>
      </div>
      <div id="deviceSyncStatus" class="device-sync-status neutral" aria-live="polite">Not connected</div>
    </div>

    <div class="device-sync-comparison" aria-label="Comparison of this device and Google Drive backup">
      <article class="device-sync-copy">
        <span class="device-sync-copy-kicker">THIS DEVICE</span>
        <strong id="deviceSyncLocalTime">Not recorded yet</strong>
        <p id="deviceSyncLocalSummary">0 questions with saved responses · 0 saved tests · 0 recovery backups</p>
      </article>
      <div class="device-sync-bridge" aria-hidden="true">↔</div>
      <article class="device-sync-copy">
        <span class="device-sync-copy-kicker">GOOGLE DRIVE BACKUP</span>
        <strong id="deviceSyncDriveTime">Connect to check</strong>
        <p id="deviceSyncDriveSummary">The app cannot inspect the private backup until you connect.</p>
      </article>
    </div>
    <div id="deviceSyncTimezone" class="device-sync-timezone"></div>

    <div id="deviceSyncMessage" class="device-sync-message" aria-live="polite">
      <strong id="deviceSyncRecommendation">Connect Google Drive to compare copies</strong>
      <span>Nothing will be overwritten when you connect.</span>
    </div>

    <div class="device-sync-actions" role="group" aria-label="Choose the latest cross-device study copy">
      <button type="button" id="deviceSyncConnect" class="primary-button" disabled>Connect Google Drive</button>
      <button type="button" id="deviceSyncBackup" class="secondary-button" disabled>Use this device as latest</button>
      <button type="button" id="deviceSyncRestore" class="secondary-button" disabled>Get latest from Drive</button>
      <button type="button" id="deviceSyncDetails" class="secondary-button">More sync details</button>
    </div>

    <div class="device-sync-steps" aria-label="Safe steps for switching devices">
      <div class="device-sync-step"><span class="device-sync-number">1</span><div><strong>Finish on the current device</strong><span>Use only one device at a time.</span></div></div>
      <div class="device-sync-step"><span class="device-sync-number">2</span><div><strong>Make the newest copy latest</strong><span>Choose this device or Drive after reviewing the timestamps.</span></div></div>
      <div class="device-sync-step"><span class="device-sync-number">3</span><div><strong>Open the other device</strong><span>Connect the same Google account and compare again.</span></div></div>
    </div>

    <div class="device-sync-footer">
      <div id="deviceSyncLastSync" class="field-help">No completed transfer recorded on this browser.</div>
      <div class="field-help">Both overwrite choices create recovery history first.</div>
    </div>`;
  card.setAttribute('aria-labelledby', 'deviceSyncTitle');
  return card;
}
