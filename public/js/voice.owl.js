// voice.owl.js
// Lightweight WebRTC voice chat client for GAMBOWL (owl)
// Expects socket.io client available as io()
// Usage:
//   const vc = new VoiceChatOwl({ socketUrl: '/', roomId, userId, iceServers: [...] });
//   await vc.start();
//   vc.mute(); vc.unmute(); vc.stop();

class VoiceChat {
  constructor({ socketUrl = "/", roomId, userId, iceServers = [{ urls: "stun:stun.l.google.com:19302" }], debug = false } = {}) {
    this.socketUrl = socketUrl;
    this.roomId = roomId;
    this.userId = userId;
    this.iceServers = iceServers;
    this.socket = null;
    this.localStream = null;
    this.peers = {}; // peerId -> { pc, audioEl }
    this.debug = debug;
    this.started = false;
    this.muted = true;
  }

  log(...args) { if (this.debug) console.log("[VoiceChat owl]", ...args); }

  async start() {
    if (this.started) return;
    this.started = true;
    // get microphone
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.muted = false;
    } catch (err) {
      this.log("getUserMedia failed", err);
      throw err;
    }

    // connect socket.io
    this.socket = (typeof io === "function") ? io(this.socketUrl) : null;
    if (!this.socket) throw new Error("socket.io client (io) not found");

    this.socket.on("connect", () => this.log("socket connected", this.socket.id));
    this.socket.on("voice-users", (users) => this._handleVoiceUsers(users)); // initial list
    this.socket.on("voice-user-joined", (userId) => this._handleUserJoined(userId));
    this.socket.on("voice-user-left", (userId) => this._handleUserLeft(userId));
    this.socket.on("voice-offer", async ({ from, offer }) => this._handleOffer(from, offer));
    this.socket.on("voice-answer", async ({ from, answer }) => this._handleAnswer(from, answer));
    this.socket.on("voice-ice-candidate", async ({ from, candidate }) => this._handleRemoteCandidate(from, candidate));

    this.socket.emit("voice-join", { roomId: this.roomId, userId: this.userId });
  }

  stop() {
    // close peers
    for (const id of Object.keys(this.peers)) {
      try { this.peers[id].pc.close(); } catch (e) {}
      this._removeAudioElement(id);
    }
    this.peers = {};

    if (this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop());
      this.localStream = null;
    }
    if (this.socket) {
      this.socket.emit("voice-leave", { roomId: this.roomId, userId: this.userId });
      this.socket.disconnect();
      this.socket = null;
    }
    this.started = false;
  }

  mute() {
    if (!this.localStream) return;
    this.localStream.getAudioTracks().forEach(t => t.enabled = false);
    this.muted = true;
  }

  unmute() {
    if (!this.localStream) return;
    this.localStream.getAudioTracks().forEach(t => t.enabled = true);
    this.muted = false;
  }

  async _handleVoiceUsers(users) {
    // users is array of userIds
    this.log("voice-users", users);
    for (const u of users) {
      if (u === this.userId) continue;
      if (!this.peers[u]) {
        await this._createPeerConnection(u, true); // initiator
      }
    }
  }

  async _handleUserJoined(userId) {
    this.log("user joined", userId);
    if (userId === this.userId) return;
    if (!this.peers[userId]) {
      await this._createPeerConnection(userId, true);
    }
  }

  _handleUserLeft(userId) {
    this.log("user left", userId);
    if (this.peers[userId]) {
      try { this.peers[userId].pc.close(); } catch (e) {}
      this._removeAudioElement(userId);
      delete this.peers[userId];
    }
  }

  async _createPeerConnection(peerId, isInitiator = false) {
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    // add local tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => pc.addTrack(track, this.localStream));
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.socket.emit("voice-ice-candidate", { to: peerId, from: this.userId, candidate: e.candidate });
      }
    };

    pc.ontrack = (e) => {
      this.log("ontrack from", peerId, e.streams);
      const remoteStream = e.streams[0];
      // create or reuse audio element
      let audio = document.getElementById(`audio-remote-owl-${peerId}`);
      if (!audio) {
        audio = document.createElement("audio");
        audio.id = `audio-remote-owl-${peerId}`;
        audio.autoplay = true;
        audio.controls = false;
        audio.style.display = "none";
        document.body.appendChild(audio);
      }
      audio.srcObject = remoteStream;
      this.peers[peerId].audioEl = audio;
    };

    pc.onconnectionstatechange = () => {
      this.log("pc state", peerId, pc.connectionState);
      if (pc.connectionState === "failed" || pc.connectionState === "closed" || pc.connectionState === "disconnected") {
        this._handleUserLeft(peerId);
      }
    };

    // store
    this.peers[peerId] = { pc, audioEl: null };

    if (isInitiator) {
      // create offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.socket.emit("voice-offer", { to: peerId, from: this.userId, offer: pc.localDescription });
    }
  }

  async _handleOffer(from, offer) {
    this.log("offer from", from);
    if (!this.peers[from]) {
      await this._createPeerConnection(from, false);
    }
    const pc = this.peers[from].pc;
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    this.socket.emit("voice-answer", { to: from, from: this.userId, answer: pc.localDescription });
  }

  async _handleAnswer(from, answer) {
    this.log("answer from", from);
    const pc = this.peers[from] && this.peers[from].pc;
    if (!pc) return;
    await pc.setRemoteDescription(new RTCSessionDescription(answer));
  }

  async _handleRemoteCandidate(from, candidate) {
    this.log("candidate from", from);
    const pc = this.peers[from] && this.peers[from].pc;
    if (!pc) return;
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      this.log("addIceCandidate failed", e);
    }
  }

  _removeAudioElement(peerId) {
    const el = document.getElementById(`audio-remote-owl-${peerId}`);
    if (el) {
      try { el.srcObject = null; el.remove(); } catch (e) {}
    }
  }
}

// Expose a factory for convenience
window.VoiceChatOwl = VoiceChat;
