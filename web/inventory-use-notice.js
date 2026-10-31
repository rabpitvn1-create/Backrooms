(function () {
  const previous = window.backroomTurn;
  window.backroomTurn = function (raw) {
    const next = JSON.parse(raw);
    const notice = next.itemUseNotice;
    delete next.itemUseNotice;
    const result = previous.call(this, JSON.stringify(next));
    if (notice) {
      document.getElementById('status').textContent = notice;
      if (typeof window.backroomActionToast === 'function') window.backroomActionToast(notice);
    }
    return result;
  };
})();
