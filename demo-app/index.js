var express = require('express');
var http = require('http');
var socketIO = require('socket.io');
var Callstats = require("node-callstats/callstats");
var callstatsEvents = require("./src/js/constants");
var conferences = [];
var fabrics = [];

var appID = 'appID'; // eslint-disable-line
var appSecret = 'appSecret'; // eslint-disable-line
var callStats = new Callstats(appID, appSecret, 'endpointID'); // eslint-disable-line

var app = express();
app.root = __dirname;
app.use("/", express.static(__dirname + '/src'));

var server = http.createServer(app);
server.listen(8080);

var io = socketIO.listen(server);
console.log('IO created');

io.sockets.on('connection', function(socket) {
  socket.on('join', function(room, userId) {
    leaveRoom(socket);
    console.log(userId, 'joins', room);
    socket.join(room);
    socket.room = room;
    socket.broadcast.to(room).emit('join', userId);
  });

  socket.on('leave', function(userId) {
    leaveRoom(socket, userId);
  });

  socket.on('message', function(from, to, message) {
    socket.to(to).emit('message', from, message);
  });

  socket.on('callstats', function() {
    handleCallstatsEvent(arguments);
  });

  socket.on('close', function(localUserId, conferenceId) {
    var conference = conferences[conferenceId];
    if (conference) {
        conference.close();
    }
    delete conferences[conferenceId];
  });
});

function getCurrent() {
  if (!window || !window.performance || !window.performance.now) {
    return Date.now();
  }
  if (!window.performance.timing) {
    return Date.now();
  }
  if (!window.performance.timing.navigationStart) {
    return Date.now();
  }
  return window.performance.now() + window.performance.timing.navigationStart;
}

function leaveRoom(socket) {
  if (!socket.room) {
    return;
  }

  var room = socket.room;
  console.log(id, 'leaves', room);
  socket.broadcast.to(room).emit('leave', userId);
  socket.leave(room);
  socket.room = null;
}

function startConference(args) {
  var timestamp = getCurrent();
  var conferenceId = args[1];

  var conference = conferences[conferenceId];
  if (conference) {
    console.log('conference exists');
    return;
  }
  conference = callStats.createConference(conferenceId, timestamp);
  conferences[conferenceId] = conference;
}

function addFabric(args) {
  var timestamp = getCurrent();
  var conferenceId = args[1];
  var localUserId = args[2];
  var remoteUserId = args[3];
  var endpointInfo = args[4];
  var conference = conferences[conferenceId];
  var fabric = fabrics[localUserId];
  if (!conference || fabric) {
    console.log('conference does not exists, create one/ fabric exists', conferenceId);
    return;
  }
  var message = {
    message: "Adding fabric "+localUserId,
    name: "debug log",
  };
  conference.sendLog(localUserId, 'info', message, timestamp);
  var fabric = conference.addFabric(localUserId, remoteUserId, timestamp, endpointInfo);
  fabrics[localUserId] = fabric;
}

function iceConnectionStateChange(args) {
  var timestamp = getCurrent();
  var localUserId = args[1];
  var state = args[2];
  var fabric = fabrics[localUserId];
  if (!fabric) {
    console.log('iceConnectionStateChange: fabric does not exists');
    return;
  }
  var candidates = args[3];
  if (candidates) {
    fabric.sendIceConnectionStateChangeEvent(state, timestamp, candidates.localCandidates,
      candidates.remoteCandidates, candidates.iceCandidatePairs);
  } else {
    fabric.sendIceConnectionStateChangeEvent(state, timestamp);
  }
}

function iceGatheringStateChange(args) {
  var timestamp = getCurrent();
  var localUserId = args[1];
  var state = args[2];
  var fabric = fabrics[localUserId];
  if (!fabric) {
    console.log('iceGatheringStateChange: fabric does not exists');
    return;
  }
  fabric.sendIceGatheringStateChangeEvent(state, timestamp);
}

function signalingStateChange(args) {
  console.log('signalingStateChange args', args);
  var timestamp = getCurrent();
  var localUserId = args[1];
  var state = args[2];
  var fabric = fabrics[localUserId];
  if (!fabric) {
    console.log('signalingStateChange: fabric does not exists');
    return;
  }
  fabric.sendSignallingStateChangeEvent(state, timestamp);
}

const streamType = {
  inbound: 'inbound',
  outbound: 'outbound',
};

function handleSDP(args) {
  var timestamp = getCurrent();
  var localUserId = args[1];
  var fabric = fabrics[localUserId];
  if (!fabric) {
    console.log('signalingStateChange: fabric does not exists');
    return;
  }
  var eventValue = {
    localSDP: args[2],
    remoteSDP: args[3],
  };
  fabric.sendEvent("sdpSubmission", timestamp, eventValue);
  fabric.sendEvent("audioMute", timestamp);
  parseSDP(eventValue.localSDP, streamType.outbound, localUserId);
  parseSDP(eventValue.remoteSDP, streamType.inbound, localUserId);
  var ssrcData = [];
  ssrcMap.forEach(function(data, ssrc) {
    if (data.msid && data.mslabel && data.label) {
      ssrcData.push(data);
    }
  });
  fabric.sendSSRCData(ssrcData, timestamp);
}

function handleConnectedDevices(args) {
  var timestamp = getCurrent();
  var localUserId = args[1];
  var fabric = fabrics[localUserId];
  if (!fabric) {
    console.log('signalingStateChange: fabric does not exists');
    return;
  }
  var devices = args[2];
  fabric.sendEvent('connectedDeviceList', timestamp, {connectedDevices: devices});
}

function handleUserFeedback(args) {
  var timestamp = getCurrent();
  var conferenceId = args[1];
  var localUserId = args[2];
  var feedback = args[3];
  var conference = conferences[conferenceId];
  if (!conference) {
    console.log('handleUserFeedback: conference does not exists');
    return;
  }
  conference.sendFeedback(localUserId, {feedback: feedback}, timestamp);
}

function handleReportError(args) {
  console.log('handleReportError ', args);
  var timestamp = getCurrent();
  var localUserId = args[1];
  var funcName = args[2];
  var domError = args[3];
  var fabric = fabrics[localUserId];
  if (!fabric) {
    console.log('signalingStateChange: fabric does not exists');
    return;
  }
  fabric.reportError(funcName, domError, timestamp);
}

function handleStats(args) {
  var timestamp = getCurrent();
  var localUserId = args[1];
  var stats = args[2];
  var fabric = fabrics[localUserId];
  if (!fabric) {
    console.log('signalingStateChange: fabric does not exists');
    return;
  }
  fabric.sendStats(stats, timestamp);
}

let ssrcMap = new Map();

function parseSDP(sdp, sdpType, userId) {
  let validLine = RegExp.prototype.test.bind(/^([a-z])=(.*)/);
  let ssrcReg = /^ssrc:(\d*) ([\w_]*):(.*)/;
  let simGroupReg = /^ssrc-group:SIM (\d*)/;

  sdp.split(/(\r\n|\r|\n)/).filter(validLine).forEach((val) => {
    let type = val[0];
    let content = val.slice(2);
    if (type !== 'a' || !ssrcReg.test(content)) {
      return;
    }
    let match = content.match(ssrcReg);
    let ssrc = match[1];
    let key = match[2]; // key can be cname, msid, mslable and label
    let value = match[3];
    let ssrcInfo = ssrcMap.get(ssrc);
    if (!ssrcInfo) {
      ssrcInfo = {};
    }

    ssrcInfo.ssrc = ssrc;
    ssrcInfo[key] = value;
    ssrcInfo.localStartTime = getCurrent();
    ssrcInfo.streamType = sdpType;
    ssrcInfo.userID = userId;

    if (!simGroupReg.test(content)) {
      ssrcMap.set(ssrc, ssrcInfo);
      return;
    }
    ssrcInfo.ssrcGroup = {};
    ssrcInfo.ssrcGroup[sdpType] = {};
    ssrcInfo.ssrcGroup[sdpType].simulcastGroup = content.match(/\d+/g);
    ssrcMap.set(ssrc, ssrcInfo);
  });
}

function handleCallstatsEvent(args) {
  var eventType = args[0];
  switch(eventType) {
    case callstatsEvents.startConference:
      startConference(args);
      break;
    case callstatsEvents.addFabric:
      addFabric(args);
      break;
    case callstatsEvents.iceConnectionStateChange:
      iceConnectionStateChange(args);
      break;
    case callstatsEvents.iceGatheringStateChange:
      iceGatheringStateChange(args);
      break;
    case callstatsEvents.signalingStateChange:
      signalingStateChange(args);
      break;
    case callstatsEvents.stats:
      handleStats(args);
      break;
    case callstatsEvents.sdp:
      handleSDP(args);
      break;
    case callstatsEvents.connectedDevices:
      handleConnectedDevices(args);
      break;
    case callstatsEvents.userFeedback:
      handleUserFeedback(args);
      break;
    case callstatsEvents.reportError:
      handleReportError(args);
      break;
    default:
      break;
  }
}
