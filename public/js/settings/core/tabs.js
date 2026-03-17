/*
  settings/core/tabs.js

  Settings tab navigation and card visibility.
*/

/* -------------------------------------------------------------------------- */
/* Tabs manager                                                               */
/* -------------------------------------------------------------------------- */
function createSettingsTabsManager(deps) {
  const { settingsTabs, settingsTabButtons } = deps;
  let settingsTabsReady = false;

/* -------------------------------------------------------------------------- */
/* Card visibility                                                            */
/* -------------------------------------------------------------------------- */
function showSettingsCards(cardsList) {
    document.querySelectorAll('.settings-card').forEach((card) => {
      card.classList.add('hidden');
    });
    const cards = Array.isArray(cardsList) ? cardsList : Array.from(document.querySelectorAll('.settings-card'));
    cards.filter(Boolean).forEach((card) => {
      card.classList.remove('hidden');
    });
  }

/* -------------------------------------------------------------------------- */
/* Tab setup                                                                  */
/* -------------------------------------------------------------------------- */
function initSettingsTabs(allowedIds = []) {
    if (!settingsTabs || !settingsTabButtons.length) {
      showSettingsCards();
      return;
    }
    settingsTabs.style.display = '';
    const allowedSet = new Set(allowedIds);
    settingsTabButtons.forEach((button) => {
      const targetId = button.dataset.target;
      const allowed = targetId === 'all' || allowedSet.has(targetId);
      button.classList.toggle('hidden', !allowed);
    });
    const firstVisible = settingsTabButtons.find((button) => !button.classList.contains('hidden'));
    if (firstVisible) {
      activateSettingsTab(firstVisible.dataset.target, allowedIds);
    } else {
      showSettingsCards();
    }
    if (settingsTabsReady) return;
    settingsTabsReady = true;
    settingsTabs.addEventListener('click', (event) => {
      const button = event.target.closest('.settings-tab');
      if (!button || button.classList.contains('hidden')) return;
      const targetId = button.dataset.target;
      if (targetId) {
        activateSettingsTab(targetId, allowedIds);
      }
    });
  }

  function activateSettingsTab(targetId, allowedIds = []) {
    if (!targetId) return;
    if (targetId === 'all') {
      const cards = allowedIds.map((id) => document.getElementById(id)).filter(Boolean);
      showSettingsCards(cards);
    } else {
      const targetCard = document.getElementById(targetId);
      showSettingsCards([targetCard]);
    }
    settingsTabButtons.forEach((button) => {
      button.classList.toggle('settings-tab--active', button.dataset.target === targetId);
    });
  }

  return {
    initSettingsTabs,
    activateSettingsTab
  };
}

export {
  createSettingsTabsManager
};
