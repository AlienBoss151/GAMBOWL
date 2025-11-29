# Voice Chat (owl) — setup notes for GAMBOWL

This document explains how to wire up the simple WebRTC voice chat included in voice.owl.js and voice-signaling.owl.js.

1) Server
- If you already use socket.io on the server, require and attach the signaling module:
  const io = require('socket.io')(server);
  require('./server/voice-signaling.owl.js')(io);
- If you use a namespace for game sockets, pass that namespace:
  require('./server/voice-signaling.owl.js')(io, { namespace: '/game' });

2) Client
- Include socket.io client and voice.owl.js in your page:
  <script src="/socket.io/socket.io.js"></script>
  <script src="/js/voice.owl.js"></script>
- Init and start:
  const vc = new VoiceChatOwl({ socketUrl: '/', roomId: CURRENT_ROOM_ID, userId: CURRENT_USER_ID, iceServers: [{ urls: 'stun:stun.example.org' }, { urls: 'turn:turn.example.org', username: 'user', credential: 'pass' }], debug: true });
  await vc.start();
- Use vc.mute(), vc.unmute(), vc.stop() as needed. Hook UI buttons to those.

3) Important production notes
- TURN server: For many NATs/firewalls you must run a TURN server (coturn recommended) and include the TURN credentials in iceServers.
- Scale: The provided mesh approach (N-1 peer connections per participant) is fine for small rooms (4-8 users). For larger rooms use an SFU (mediasoup, Janus, Jitsi, LiveKit) to avoid network overload.
- Permissions: Browsers require user permission for microphone. Handle errors gracefully.
- Security: Only allow voice in authenticated rooms; verify room membership on the server before broadcasting joins. Consider rate-limiting or abuse controls.
- UI: Create mute icons per participant, and show connection state. Add audio volume controls if needed.

4) Testing
- Test locally with two browser windows on same LAN first.
- Test across network boundaries to ensure TURN is used when needed.

If you want, I can:
- Push these files into feature/voice-chat (I’ve already created the branch) and open a PR.
- Wire the server module into your startup script and add script include lines to the room page.
- Add a small UI for join/leave and mute/unmute.

Tell me which of those you'd like and provide the namespace / path / TURN credentials if needed.
