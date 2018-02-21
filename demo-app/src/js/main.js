var localStream;
var pc;
var localUserId;
var socket;
var room = 'demo-room';
var pcs = {};
var isPolling = false;

var endpointInfo = {
    type: "browser", // "browser""native""plugin""middlebox"
    os: "Mac OS",
    osVersion: "12",
    buildName: "chrome", //chrome, firefox , edge
    buildVersion: "46", //
    appVersion: "1.0.0",
};

var startButton = document.getElementById('startButton');
var callButton = document.getElementById('callButton');
var hangupButton = document.getElementById('hangupButton');
var remoteVideo = document.getElementById('remoteVideo');

callButton.disabled = true;
hangupButton.disabled = true;

// Signalling related code

function handleUserJoined(userId) {
  console.log('handleUserJoined ', userId);
  var offerOptions = {
    offerToReceiveAudio: 1,
    offerToReceiveVideo: 1
  };
  var pc = createPeerConnection(userId);
  socket.emit('callstats', callstatsEvents.addFabric, room, localUserId, userId, endpointInfo);
  var domError = {
    message: 'getusermedia error',
    name: 'media error'
  };
  socket.emit('callstats', callstatsEvents.reportError, localUserId, 'getUserMedia', domError);
  pc.createOffer(offerOptions)
  .then( (desc) => {
    onCreateOfferSuccess(desc, userId);
  })
  .catch(err => {
    console.log('createOffer error' ,err);
  });
}

function handleMessage(userId, msg) {
  var pc;
  if (pcs[userId]) {
    pc = pcs[userId];
  } else {
    pc = createPeerConnection(userId);
    socket.emit('callstats', callstatsEvents.addFabric, room, localUserId, userId, endpointInfo);
    var domError = {
      message: 'getusermedia error',
      name: 'media error'
    };
    socket.emit('callstats', callstatsEvents.reportError, localUserId, 'getUserMedia', domError);
  }

  var json = JSON.parse(msg);
  if (json.ice) {
    pc.addIceCandidate(json.ice)
    .then(() => {
      console.log('Ice candidate added successfully');
    })
    .catch(err => {
      console.log('addIceCandidate failure');
    });
  }
  if (json.offer) {
    var offer = new RTCSessionDescription(json.offer);
    pc.setRemoteDescription(offer)
    .then(value => {
      if (pc.remoteDescription.type === 'offer') {
        console.log(userId, 'offer received');
        pc.createAnswer()
        .then(value => {
          onCreateOfferSuccess(value, userId);
        })
        .catch(err => {
          console.log('createAnswer error');
        })
      } else {
        console.log(userId, 'answer received');
      }
    })
    .catch(err => {
      console.log('setRemoteDescription error');
    });
  }
}

function initSignaling() {
  socket = io.connect();
  socket.on('connect', function(data) {
    console.log('socket io connected');
    localUserId = socket.id;
  });

  // hear from others
  socket.on('join', function(userId) {
    console.log(userId, 'user joining');
    handleUserJoined(userId);
  });

  socket.on('leave', function(userId) {
    console.log(userId, 'user leaving');
    handleUserLeft(userId);
  });

  socket.on('message', function(userId, message) {
    handleMessage(userId, message);
  });

  socket.emit('callstats', callstatsEvents.startConference, room);
}
initSignaling();

function sendUserJoined() {
  // annouce your presence
  console.log('Joining', localUserId);
  socket.emit('join', room, localUserId);
}

function sendUserLeft() {
  socket.emit('leave', localUserId);
}

function sendMessage(to, msg) {
  socket.emit('message', localUserId, to, msg);
}

// END Signalling related code

// obtains the stream from webcam
function start() {
  var localVideo = document.getElementById('localVideo');
  startButton.disabled = true;
  navigator.mediaDevices.getUserMedia({
    audio: true,
    video: true,
  })
  .then(stream => {
    console.log('getUserMedia success');
    localVideo.srcObject = stream;
    localStream = stream;
    callButton.disabled = false;
  })
  .catch(err => {
    console.log('getUserMedia error', err);
  })
}

// initiate the call - Signalling and peerconnection creation
function call() {
  callButton.disabled = true;
  hangupButton.disabled = false;
  sendUserJoined(localUserId);
}

// clean up the peerconnection on hang up.
function hangup() {
  for (var userId in pcs) {
    console.log(userId, 'remove');
    sendUserLeft(userId)
    if (pcs[userId]) {
      pcs[userId].close();
      delete pcs[userId];
    }
  }
}

function startStatsPolling(pc) {
  getStats(pc, function(stats) {
    socket.emit('callstats', callstatsEvents.stats, localUserId, stats);
    setTimeout(function() {
      startStatsPolling(pc);
    }, 10000);
  });
}

function onIceConnectionStateChange() {
  socket.emit('callstats', callstatsEvents.iceGatheringStateChange, localUserId, this.iceGatheringState);
  var state = this.iceConnectionState;
  getIceCandidatesfromStats(this, function(obj) {
    socket.emit('callstats', callstatsEvents.iceConnectionStateChange, localUserId, state, obj);
  });
  if (state === 'connected' || state === 'completed') {
    console.log("trying to send SDP", this);
    var localSDP = this["localDescription"].sdp;
    var remoteSDP = this["remoteDescription"].sdp;
    console.log("send SDP");
    socket.emit('callstats', callstatsEvents.sdp, localUserId, localSDP, remoteSDP);
    if (isPolling) {
      return;
    }
    isPolling = true;
    startStatsPolling(this);
  }
}

function onSignalingStateChange() {
  console.log('onSignalingStateChange', this);
  socket.emit('callstats', callstatsEvents.signalingStateChange, localUserId, this.signalingState);
}

function createPeerConnection(userId) {
  var pc = new RTCPeerConnection();
  pc.onicecandidate = onIceCandidate; // Ice candidate event handler
  pc.oniceconnectionstatechange = onIceConnectionStateChange;
  pc.onsignalingstatechange = onSignalingStateChange;
  pc.addStream(localStream); // adding the localStream on to the peerconnection
  pc.onaddstream = gotRemoteStream; // setting the add stream event listener
  pcs[userId] = pc;
  collectConnectedDevices(function (devices) {
    socket.emit('callstats',callstatsEvents.connectedDevices, localUserId, devices);
    sendFeedback();
  });
  return pc;
}

function onCreateOfferSuccess(desc, userId) {
  var pc = pcs[userId];
  pc.setLocalDescription(desc)
  .then(value => {
    var json = {'offer': desc};
    var str = JSON.stringify(json);
    console.log('pc setLocalDescription success');
    sendMessage(userId, str);
  })
  .catch(err => {
    console.log('pc setLocalDescription error' ,err);
  })
  // send description to the server
}

function gotRemoteStream(e) {
  remoteVideo.srcObject = e.stream;
  console.log('pc received remote stream');
}

function onIceCandidate(e) {
  pc = e.srcElement;
  var userId = getUserId(pc);
  if (e.candidate) {
    // send ICE candidate
    var json = {'ice': e.candidate};
    var str = JSON.stringify(json);
    console.log('sending ICE', e);
    sendMessage(userId, str);
  }
}

function getUserId(pc) {
  for(userId in pcs) {
    if (pcs[userId] === pc) {
      console.log('userId found', userId);
      return userId;
    }
  }
}

window.onbeforeunload = function() {
  if (socket) {
    socket.emit('close', localUserId, room);
  }
  return;
}

function sendFeedback() {
  var feedback = {
    overallRating: 1,
    videoQualityRating: 1,
    audioQualityRating: 1,
    comments: "ok ok"
  };
  socket.emit('callstats',callstatsEvents.userFeedback, room, localUserId, feedback);
}
