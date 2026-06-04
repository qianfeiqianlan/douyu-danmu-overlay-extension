const STREAM_SELECTOR = ".stream__T55I3";
const STAGE_CLASS = "dy-danmu-stage";
const DANMU_CLASS = "dy-danmu-item";
const STORAGE_KEY = "danmuOverlayEnabled";

const colorTab = {
  "0": "#ffffff",
  "1": "#ff2e2e",
  "2": "#00ccff",
  "3": "#66ff00",
  "4": "#ff6600",
  "5": "#cc00ff",
  "6": "#f6447f"
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

let mountedTarget = null;
let stage = null;
let client = null;
let currentRoomId = null;
let mockTimer = null;
let mockIndex = 0;
let overlayEnabled = false;

const fallbackMessages = [
  { text: "waiting for live danmu...", color: "#ffffff" },
  { text: "check room id and websocket permission", color: "#00ccff" },
  { text: "overlay is mounted on stream area", color: "#66ff00" }
];

function escapeStt(value) {
  return String(value).replace(/@/g, "@A").replace(/\//g, "@S");
}

function unescapeStt(value) {
  return String(value).replace(/@S/g, "/").replace(/@A/g, "@");
}

function serializeStt(value) {
  if (value == null) {
    throw new Error("Cannot serialize null value");
  }

  if (Array.isArray(value)) {
    return value.map(serializeStt).join("");
  }

  if (typeof value === "object") {
    return Object.entries(value)
      .map(([key, val]) => `${key}@=${serializeStt(val)}`)
      .join("");
  }

  return `${escapeStt(value)}/`;
}

function deserializeStt(raw) {
  if (raw.includes("//")) {
    return raw
      .split("//")
      .filter(Boolean)
      .map(deserializeStt);
  }

  if (raw.includes("@=")) {
    return raw
      .split("/")
      .filter(Boolean)
      .reduce((obj, part) => {
        const [key, val] = part.split("@=");
        obj[key] = val ? deserializeStt(val) : "";
        return obj;
      }, {});
  }

  return unescapeStt(raw);
}

function concatBuffers(...buffers) {
  const views = buffers.map((buffer) => (buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)));
  const length = views.reduce((sum, view) => sum + view.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;

  for (const view of views) {
    result.set(view, offset);
    offset += view.length;
  }

  return result;
}

function encodePacket(message) {
  const payload = concatBuffers(encoder.encode(serializeStt(message)), Uint8Array.of(0));
  const packetLength = 8 + payload.length;
  const buffer = new ArrayBuffer(packetLength + 4);
  const view = new DataView(buffer);

  view.setUint32(0, packetLength, true);
  view.setUint32(4, packetLength, true);
  view.setInt16(8, 689, true);
  view.setInt8(10, 0);
  view.setInt8(11, 0);
  new Uint8Array(buffer).set(payload, 12);

  return buffer;
}

function createPacketDecoder(onPacket) {
  let buffer = new ArrayBuffer(0);
  let readLength = 0;

  return function decodePacket(nextBuffer) {
    buffer = concatBuffers(buffer, nextBuffer).buffer;

    while (buffer.byteLength > 0) {
      if (readLength === 0) {
        if (buffer.byteLength < 4) {
          return;
        }

        readLength = new DataView(buffer).getUint32(0, true);
        buffer = buffer.slice(4);
      }

      if (buffer.byteLength < readLength) {
        return;
      }

      const rawMessage = decoder.decode(buffer.slice(8, readLength - 1));
      buffer = buffer.slice(readLength);
      readLength = 0;
      onPacket(rawMessage);
    }
  };
}

function randomDanmuUrl() {
  const port = 8501 + Math.floor(Math.random() * 6);
  return `wss://danmuproxy.douyu.com:${port}/`;
}

function parseRoomId() {
  const pathRoomId = location.pathname.match(/^\/(\d+)(?:\/|$)/)?.[1];

  if (pathRoomId) {
    return Number(pathRoomId);
  }

  const html = document.documentElement.innerHTML;
  const candidates = [
    /"room_id"\s*:\s*"?(\d+)"?/,
    /"rid"\s*:\s*"?(\d+)"?/,
    /room_id\s*=\s*["']?(\d+)["']?/,
    /rid\s*=\s*["']?(\d+)["']?/
  ];

  for (const pattern of candidates) {
    const match = html.match(pattern);

    if (match?.[1]) {
      return Number(match[1]);
    }
  }

  return null;
}

function ensurePositioned(element) {
  const position = window.getComputedStyle(element).position;

  if (position === "static") {
    element.style.position = "relative";
  }
}

function findStreamElement() {
  return document.querySelector(STREAM_SELECTOR);
}

function getLaneTop(target) {
  const height = Math.max(target.clientHeight, 120);
  const laneHeight = 34;
  const maxLaneCount = Math.max(1, Math.floor(height / laneHeight));
  const lane = Math.floor(Math.random() * Math.min(maxLaneCount, 10));

  return 12 + lane * laneHeight;
}

function createDanmuElement(message, target) {
  const item = document.createElement("div");

  item.className = DANMU_CLASS;
  item.style.top = `${getLaneTop(target)}px`;
  item.style.animationDuration = `${8 + Math.random() * 4}s`;
  item.style.color = message.color || "#ffffff";
  item.textContent = message.text || "";
  item.addEventListener("animationend", () => item.remove(), { once: true });

  return item;
}

function pushDanmu(message) {
  if (!overlayEnabled) {
    return;
  }

  if (!stage || !mountedTarget || !document.contains(mountedTarget)) {
    remount();
  }

  if (!stage || !mountedTarget) {
    return;
  }

  stage.append(createDanmuElement(message, mountedTarget));
}

function startFallbackLoop() {
  if (mockTimer) {
    return;
  }

  mockTimer = window.setInterval(() => {
    const message = fallbackMessages[mockIndex % fallbackMessages.length];
    mockIndex += 1;
    pushDanmu(message);
  }, 1800);
}

function stopFallbackLoop() {
  if (mockTimer) {
    window.clearInterval(mockTimer);
    mockTimer = null;
  }
}

function createDanmuClient(roomId) {
  let ws = null;
  let heartbeatTimer = null;
  let reconnectTimer = null;
  let retryLeft = 10;
  let stopped = false;
  let decodePacket = createPacketDecoder((rawMessage) => {
    const message = deserializeStt(rawMessage);
    const messages = Array.isArray(message) ? message : [message];

    for (const item of messages) {
      if (item?.type === "chatmsg") {
        stopFallbackLoop();
        pushDanmu({
          text: item.txt,
          color: colorTab[item.col] || "#ffffff"
        });
      }
    }
  });

  function send(message) {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(encodePacket(message));
    }
  }

  function clearTimers() {
    if (heartbeatTimer) {
      window.clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }

    if (reconnectTimer) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function connect() {
    clearTimers();
    decodePacket = createPacketDecoder((rawMessage) => {
      const message = deserializeStt(rawMessage);
      const messages = Array.isArray(message) ? message : [message];

      for (const item of messages) {
        if (item?.type === "chatmsg") {
          stopFallbackLoop();
          pushDanmu({
            text: item.txt,
            color: colorTab[item.col] || "#ffffff"
          });
        }
      }
    });

    ws = new WebSocket(randomDanmuUrl());
    ws.binaryType = "arraybuffer";

    ws.addEventListener("open", () => {
      retryLeft = 10;
      send({ type: "loginreq", roomid: roomId });
      send({ type: "joingroup", rid: roomId, gid: -9999 });
      heartbeatTimer = window.setInterval(() => send({ type: "mrkl" }), 45_000);
    });

    ws.addEventListener("message", (event) => {
      if (event.data instanceof ArrayBuffer) {
        decodePacket(event.data);
      }
    });

    ws.addEventListener("close", () => {
      clearTimers();

      if (!stopped && retryLeft > 0) {
        retryLeft -= 1;
        reconnectTimer = window.setTimeout(connect, 3000);
      } else if (!stopped) {
        startFallbackLoop();
      }
    });

    ws.addEventListener("error", () => {
      ws?.close();
    });
  }

  connect();

  return {
    stop() {
      stopped = true;
      clearTimers();
      send({ type: "logout" });
      ws?.close();
      ws = null;
    }
  };
}

function ensureClient() {
  if (!overlayEnabled) {
    return;
  }

  const roomId = parseRoomId();

  if (!roomId) {
    if (client) {
      client.stop();
      client = null;
      currentRoomId = null;
    }

    startFallbackLoop();
    return;
  }

  if (roomId === currentRoomId && client) {
    return;
  }

  if (client) {
    client.stop();
  }

  currentRoomId = roomId;
  stopFallbackLoop();
  client = createDanmuClient(roomId);
}

function mount(target) {
  if (target === mountedTarget && stage?.isConnected) {
    return;
  }

  if (stage) {
    stage.remove();
  }

  mountedTarget = target;
  ensurePositioned(target);

  stage = document.createElement("div");
  stage.className = STAGE_CLASS;
  target.append(stage);
}

function remount() {
  if (!overlayEnabled) {
    return;
  }

  const target = findStreamElement();

  if (target) {
    mount(target);
  }

  ensureClient();
}

function disableOverlay() {
  stopFallbackLoop();

  if (client) {
    client.stop();
    client = null;
  }

  currentRoomId = null;

  if (stage) {
    stage.remove();
    stage = null;
  }

  mountedTarget = null;
}

function setOverlayEnabled(enabled) {
  if (overlayEnabled === enabled) {
    return;
  }

  overlayEnabled = enabled;

  if (overlayEnabled) {
    remount();
  } else {
    disableOverlay();
  }
}

const observer = new MutationObserver(remount);

observer.observe(document.documentElement, {
  childList: true,
  subtree: true
});

window.setInterval(remount, 1000);

chrome.storage.local.get({ [STORAGE_KEY]: false }, (values) => {
  setOverlayEnabled(Boolean(values[STORAGE_KEY]));
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes[STORAGE_KEY]) {
    return;
  }

  setOverlayEnabled(Boolean(changes[STORAGE_KEY].newValue));
});
