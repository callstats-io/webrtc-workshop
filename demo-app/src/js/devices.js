function normalizeMediaDeviceList(mediaDeviceList) {
  let devices = [];
  if (!mediaDeviceList) {
    return devices;
  }
  for (let i = 0; i < mediaDeviceList.length; i++) {
    let mediaDevice = {};
    mediaDevice.mediaDeviceID = mediaDeviceList[i].deviceId;
    mediaDevice.groupID = mediaDeviceList[i].groupId;
    mediaDevice.kind = mediaDeviceList[i].kind;
    mediaDevice.label = mediaDeviceList[i].label;
    devices.push(mediaDevice);
  }
  return devices;
}

function collectConnectedDevices(callback) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
    return;
  }
  navigator.mediaDevices.enumerateDevices()
  .then((devices) => {
    console.log('got devices ', devices);
    devices = normalizeMediaDeviceList(devices);
    callback(devices);
  }).catch((e) => {
  });
}
