// No default_popup in the manifest, so clicking the toolbar icon fires this.
// The library manager needs a full tab, not a 600px popup.
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
});
