// notes.js — Notes tab (free-form scratchpad)

function renderNotes(c) {
  $('#contentCard').innerHTML = `
    <h2>Notes</h2>
    <div class="mini" style="margin-bottom:14px;">Personal scratchpad for session notes, NPCs, locations, or anything else. ${gameMode === 'player' ? '<b>Your DM can view these notes.</b>' : ''}</div>
    <div style="max-width:660px;">
      ${textAreaField('Notes','player_notes', c.player_notes || '')}
    </div>
  `;

  wireTextAreaFields('#contentCard');

  // Auto-focus textarea for faster note-taking
  setTimeout(() => {
    const textarea = document.querySelector('#contentCard textarea');
    if (textarea) textarea.focus();
  }, 0);
}
