const STORAGE_KEY = "danmuOverlayEnabled";
const toggle = document.getElementById("enabledToggle");
const statusText = document.getElementById("statusText");

function render(enabled) {
  toggle.checked = enabled;
  statusText.textContent = enabled ? "On" : "Off";
}

chrome.storage.local.get({ [STORAGE_KEY]: false }, (values) => {
  render(Boolean(values[STORAGE_KEY]));
});

toggle.addEventListener("change", () => {
  const enabled = toggle.checked;
  render(enabled);
  chrome.storage.local.set({ [STORAGE_KEY]: enabled });
});
