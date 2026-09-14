/* 
 [処理内容]
 ツールバーのアイコンがクリックされた際、画面右側にサイドパネルを開きます。
*/
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});