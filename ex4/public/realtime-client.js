// Client realtime cua ShopFast (nhung vao trang web).
// Khong de nguoi dung mat ket noi dot ngot khi trien khai:
// - Nhan thong diep "reconnect" -> tu mo ket noi moi sau retryAfterMs (ngau nhien),
//   nginx se dua ket noi moi sang moi truong dang active.
// - Mat ket noi bat ngo -> thu lai voi exponential backoff + jitter.
(function () {
  let socket;
  let attempt = 0;

  function connect() {
    const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
    socket = new WebSocket(url);

    socket.onopen = function () {
      attempt = 0;
    };

    socket.onmessage = function (event) {
      const msg = JSON.parse(event.data);
      if (msg.type === 'reconnect') {
        // Mo ket noi moi truoc, dong ket noi cu sau -> nguoi dung khong thay gian doan
        const old = socket;
        setTimeout(function () {
          connect();
          setTimeout(function () { old.close(1000); }, 1000);
        }, msg.retryAfterMs);
        return;
      }
      window.dispatchEvent(new CustomEvent('shopfast:realtime', { detail: msg }));
    };

    socket.onclose = function (event) {
      if (event.code === 1000) return; // client tu dong
      const delay = Math.min(30000, 500 * Math.pow(2, attempt++)) + Math.random() * 1000;
      setTimeout(connect, delay);
    };
  }

  connect();
})();
