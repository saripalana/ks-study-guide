export function mountDeviceSyncView(card) {
  if (!card) return null;
  card.innerHTML = `
    <div class="device-sync-heading">
      <div>
        <div class="card-kicker">DEVICE SYNC</div>
        <h3 id="deviceSyncTitle">Keep your newest progress on every device</h3>
        <p>The app securely compares this browser with your private Google Drive copy and uses the clearly newer one. It asks you only when the correct source cannot be determined safely.</p>
      </div>
      <div id="deviceSyncStatus" class="device-sync-status neutral" aria-live="polite">Not connected</div>
    </div>

    <div id="deviceSyncMessage" class="device-sync-message" aria-live="polite">
      <strong id="deviceSyncRecommendation">Connect to check your saved progress</strong>
      <span>Nothing is replaced until the comparison is complete, and recovery history is created before any transfer.</span>
    </div>

    <div class="device-sync-single-action">
      <button type="button" id="deviceSyncNow" class="primary-button">Connect and sync</button>
      <div id="deviceSyncLastSync" class="field-help">No completed transfer recorded on this browser.</div>
    </div>

    <dialog id="deviceSyncChoiceDialog" class="device-sync-dialog" aria-labelledby="deviceSyncChoiceTitle">
      <form method="dialog" class="device-sync-dialog-card">
        <div class="device-sync-dialog-heading">
          <div>
            <div class="card-kicker">SYNC NEEDS YOUR CHOICE</div>
            <h3 id="deviceSyncChoiceTitle">Which copy contains your newest work?</h3>
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
            <small>Updates Google Drive from this browser after preserving the prior Drive copy.</small>
          </article>
          <article class="device-sync-choice-copy">
            <span class="device-sync-copy-kicker">GOOGLE DRIVE</span>
            <strong id="deviceSyncChoiceDriveTime">Connect to check</strong>
            <p id="deviceSyncChoiceDriveSummary">No Drive summary available.</p>
            <button type="button" id="deviceSyncChooseDrive" class="primary-button">Use Google Drive</button>
            <small>Updates this browser from Drive after preserving the current browser copy.</small>
          </article>
        </div>

        <div class="device-sync-dialog-actions">
          <button type="button" id="deviceSyncChoiceConnect" class="secondary-button">Connect Google Drive</button>
          <button type="submit" value="cancel" class="secondary-button">Cancel</button>
        </div>
        <div id="deviceSyncChoiceStatus" class="device-sync-dialog-status" aria-live="polite"></div>
      </form>
    </dialog>`;
  card.setAttribute('aria-labelledby', 'deviceSyncTitle');
  return card;
}