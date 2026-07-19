export function mountDeviceSyncView(card) {
  if (!card) return null;
  card.innerHTML = `
    <div class="device-sync-heading">
      <div>
        <div class="card-kicker">DEVICE SYNC</div>
        <h3 id="deviceSyncTitle">Keep the newest progress on every device</h3>
        <p>The app compares this browser with your private Google Drive backup. Sync automatically uses the clearly newer copy; an unclear result asks you which source to use.</p>
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
      <strong id="deviceSyncRecommendation">Connect and sync to compare copies</strong>
      <span>Nothing is replaced until the comparison is complete.</span>
    </div>

    <div class="device-sync-actions" role="group" aria-label="Cross-device synchronization controls">
      <button type="button" id="deviceSyncNow" class="primary-button">Connect and sync</button>
      <button type="button" id="deviceSyncChoose" class="secondary-button">Choose source manually</button>
      <button type="button" id="deviceSyncDetails" class="secondary-button">More sync details</button>
    </div>

    <div class="device-sync-steps" aria-label="Automatic device synchronization process">
      <div class="device-sync-step"><span class="device-sync-number">1</span><div><strong>Compare both copies</strong><span>Hashes, timestamps, and saved-data summaries are checked.</span></div></div>
      <div class="device-sync-step"><span class="device-sync-number">2</span><div><strong>Use the clearly newer copy</strong><span>The newest source updates the older destination automatically.</span></div></div>
      <div class="device-sync-step"><span class="device-sync-number">3</span><div><strong>Ask only when needed</strong><span>An error or unclear comparison opens a source-choice window.</span></div></div>
    </div>

    <div class="device-sync-footer">
      <div id="deviceSyncLastSync" class="field-help">No completed transfer recorded on this browser.</div>
      <div class="field-help">Every replacement creates recovery history first.</div>
    </div>

    <dialog id="deviceSyncChoiceDialog" class="device-sync-dialog" aria-labelledby="deviceSyncChoiceTitle">
      <form method="dialog" class="device-sync-dialog-card">
        <div class="device-sync-dialog-heading">
          <div>
            <div class="card-kicker">CHOOSE SYNC SOURCE</div>
            <h3 id="deviceSyncChoiceTitle">Which copy should become the latest?</h3>
          </div>
          <button type="submit" value="cancel" class="device-sync-dialog-close" aria-label="Close source choice">×</button>
        </div>
        <p id="deviceSyncChoiceReason" class="device-sync-dialog-reason">The automatic comparison could not safely choose a source.</p>

        <div class="device-sync-dialog-comparison">
          <article class="device-sync-choice-copy">
            <span class="device-sync-copy-kicker">THIS DEVICE</span>
            <strong id="deviceSyncChoiceLocalTime">Not recorded yet</strong>
            <p id="deviceSyncChoiceLocalSummary">No local summary available.</p>
            <button type="button" id="deviceSyncChooseLocal" class="primary-button">Use this device</button>
            <small>Pushes this browser to Google Drive. The existing Drive copy is archived first.</small>
          </article>
          <article class="device-sync-choice-copy">
            <span class="device-sync-copy-kicker">GOOGLE DRIVE BACKUP</span>
            <strong id="deviceSyncChoiceDriveTime">Connect to check</strong>
            <p id="deviceSyncChoiceDriveSummary">No Drive summary available.</p>
            <button type="button" id="deviceSyncChooseDrive" class="primary-button">Use Google Drive</button>
            <small>Retrieves Drive onto this browser. The current browser copy is preserved first.</small>
          </article>
        </div>

        <div class="device-sync-dialog-actions">
          <button type="button" id="deviceSyncChoiceConnect" class="secondary-button">Reconnect Google Drive</button>
          <button type="submit" value="cancel" class="secondary-button">Cancel</button>
        </div>
        <div id="deviceSyncChoiceStatus" class="device-sync-dialog-status" aria-live="polite"></div>
      </form>
    </dialog>`;
  card.setAttribute('aria-labelledby', 'deviceSyncTitle');
  return card;
}
