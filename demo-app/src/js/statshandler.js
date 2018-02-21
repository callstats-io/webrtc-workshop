var getResultsfromStats = function(stats) {
  if (!stats) {
    return;
  }
  var results = [];
  var i = 0;

  if (stats && stats.result){
    results = stats.result();
  } else if (stats && stats.forEach) {
    stats.forEach(function (item) {
      results.push(item);
    });
  } else {
    for (i in stats) {
      if (stats.hasOwnProperty(i)) {
        results.push(stats[i]);
      }
    }
  }
  return results;
};

function parseStats(obj) {
  var statsObj = {};
  var key;
  if (obj.timestamp instanceof Date) {
    statsObj.timestamp = obj.timestamp.getTime().toString();
  }

  if (obj.type) {
    statsObj.type = obj.type;
  }

  var i = 0;
  if (obj.names) {
    var names = obj.names();
    // statsString += 'names=[';
    for (i = 0; i < names.length; ++i) {
      statsObj[names[i]] = obj.stat(names[i]);
    }
    // statsString += ']';
  } else {
    for (key in obj) {
      if (obj.hasOwnProperty(key)) {
        statsObj[key] = obj[key];
      }
    }
  }
  // for react-native, values is a array of objects each contains a single stat value
  if (statsObj.values) {
    for (i = 0; i < statsObj.values.length; ++i) {
      obj = statsObj.values[i];
      for (key in obj) {
        if (obj.hasOwnProperty(key)) {
          statsObj[key] = obj[key];
        }
      }
    }
    delete statsObj.values;
  }

  return statsObj;
}

var parseIceCandidatesFromStats = function(stats) {
  var results = null;
  var _statsObj = null;
  var _statJSON = null;
  var localCandidates = [];
  var remoteCandidates = [];
  var iceCandidatePairs = [];
  var selectedCandidatePairId;
  var i = 0;

  results = getResultsfromStats(stats);
  if (!results) {
    return {localCandidates: localCandidates, remoteCandidates:remoteCandidates};
  }

  for (i = 0; i < results.length; ++i) {
    _statsObj = parseStats(results[i]);
    _statJSON = statClassifier(_statsObj);
    if (_statJSON.localCandidate) {
      _statJSON.localCandidate.transport = _statJSON.localCandidate.protocol;
      localCandidates.push(_statJSON.localCandidate);
    } else if (_statJSON.remoteCandidate) {
      _statJSON.remoteCandidate.transport = _statJSON.remoteCandidate.protocol
      remoteCandidates.push(_statJSON.remoteCandidate);
    } else if (_statJSON.Transport){
      if (_statJSON.Transport.type === "transport") {
        selectedCandidatePairId = _statJSON.Transport.selectedCandidatePairId;
        continue;
      }
      if (_statJSON.Transport.state === 'in-progress') {
        _statJSON.Transport.state = 'inprogress'
      }
      iceCandidatePairs.push(_statJSON.Transport);
    } else if (_statJSON.candidatePair) {
      if (_statJSON.candidatePair.state === 'in-progress') {
        _statJSON.candidatePair.state = 'inprogress'
      }
      iceCandidatePairs.push(_statJSON.candidatePair);
    }
  }
  if (selectedCandidatePairId) {
    for (i=0; i < iceCandidatePairs.length; i++) {
      if (iceCandidatePairs[i].id === selectedCandidatePairId) {
        iceCandidatePairs[i].googActiveConnection = "true";
      }
    }
  }
  return {localCandidates: localCandidates, remoteCandidates:remoteCandidates, iceCandidatePairs:iceCandidatePairs};
};


/**
 * @memberOf callstats
 * trying to normalize the stats attribute names
 */
function statClassifier(obj) {
  var retObj = { };
  if (obj.type === "inboundrtp" || obj.type === "outboundrtp" || obj.type === "inbound-rtp" || obj.type === "outbound-rtp") {
    retObj.ssrc = obj.ssrc;
    retObj.streamType = (obj.type === "inboundrtp" || obj.type === "inbound-rtp") ? "inbound" : "outbound";
    retObj.data = obj;

    if (obj.isRemote !== undefined) {
      // a*****e firfox chnaged string to bool
      retObj.reportType = (obj.isRemote === "true" || obj.isRemote === true) ? "remote" : "local";
    } else {
      retObj.reportType = "local";
    }
    if (obj.trackId) {
      retObj.trackId = obj.trackId;
    }
    if (obj.mediaType) {
      retObj.mediaType = obj.mediaType;
    }
  } else if (obj.type === "candidatepair" && obj.selected) {
    retObj.Transport = obj;
  } else if (obj.type === "localcandidate" || obj.type === "local-candidate") {
    retObj.localCandidate = obj;
  } else if (obj.type === "remotecandidate" || obj.type === "remote-candidate") {
    retObj.remoteCandidate = obj;
  } else if (obj.type === "transport" || obj.type === "googCandidatePair") {
    retObj.Transport = obj;
  } else if (obj.type === "VideoBwe") {
    retObj.bwe = obj;
  } else if (obj.type === "track") {
    retObj.trackStats = obj;
  } else if (obj.type === "candidate-pair") {
    retObj.candidatePair = obj;
  } else if (obj.type === "codec") {
    retObj.codec = obj;
  } else if (obj.type === "ssrc") {
    retObj.reportType = "local";
    if (obj.bytesSent) {
      retObj.streamType = "outbound";
    } else {
      retObj.streamType = "inbound";
    }
    retObj.ssrc = obj.ssrc;
    retObj.data = obj;
  }
  return retObj;
}

var getIceCandidatesfromStatsHandler = function(callback) {
  function onFabricStats(stats) {
    var candidatesObj = {};
    candidatesObj = parseIceCandidatesFromStats(stats);
    callback(candidatesObj);
  }
  return onFabricStats;
};

var getStatsHandler = function(callback) {
  function onFabricStats(stats) {
    var results = getResultsfromStats(stats);
    console.log("getStats - ",results);
    callback(results);
  }
  return onFabricStats;
};

function getIceCandidatesfromStats(pc, callback) {
  try {
    pc.getStats()
    .then(getIceCandidatesfromStatsHandler(callback))
    .catch(err => {})
  } catch(e) {
    console.log("csioGetStats: Error",e); /*RemoveLogging:skip*/
  }
}

function getStats(pc, callback) {
  try {
    pc.getStats()
    .then(getStatsHandler(callback))
    .catch(err => {})
  } catch(e) {
    console.log("csioGetStats: Error",e); /*RemoveLogging:skip*/
  }
}
