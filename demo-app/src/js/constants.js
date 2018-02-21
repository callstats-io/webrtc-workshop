var callstatsEvents = {
  startConference: 'startConference',
  addFabric: 'addFabric',
  iceConnectionStateChange: 'iceConnectionStateChange',
  iceGatheringStateChange: 'iceGatheringStateChange',
  signalingStateChange: 'signalingStateChange',
  sdp: 'sdp',
  connectedDevices: 'connectedDevices',
  reportError: 'reportError',
  userFeedback: 'userFeedback',
  stats: 'stats',
};
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
  module.exports = callstatsEvents;
}
