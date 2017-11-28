var localStream;

var pc;

var startButton = document.getElementById('startButton');
var callButton = document.getElementById('callButton');
var hangupButton = document.getElementById('hangupButton');
var remoteVideo = document.getElementById('remoteVideo');
var localUserId;
var socket;
var room = 'demo-room';
var pcs = {};

callButton.disabled = true;
hangupButton.disabled = true;

function handleUserJoined(userId) {
  console.log('handleUserJoined ', userId);
  var offerOptions = {
    offerToReceiveAudio: 1,
    offerToReceiveVideo: 1
  };
  var pc = createPeerConnection(userId);
  pc.createOffer(offerOptions)
  .then( (desc) => {
    onCreateOfferSuccess(desc, userId);
  })
  .catch(err => {
    console.log('createOffer error' ,err);
  });
}

function handleMessage(userId, msg) {
  console.log('handleMessage ', userId, msg);
  var pc;
  if (pcs[userId]) {
    pc = pcs[userId];
  } else {
    pc = createPeerConnection(userId);
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

function call() {
  callButton.disabled = true;
  hangupButton.disabled = false;
  sendUserJoined(localUserId);
}

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

function createPeerConnection(userId) {
  var pc = new RTCPeerConnection();
  pc.onicecandidate = onIceCandidate;
  pc.addStream(localStream);
  pc.onaddstream = gotRemoteStream;
  pcs[userId] = pc;
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
